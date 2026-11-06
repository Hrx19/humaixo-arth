import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserModel, type UserDocument } from '../../models/User';
import { verifyToken } from '../middleware/verifyToken';
import {
  authenticateWithGitHub,
  authenticateWithGoogle,
  authenticateWithGoogleIdToken,
  OAuthServiceError,
  type OAuthCodeExchangeInput,
} from '../services/oauth-service';

const registrationSchema = z.object({
  name: z.string().trim()
    .min(1, 'Please enter your full name.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z.string().trim().toLowerCase()
    .email('Please enter a valid email address.')
    .max(254, 'Email address must be 254 characters or fewer.'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

const oauthCodeSchema = z.object({
  code: z.string().trim().min(1).max(4096),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().trim().min(1).max(300),
  redirectUri: z.string().trim().min(1).max(2048),
}).strict();

const googleIdTokenSchema = z.object({
  idToken: z.string().trim().min(100).max(8192),
}).strict();
const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
}).strict();

export const authRouter = Router();

// Limit password guessing and OAuth-code replay attempts by source IP.
authRouter.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Wait a few minutes and try again.',
    code: 'AUTH_RATE_LIMITED',
  },
}));

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function getErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendSession(response: Response, user: UserDocument) {
  const token = jwt.sign(
    { userId: user._id.toString() },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );

  return response.status(200).json({
    success: true,
    message: 'Sign-in successful.',
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      authProviders: user.authProviders ?? [],
    },
  });
}

function sendOAuthFailure(response: Response, error: unknown) {
  if (error instanceof OAuthServiceError) {
    return response.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
  }

  logger.error('OAuth sign-in failed unexpectedly.', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: getErrorDetails(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return response.status(500).json({
    success: false,
    error: 'Could not complete social sign-in. Please try again.',
    code: 'OAUTH_SIGN_IN_FAILED',
  });
}

function getCallbackQueryValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * GitHub OAuth Apps require their registered callback to be HTTPS. The mobile
 * client therefore sends GitHub here, and this endpoint relays only the OAuth
 * code/state or OAuth error to the fixed app-owned deep link. The redirect
 * target is never supplied by the browser, preventing open-redirect abuse.
 */
authRouter.get('/callback/github', (request, response) => {
  const state = getCallbackQueryValue(request.query.state);
  const code = getCallbackQueryValue(request.query.code);
  const error = getCallbackQueryValue(request.query.error);
  const errorDescription = getCallbackQueryValue(request.query.error_description);

  if (!state) {
    return response.status(400).json({
      success: false,
      error: 'GitHub returned an invalid callback without a state value.',
      code: 'GITHUB_CALLBACK_STATE_MISSING',
    });
  }

  if (!code && !error) {
    return response.status(400).json({
      success: false,
      error: 'GitHub returned an incomplete callback.',
      code: 'GITHUB_CALLBACK_CODE_MISSING',
    });
  }

  const redirectParams = new URLSearchParams();
  redirectParams.set('state', state);
  if (code) redirectParams.set('code', code);
  if (error) redirectParams.set('error', error);
  if (errorDescription) redirectParams.set('error_description', errorDescription);
  const deepLink = `${env.GITHUB_MOBILE_REDIRECT_URI}?${redirectParams.toString()}`;

  const redirectScript = `\n    window.location.href = ${JSON.stringify(deepLink).replace(/</g, '\\u003c')};\n  `;
  const scriptHash = createHash('sha256').update(redirectScript).digest('base64');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <script>${redirectScript}</script>
  <p>Redirecting to app...</p>
</body>
</html>`;

  response.set('Cache-Control', 'no-store');
  response.set(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  return response.type('html').send(html);
});

authRouter.post('/register', async (request, response) => {
  const parsed = registrationSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid registration details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { name, email, password } = parsed.data;

  try {
    const existingUser = await UserModel.findOne({ email }).select('_id').lean();
    if (existingUser) {
      return response.status(409).json({
        success: false,
        error: 'An account with this email already exists. Try logging in instead.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const user = await UserModel.create({
      name,
      email,
      password,
      authProviders: ['email'],
    });

    return response.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token: jwt.sign(
        { userId: user._id.toString() },
        env.JWT_SECRET,
        { expiresIn: '7d' },
      ),
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        authProviders: user.authProviders ?? ['email'],
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'An account with this email already exists. Try logging in instead.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    if (error instanceof mongoose.Error.ValidationError) {
      return response.status(400).json({
        success: false,
        error: 'The account details could not be saved.',
        details: Object.values(error.errors).map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    logger.error('Registration request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return response.status(500).json({
      success: false,
      error: 'Could not create your account right now. Please try again.',
      code: 'REGISTRATION_FAILED',
    });
  }
});

authRouter.post('/login', async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid login details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await UserModel.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return response.status(401).json({
        success: false,
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    return sendSession(response, user);
  } catch (error) {
    logger.error('Login request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return response.status(500).json({
      success: false,
      error: 'Could not sign you in right now. Please try again.',
      code: 'LOGIN_FAILED',
    });
  }
});

async function handleOAuthCodeExchange(
  requestBody: unknown,
  response: Response,
  provider: 'google' | 'github',
): Promise<Response> {
  const parsed = oauthCodeSchema.safeParse(requestBody);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'The OAuth response was incomplete. Please restart sign-in.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const input: OAuthCodeExchangeInput = parsed.data;
  try {
    const user =
      provider === 'google'
        ? await authenticateWithGoogle(input)
        : await authenticateWithGitHub(input);
    return sendSession(response, user);
  } catch (error) {
    return sendOAuthFailure(response, error);
  }
}

authRouter.post('/oauth/google', async (request, response) =>
  handleOAuthCodeExchange(request.body, response, 'google'),
);

// Short aliases keep integrations that use the provider names directly
// compatible while still requiring the PKCE authorization-code exchange.
authRouter.post('/google', async (request, response) =>
  handleOAuthCodeExchange(request.body, response, 'google'),
);

authRouter.post('/oauth/google/id-token', async (request, response) => {
  const parsed = googleIdTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Google did not return a valid sign-in token. Please restart sign-in.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const user = await authenticateWithGoogleIdToken(parsed.data.idToken);
    return sendSession(response, user);
  } catch (error) {
    return sendOAuthFailure(response, error);
  }
});

authRouter.post('/oauth/github', async (request, response) =>
  handleOAuthCodeExchange(request.body, response, 'github'),
);

authRouter.post('/github', async (request, response) =>
  handleOAuthCodeExchange(request.body, response, 'github'),
);

authRouter.get('/me', verifyToken, async (request, response) => {
  try {
    const userId = request.auth?.userId;
    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Authentication token is invalid.',
        code: 'INVALID_TOKEN',
      });
    }

    const user = await UserModel.findById(userId).select('name email authProviders').exec();
    if (!user) {
      return response.status(404).json({
        success: false,
        error: 'This account no longer exists. Please sign in again.',
        code: 'USER_NOT_FOUND',
      });
    }

    return response.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        authProviders: user.authProviders ?? [],
      },
    });
  } catch (error) {
    logger.error('Current-user request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return response.status(500).json({
      success: false,
      error: 'Could not verify your sign-in session right now.',
      code: 'CURRENT_USER_LOOKUP_FAILED',
    });
  }
});

authRouter.patch('/me', verifyToken, async (request, response) => {
  const parsed = profileUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Enter a name between 1 and 100 characters.',
    });
  }

  try {
    const userId = request.auth?.userId;
    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Authentication token is invalid.',
        code: 'INVALID_TOKEN',
      });
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { name: parsed.data.name } },
      { new: true, runValidators: true },
    ).select('name email authProviders');
    if (!user) {
      return response.status(404).json({
        success: false,
        error: 'This account no longer exists. Please sign in again.',
        code: 'USER_NOT_FOUND',
      });
    }

    return response.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        authProviders: user.authProviders ?? [],
      },
    });
  } catch (error) {
    logger.error('Profile update request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({
      success: false,
      error: 'Could not update your profile right now.',
      code: 'PROFILE_UPDATE_FAILED',
    });
  }
});
