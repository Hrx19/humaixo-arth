import { HttpError } from '../middleware/errorHandler';

export interface CacheFlushResult {
  providers: number;
  clearedEntries: number;
}

type CacheFlusher = () => Promise<number>;
const cacheFlushers = new Set<CacheFlusher>();

export function registerCacheFlusher(flusher: CacheFlusher): () => void {
  cacheFlushers.add(flusher);
  return () => cacheFlushers.delete(flusher);
}

export async function flushApplicationCaches(): Promise<CacheFlushResult> {
  if (cacheFlushers.size === 0) {
    throw new HttpError(503, 'No application cache provider is registered.', 'CACHE_PROVIDER_UNAVAILABLE');
  }
  const flushed = await Promise.all([...cacheFlushers].map((flush) => flush()));
  return {
    providers: flushed.length,
    clearedEntries: flushed.reduce((total, count) => total + count, 0),
  };
}

export function assertGracefulRestartAvailable(): void {
  if (process.listenerCount('SIGTERM') === 0) {
    throw new HttpError(503, 'Graceful restart handler is not available.', 'RESTART_HANDLER_UNAVAILABLE');
  }
}

export function requestGracefulServiceRestart(): void {
  assertGracefulRestartAvailable();
  setImmediate(() => process.emit('SIGTERM', 'SIGTERM'));
}
