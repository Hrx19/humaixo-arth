import axios from 'axios';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { env } from '../config/env';
import { UserModel, type AuthProvider, type UserDocument } from '../../models/User';

export type OAuthCodeExchangeInput = {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
};

export class OAuthServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'OAuthServiceError';
  }
}

type OAuthIdentity = {
  provider: Exclude<AuthProvider, 'email'>;
  providerUserId: string;
  email: string;
  name: string;
};

type GoogleTokenResponse = {
  id_token?: unknown;
  error?: unknown;
};

type GitHubTokenResponse = {
  access_token?: unknown;
  error?: unknown;
};

type GitHubProfile = {
  id?: unknown;
  login?: unknown;
  name?: unknown;
};

type GitHubEmail = {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
};

function requireOAuthClient(
  provider: 'google' | 'github',
  clientId: string,
): string {
  const configuredSecret =
    provider === 'google'
      ? env.GOOGLE_OAUTH_CLIENTS_JSON[clientId]
      : env.GITHUB_OAUTH_CLIENTS_JSON[clientId];

  if (configuredSecret === undefined) {
    throw new OAuthServiceError(
      `${provider === 'google' ? 'Google' : 'GitHub'} sign-in is not configured for this app yet.`,
      503,
      'OAUTH_PROVIDER_NOT_CONFIGURED',
    );
  }

  return configuredSecret;
}

function validateRedirectUri(redirectUri: string): void {
  if (env.OAUTH_ALLOWED_REDIRECT_URIS.length === 0) {
    throw new OAuthServiceError(
      'OAuth sign-in is not configured for this app yet.',
      503,
      'OAUTH_REDIRECTS_NOT_CONFIGURED',
    );
  }

  if (!env.OAUTH_ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
    throw new OAuthServiceError(
      'The OAuth redirect does not match an approved app redirect.',
      400,
      'OAUTH_REDIRECT_NOT_ALLOWED',
    );
  }
}

function toProviderEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function getProviderIdentityFilter(
  provider: OAuthIdentity['provider'],
  providerUserId: string,
): Record<string, string> {
  return provider === 'google'
    ? { googleSubject: providerUserId }
    : { githubUserId: providerUserId };
}

async function findUserByProviderIdentity(
  identity: OAuthIdentity,
): Promise<UserDocument | null> {
  return UserModel.findOne(
    getProviderIdentityFilter(identity.provider, identity.providerUserId),
  ).select('+googleSubject +githubUserId').exec();
}

async function findOrLinkUser(identity: OAuthIdentity): Promise<UserDocument> {
  const existingProviderUser = await findUserByProviderIdentity(identity);
  if (existingProviderUser) return existingProviderUser;

  const existingEmailUser = await UserModel.findOne({ email: identity.email }).select(
    '+password +googleSubject +githubUserId',
  );

  if (existingEmailUser) {
    const linkedProviderId =
      identity.provider === 'google'
        ? existingEmailUser.googleSubject
        : existingEmailUser.githubUserId;

    if (linkedProviderId && linkedProviderId !== identity.providerUserId) {
      throw new OAuthServiceError(
        'This email is already linked to a different account for this provider. Sign in with your existing method first.',
        409,
        'OAUTH_ACCOUNT_LINK_CONFLICT',
      );
    }

    if (identity.provider === 'google') {
      existingEmailUser.googleSubject = identity.providerUserId;
    } else {
      existingEmailUser.githubUserId = identity.providerUserId;
    }

    const providers = new Set(existingEmailUser.authProviders ?? []);
    if (existingEmailUser.password) providers.add('email');
    providers.add(identity.provider);
    existingEmailUser.authProviders = [...providers];

    await existingEmailUser.save();
    return existingEmailUser;
  }

  const providerField =
    identity.provider === 'google'
      ? { googleSubject: identity.providerUserId }
      : { githubUserId: identity.providerUserId };

  return UserModel.create({
    name: identity.name,
    email: identity.email,
    ...providerField,
    authProviders: [identity.provider],
  });
}

async function resolveOAuthUser(identity: OAuthIdentity): Promise<UserDocument> {
  try {
    return await findOrLinkUser(identity);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    // A simultaneous first login can race on the unique email or provider ID.
    const userCreatedByConcurrentLogin = await findUserByProviderIdentity(identity);
    if (userCreatedByConcurrentLogin) return userCreatedByConcurrentLogin;

    const concurrentlyCreatedEmail = await UserModel.findOne({ email: identity.email })
      .select('+password +googleSubject +githubUserId');
    if (!concurrentlyCreatedEmail) throw error;

    return findOrLinkUser(identity);
  }
}

function getSafeOAuthNetworkError(error: unknown): OAuthServiceError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      return new OAuthServiceError(
        'The provider did not accept this sign-in attempt. Try again or use email login.',
        401,
        'OAUTH_CODE_REJECTED',
      );
    }
  }

  return new OAuthServiceError(
    'The identity provider could not be reached. Please try again.',
    502,
    'OAUTH_PROVIDER_UNAVAILABLE',
  );
}

function toVerifiedGoogleIdentity(claims: TokenPayload | undefined): OAuthIdentity {
  if (
    !claims?.sub ||
    !claims.email ||
    claims.email_verified !== true ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '')
  ) {
    throw new OAuthServiceError(
      'Google could not verify the email address for this account.',
      401,
      'GOOGLE_EMAIL_NOT_VERIFIED',
    );
  }

  return {
    provider: 'google',
    providerUserId: claims.sub,
    email: toProviderEmail(claims.email),
    name: claims.name?.trim() || claims.email.split('@')[0] || 'Google user',
  };
}

export async function authenticateWithGoogle(
  input: OAuthCodeExchangeInput,
): Promise<UserDocument> {
  const clientSecret = requireOAuthClient('google', input.clientId);
  validateRedirectUri(input.redirectUri);

  let tokenResponse: GoogleTokenResponse;
  try {
    const form = new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    });
    if (clientSecret) form.set('client_secret', clientSecret);

    const response = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      form.toString(),
      {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    tokenResponse = response.data;
  } catch (error) {
    throw getSafeOAuthNetworkError(error);
  }

  if (typeof tokenResponse.id_token !== 'string') {
    throw new OAuthServiceError(
      'Google did not return a valid identity token. Please try again.',
      401,
      'GOOGLE_ID_TOKEN_MISSING',
    );
  }

  let claims: TokenPayload | undefined;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: tokenResponse.id_token,
      audience: input.clientId,
    });
    claims = ticket.getPayload();
  } catch (error) {
    if (error instanceof OAuthServiceError) throw error;
    throw new OAuthServiceError(
      'Google sign-in verification failed. Please try again.',
      401,
      'GOOGLE_ID_TOKEN_INVALID',
    );
  }

  return resolveOAuthUser(toVerifiedGoogleIdentity(claims));
}

/**
 * Native Google sign-in returns a signed ID token. The backend verifies it
 * against configured client IDs before trusting any profile claim.
 */
export async function authenticateWithGoogleIdToken(
  idToken: string,
): Promise<UserDocument> {
  const allowedAudiences = Object.keys(env.GOOGLE_OAUTH_CLIENTS_JSON);
  if (allowedAudiences.length === 0) {
    throw new OAuthServiceError(
      'Google sign-in is not configured for this app yet.',
      503,
      'OAUTH_PROVIDER_NOT_CONFIGURED',
    );
  }

  let identity: OAuthIdentity;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken,
      audience: allowedAudiences,
    });
    identity = toVerifiedGoogleIdentity(ticket.getPayload());
  } catch (error) {
    if (error instanceof OAuthServiceError) throw error;
    throw new OAuthServiceError(
      'Google sign-in verification failed. Please try again.',
      401,
      'GOOGLE_ID_TOKEN_INVALID',
    );
  }

  return resolveOAuthUser(identity);
}

export async function authenticateWithGitHub(
  input: OAuthCodeExchangeInput,
): Promise<UserDocument> {
  const clientSecret = requireOAuthClient('github', input.clientId);
  if (!clientSecret) {
    throw new OAuthServiceError(
      'GitHub sign-in is not configured for this app yet.',
      503,
      'OAUTH_PROVIDER_NOT_CONFIGURED',
    );
  }
  validateRedirectUri(input.redirectUri);

  let accessToken: string;
  let profile: GitHubProfile;
  let verifiedEmail: string;
  try {
    const form = new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: clientSecret,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });
    const response = await axios.post<GitHubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      form.toString(),
      {
        timeout: 10_000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (typeof response.data.access_token !== 'string') {
      throw new OAuthServiceError(
        'GitHub did not return a valid sign-in token. Please try again.',
        401,
        'GITHUB_ACCESS_TOKEN_MISSING',
      );
    }
    accessToken = response.data.access_token;
  } catch (error) {
    if (error instanceof OAuthServiceError) throw error;
    throw getSafeOAuthNetworkError(error);
  }

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const [profileResponse, emailsResponse] = await Promise.all([
      axios.get<GitHubProfile>('https://api.github.com/user', {
        headers,
        timeout: 10_000,
      }),
      axios.get<GitHubEmail[]>('https://api.github.com/user/emails', {
        headers,
        timeout: 10_000,
      }),
    ]);

    profile = profileResponse.data;
    const email = emailsResponse.data.find(
      (candidate) => candidate.primary === true && candidate.verified === true,
    )?.email;

    if (
      (typeof profile.id !== 'number' && typeof profile.id !== 'string') ||
      typeof profile.login !== 'string' ||
      typeof email !== 'string'
    ) {
      throw new OAuthServiceError(
        'GitHub requires a primary verified email address to create your account.',
        403,
        'GITHUB_VERIFIED_EMAIL_REQUIRED',
      );
    }

    verifiedEmail = toProviderEmail(email);
    if (!verifiedEmail || verifiedEmail.length > 254) {
      throw new OAuthServiceError(
        'GitHub did not provide a valid verified email address.',
        403,
        'GITHUB_VERIFIED_EMAIL_REQUIRED',
      );
    }
  } catch (error) {
    if (error instanceof OAuthServiceError) throw error;

    const responseStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (responseStatus === 401 || responseStatus === 403) {
      throw new OAuthServiceError(
        'GitHub could not verify your account. Please try again.',
        401,
        'GITHUB_PROFILE_REJECTED',
      );
    }

    throw getSafeOAuthNetworkError(error);
  }

  return resolveOAuthUser({
    provider: 'github',
    providerUserId: String(profile.id),
    email: verifiedEmail,
    name:
      typeof profile.name === 'string' && profile.name.trim()
        ? profile.name.trim().slice(0, 100)
        : (profile.login as string).slice(0, 100),
  });
}
