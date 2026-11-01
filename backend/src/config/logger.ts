import winston from 'winston';
import { env } from './env';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'humaixo-arth-api' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
