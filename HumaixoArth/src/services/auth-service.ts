import { apiUrl } from '@/config/api';

export type AuthUser = {
  id: string | null;
  name: string;
  email: string;
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
    throw new AuthServiceError('The server returned an invalid response.');
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
    user: { id, name, email },
  };
}

async function authenticate(
  endpoint: 'login' | 'register',
  payload: LoginCredentials | RegistrationDetails,
): Promise<AuthSession> {
  let response: Response;

  try {
    response = await fetch(apiUrl(`/api/auth/${endpoint}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthServiceError(
      'Could not connect to Humaixo Arth. Check the API address and confirm the backend is running.',
    );
  }

  const responsePayload = await readResponse(response);
  if (!response.ok) {
    const message =
      formatValidationDetails(responsePayload.details) ??
      (typeof responsePayload.error === 'string'
        ? responsePayload.error
        : typeof responsePayload.message === 'string'
          ? responsePayload.message
          : 'Authentication failed. Please try again.');
    throw new AuthServiceError(message, response.status);
  }

  return toAuthSession(responsePayload);
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
};
