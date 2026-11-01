import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const SERVER_SELECTION_TIMEOUT_MS = 10_000;
const MAX_POOL_SIZE = 25;

mongoose.set('bufferCommands', false);

mongoose.connection.on('error', (error: Error) => {
  logger.error('MongoDB connection emitted an error.', {
    message: error.message,
    stack: error.stack,
  });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection was disconnected. Mongoose will attempt recovery.');
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown database connection error.';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function connectToDatabase(): Promise<void> {
  let retries = 0;

  while (true) {
    try {
      await mongoose.connect(env.MONGO_URI, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
        maxPoolSize: MAX_POOL_SIZE,
        autoIndex: env.NODE_ENV !== 'production',
      });

      logger.info('MongoDB connection established.', {
        host: mongoose.connection.host,
        database: mongoose.connection.name,
      });
      return;
    } catch (error) {
      retries += 1;
      logger.error('MongoDB connection attempt failed.', {
        attempt: retries,
        message: getErrorMessage(error),
      });

      if (env.MONGO_MAX_RETRIES > 0 && retries > env.MONGO_MAX_RETRIES) {
        throw new Error(
          `MongoDB connection failed after ${retries} attempts.`,
          { cause: error },
        );
      }

      const exponentialDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** Math.min(retries - 1, 10),
        MAX_RETRY_DELAY_MS,
      );
      const jitter = Math.floor(Math.random() * Math.min(exponentialDelay * 0.2, 1_000));
      const delay = exponentialDelay + jitter;

      logger.warn('Retrying MongoDB connection with backoff.', {
        retryInMilliseconds: delay,
      });
      await wait(delay);
    }
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed.');
  } catch (error) {
    logger.error('Failed to close the MongoDB connection cleanly.', {
      message: getErrorMessage(error),
    });
    throw error;
  }
}
