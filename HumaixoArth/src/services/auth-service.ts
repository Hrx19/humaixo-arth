import { API_BASE_URL, apiUrl } from '@/config/api';

const REQUEST_TIMEOUT_MS = 15_000;

export type AuthUser = {
  id: string | null;
  name: string;
  email: string;
  authProviders?: ('email' | 'google' | 'github')[];
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegistrationDetails = LoginCredentials & {
  name: string;
};

export type OAuthProvider = 'google' | 'github';

export type OAuthCodeExchange = {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
};

export class AuthServiceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'AuthServiceError';
    this.statusCode = statusCode;
  }
}

type ApiResponse = {
  token?: unknown;
  user?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatValidationDetails(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const messages = value.flatMap((detail: unknown) => {
    if (!isRecord(detail) || typeof detail.message !== 'string') return [];

    const path = typeof detail.path === 'string' ? detail.path : '';
    const label = path
      ? `${path.charAt(0).toUpperCase()}${path.slice(1)}`
      : 'Input';
    return [`${label}: ${detail.message}`];
  });

  return messages.length > 0 ? messages.join('\n') : null;
}

async function readResponse(response: Response): Promise<ApiResponse> {
  let responseText: string;

  try {
    responseText = await response.text();
  } catch {
    throw new AuthServiceError('The server returned an unreadable response.');
  }

  if (!responseText.trim()) return {};

  try {
    const payload: unknown = JSON.parse(responseText);
    return isRecord(payload) ? (payload as ApiResponse) : {};
  } catch {
    throw new AuthServiceError(
      'The server returned an invalid response. Check that the API URL points to the Humaixo Arth backend.',
      response.status,
    );
  }
}

function toAuthSession(payload: ApiResponse): AuthSession {
  if (!isRecord(payload.user)) {
    throw new AuthServiceError('The server response did not include a valid user.');
  }

  const { id, name, email } = payload.user;
  if (
    typeof payload.token !== 'string' ||
    !payload.token.trim() ||
    typeof id !== 'string' ||
    !id.trim() ||
    typeof name !== 'string' ||
    !name.trim() ||
    typeof email !== 'string' ||
    !email.trim()
  ) {
    throw new AuthServiceError('The server response did not include a valid session.');
  }

  return {
    token: payload.token,
    user: {
      id,
      name,
      email,
      ...(Array.isArray(payload.user.authProviders)
        ? {
            authProviders: payload.user.authProviders.filter(
              (provider): provider is 'email' | 'google' | 'github' =>
                provider === 'email' || provider === 'google' || provider === 'github',
            ),
          }
        : {}),
    },
  };
}

function toAuthUser(payload: ApiResponse): AuthUser {
  if (!isRecord(payload.user)) {
    throw new AuthServiceError('The server response did not include a valid user.');
  }

  const { id, name, email } = payload.user;
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof name !== 'string' ||
    !name.trim() ||
    typeof email !== 'string' ||
    !email.trim()
  ) {
    throw new AuthServiceError('The server response did not include a valid user profile.');
  }

  return {
    id,
    name,
    email,
    ...(Array.isArray(payload.user.authProviders)
      ? {
          authProviders: payload.user.authProviders.filter(
            (provider): provider is 'email' | 'google' | 'github' =>
              provider === 'email' || provider === 'google' || provider === 'github',
          ),
        }
      : {}),
  };
}

function getResponseError(response: Response, payload: ApiResponse): AuthServiceError {
  const message =
    formatValidationDetails(payload.details) ??
    (typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : 'Authentication failed. Please try again.');

  return new AuthServiceError(message, response.status);
}

async function postJson(path: string, body: unknown): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AuthServiceError(
        'The authentication request timed out. Check your connection and try again.',
      );
    }

    const cause = error instanceof Error ? error.message : 'Network request failed.';
    throw new AuthServiceError(
      `Could not reach the Humaixo Arth API at ${API_BASE_URL}. Check that the backend is running, the address is reachable from this device, and browser CORS allows this app. (${cause})`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readResponse(response);
  if (!response.ok) throw getResponseError(response, payload);
  return payload;
}

async function getJson(path: string, token: string): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AuthServiceError('Session verification timed out. Check your connection and try again.');
    }

    const cause = error instanceof Error ? error.message : 'Network request failed.';
    throw new AuthServiceError(
      `Could not reach the Humaixo Arth API at ${API_BASE_URL} to verify your session. (${cause})`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readResponse(response);
  if (!response.ok) throw getResponseError(response, payload);
  return payload;
}

async function patchJson(path: string, token: string, body: unknown): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AuthServiceError('The profile update timed out. Check your connection and try again.');
    }

    const cause = error instanceof Error ? error.message : 'Network request failed.';
    throw new AuthServiceError(
      `Could not reach the Humaixo Arth API at ${API_BASE_URL} to update your profile. (${cause})`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readResponse(response);
  if (!response.ok) throw getResponseError(response, payload);
  return payload;
}

async function authenticate(
  endpoint: 'login' | 'register',
  payload: LoginCredentials | RegistrationDetails,
): Promise<AuthSession> {
  return toAuthSession(await postJson(`/api/auth/${endpoint}`, payload));
}

async function authenticateWithOAuth(
  provider: OAuthProvider,
  exchange: OAuthCodeExchange,
): Promise<AuthSession> {
  return toAuthSession(
    await postJson(`/api/auth/oauth/${provider}`, exchange),
  );
}

async function authenticateWithGoogleIdToken(idToken: string): Promise<AuthSession> {
  return toAuthSession(
    await postJson('/api/auth/oauth/google/id-token', { idToken }),
  );
}

export const AuthService = {
  login(credentials: LoginCredentials): Promise<AuthSession> {
    return authenticate('login', {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    });
  },

  register(details: RegistrationDetails): Promise<AuthSession> {
    return authenticate('register', {
      name: details.name.trim(),
      email: details.email.trim().toLowerCase(),
      password: details.password,
    });
  },

  signInWithGoogle(exchange: OAuthCodeExchange): Promise<AuthSession> {
    return authenticateWithOAuth('google', exchange);
  },

  signInWithGoogleIdToken(idToken: string): Promise<AuthSession> {
    return authenticateWithGoogleIdToken(idToken);
  },

  signInWithGitHub(exchange: OAuthCodeExchange): Promise<AuthSession> {
    return authenticateWithOAuth('github', exchange);
  },

  async getMe(token: string): Promise<AuthUser> {
    return toAuthUser(await getJson('/api/auth/me', token));
  },

  async updateProfile(token: string, name: string): Promise<AuthUser> {
    return toAuthUser(await patchJson('/api/auth/me', token, { name: name.trim() }));
  },
};
