import 'dotenv/config';
import { z } from 'zod';

type OAuthClientMap = Record<string, string>;

function splitEnvironmentList(...values: Array<string | undefined>): string[] {
  return [...new Set(
    values
      .flatMap((value) => (value ?? '').split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function buildOAuthClientMap(
  configuredMap: string | undefined,
  legacyClientId: string | undefined,
  legacyClientSecret: string | undefined,
): string {
  const raw = configuredMap?.trim() || '{}';
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Leave malformed JSON intact so the schema below reports the right variable.
    return raw;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return raw;
  }

  const clients = parsed as Record<string, unknown>;
  const clientId = legacyClientId?.trim();
  if (clientId && !(clientId in clients)) {
    // Older local .env files use one client ID/secret pair. Preserve support
    // while allowing the newer map to configure web and native clients.
    clients[clientId] = legacyClientSecret?.trim() ?? '';
  }

  return JSON.stringify(clients);
}

function getCorsOriginsFromProcess(): string[] {
  const configuredOrigins = splitEnvironmentList(
    process.env.CORS_ORIGINS,
    process.env.ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
  ).map(normalizeOrigin);

  if (configuredOrigins.length > 0) return [...new Set(configuredOrigins)];
  if (process.env.NODE_ENV === 'production') return [];

  return ['http://localhost:8081', 'http://localhost:19006'];
}

function getOAuthRedirectUrisFromProcess(corsOrigins: string[]): string[] {
  const explicitlyConfigured = splitEnvironmentList(
    process.env.OAUTH_ALLOWED_REDIRECT_URIS,
  );
  if (explicitlyConfigured.length > 0) return explicitlyConfigured;

  const webRedirects = corsOrigins.flatMap((origin) => [
    `${origin}/oauth/google`,
    `${origin}/oauth/github`,
  ]);

  // This is the default deep link shipped in app.json for GitHub sign-in.
  // A custom production scheme must be explicitly allowlisted in the backend.
  const nativeRedirects = process.env.NODE_ENV === 'production'
    ? []
    : ['humaixoarth://oauth/github'];

  return [...new Set([...webRedirects, ...nativeRedirects])];
}

function parseOAuthClientMap(
  rawValue: string,
  context: z.RefinementCtx,
  variableName: string,
): OAuthClientMap {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    context.addIssue({
      code: 'custom',
      message: `${variableName} must be a JSON object mapping client IDs to client secrets.`,
    });
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    context.addIssue({
      code: 'custom',
      message: `${variableName} must be a JSON object mapping client IDs to client secrets.`,
    });
    return {};
  }

  const clients: OAuthClientMap = {};
  for (const [clientId, clientSecret] of Object.entries(parsed)) {
    if (!clientId.trim() || typeof clientSecret !== 'string') {
      context.addIssue({
        code: 'custom',
        message: `${variableName} contains an invalid client entry.`,
      });
      continue;
    }

    clients[clientId.trim()] = clientSecret.trim();
  }

  return clients;
}

const oauthClientMapSchema = (variableName: string) =>
  z.string().default('{}').transform((rawValue, context) =>
    parseOAuthClientMap(rawValue, context, variableName),
  );

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
  MONGO_URI: z
    .string()
    .trim()
    .min(1, 'MONGO_URI is required.')
    .refine(
      (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGO_URI must use the mongodb:// or mongodb+srv:// protocol.',
    ),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must contain at least 32 characters.'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url())),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
  MONGO_MAX_RETRIES: z.coerce.number().int().min(0).max(100).default(10),
  AI_SERVICE_URL: z.string().url().default('http://localhost:5001/parse-sms'),
  AI_SERVICE_API_KEY: z.string().default(''),
  GOOGLE_OAUTH_CLIENTS_JSON: oauthClientMapSchema('GOOGLE_OAUTH_CLIENTS_JSON'),
  GITHUB_OAUTH_CLIENTS_JSON: oauthClientMapSchema('GITHUB_OAUTH_CLIENTS_JSON'),
  OAUTH_ALLOWED_REDIRECT_URIS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((uri) => uri.trim()).filter(Boolean)),
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' && values.AI_SERVICE_API_KEY.length < 32) {
    context.addIssue({
      code: 'custom',
      path: ['AI_SERVICE_API_KEY'],
      message: 'AI_SERVICE_API_KEY must be at least 32 characters in production.',
    });
  }
});

const corsOrigins = getCorsOriginsFromProcess();
const environmentResult = environmentSchema.safeParse({
  ...process.env,
  CORS_ORIGINS: corsOrigins.join(','),
  GOOGLE_OAUTH_CLIENTS_JSON: buildOAuthClientMap(
    process.env.GOOGLE_OAUTH_CLIENTS_JSON,
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  ),
  GITHUB_OAUTH_CLIENTS_JSON: buildOAuthClientMap(
    process.env.GITHUB_OAUTH_CLIENTS_JSON,
    process.env.GITHUB_CLIENT_ID,
    process.env.GITHUB_CLIENT_SECRET,
  ),
  OAUTH_ALLOWED_REDIRECT_URIS: getOAuthRedirectUrisFromProcess(corsOrigins).join(','),
});

if (!environmentResult.success) {
  const details = environmentResult.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Environment configuration is invalid:\n${details}`);
}

export const env = environmentResult.data;
export type Environment = typeof env;
