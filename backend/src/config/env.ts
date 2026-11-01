import 'dotenv/config';
import { z } from 'zod';

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
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' && values.AI_SERVICE_API_KEY.length < 32) {
    context.addIssue({
      code: 'custom',
      path: ['AI_SERVICE_API_KEY'],
      message: 'AI_SERVICE_API_KEY must be at least 32 characters in production.',
    });
  }
});

const environmentResult = environmentSchema.safeParse(process.env);

if (!environmentResult.success) {
  const details = environmentResult.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Environment configuration is invalid:\n${details}`);
}

export const env = environmentResult.data;
export type Environment = typeof env;
