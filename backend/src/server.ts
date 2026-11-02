import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { connectToDatabase, disconnectFromDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, HttpError, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { accountRouter } from './routes/accounts';
import { transactionRouter } from './routes/transactions';
import { aiRouter } from './routes/ai';
import { statementRouter } from './routes/statements';
import { analyticsRouter } from './routes/analytics';
import { pdfParserRouter } from './routes/pdf-parser';
import { budgetRouter } from './routes/budget';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new HttpError(403, 'This browser origin is not allowed.', 'CORS_ORIGIN_BLOCKED'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '6mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(
    morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      stream: {
        write(message: string): void {
          logger.info(message.trim(), { component: 'http' });
        },
      },
    }),
  );

  app.get('/health', (_request, response) => {
    const databaseReady = mongoose.connection.readyState === 1;
    response.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? 'ok' : 'degraded',
      database: databaseReady ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/accounts', accountRouter);
  app.use('/api/transactions', transactionRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/budget', budgetRouter);
  app.use('/api/parse-sms', aiRouter);
  app.use('/api/statements', statementRouter);
  app.use('/api/parse-statement', pdfParserRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

function listen(application: Express): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = application.listen(env.PORT);
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

function registerShutdownHandlers(server: Server): void {
  let shutdownStarted = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    logger.info('Graceful shutdown requested.', { signal });
    const forceCloseTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; closing active connections.');
      server.closeAllConnections();
    }, 10_000);
    forceCloseTimer.unref();

    server.close((closeError) => {
      void (async () => {
        try {
          if (closeError) throw closeError;
          await disconnectFromDatabase();
          logger.info('HTTP server shut down cleanly.');
        } catch (shutdownError) {
          logger.error('Graceful shutdown did not complete cleanly.', {
            message:
              shutdownError instanceof Error
                ? shutdownError.message
                : String(shutdownError),
          });
          process.exitCode = 1;
        } finally {
          clearTimeout(forceCloseTimer);
        }
      })();
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export async function startServer(): Promise<Server> {
  try {
    await connectToDatabase();
    const server = await listen(app);
    registerShutdownHandlers(server);

    logger.info('Humaixo Arth API is listening.', {
      port: env.PORT,
      environment: env.NODE_ENV,
    });
    return server;
  } catch (error) {
    logger.error('Humaixo Arth API failed to start.', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    try {
      await disconnectFromDatabase();
    } catch {
      // The original startup error is the actionable failure.
    }

    throw error;
  }
}

if (require.main === module) {
  void startServer().catch(() => {
    process.exitCode = 1;
  });
}
