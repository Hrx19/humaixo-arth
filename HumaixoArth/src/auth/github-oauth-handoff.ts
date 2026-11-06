import { AuthStorage } from '@/auth/auth-storage';

const PENDING_GITHUB_OAUTH_KEY = 'humaixo.oauth.github.pending.v1';
const PENDING_GITHUB_OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

export type PendingGitHubOAuth = {
  state: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
};

function isPendingGitHubOAuth(value: unknown): value is PendingGitHubOAuth {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.state === 'string' &&
    typeof record.codeVerifier === 'string' &&
    typeof record.clientId === 'string' &&
    typeof record.redirectUri === 'string' &&
    typeof record.createdAt === 'number'
  );
}

export async function savePendingGitHubOAuth(
  request: Omit<PendingGitHubOAuth, 'createdAt'>,
): Promise<void> {
  await AuthStorage.setItem(
    PENDING_GITHUB_OAUTH_KEY,
    JSON.stringify({ ...request, createdAt: Date.now() } satisfies PendingGitHubOAuth),
  );
}

export async function consumePendingGitHubOAuth(
  expectedState: string,
): Promise<PendingGitHubOAuth | null> {
  const serializedRequest = await AuthStorage.getItem(PENDING_GITHUB_OAUTH_KEY);
  if (!serializedRequest) return null;

  let pendingRequest: unknown;
  try {
    pendingRequest = JSON.parse(serializedRequest);
  } catch {
    await AuthStorage.removeItem(PENDING_GITHUB_OAUTH_KEY);
    return null;
  }

  if (!isPendingGitHubOAuth(pendingRequest)) {
    await AuthStorage.removeItem(PENDING_GITHUB_OAUTH_KEY);
    return null;
  }

  if (
    pendingRequest.state !== expectedState ||
    Date.now() - pendingRequest.createdAt > PENDING_GITHUB_OAUTH_MAX_AGE_MS
  ) {
    return null;
  }

  await AuthStorage.removeItem(PENDING_GITHUB_OAUTH_KEY);
  return pendingRequest;
}

export async function clearPendingGitHubOAuth(expectedState: string): Promise<void> {
  const serializedRequest = await AuthStorage.getItem(PENDING_GITHUB_OAUTH_KEY);
  if (!serializedRequest) return;

  try {
    const pendingRequest: unknown = JSON.parse(serializedRequest);
    if (isPendingGitHubOAuth(pendingRequest) && pendingRequest.state === expectedState) {
      await AuthStorage.removeItem(PENDING_GITHUB_OAUTH_KEY);
    }
  } catch {
    await AuthStorage.removeItem(PENDING_GITHUB_OAUTH_KEY);
  }
}
