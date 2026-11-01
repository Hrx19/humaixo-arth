import { Router } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserModel } from '../../models/User';

const registrationSchema = z.object({
  name: z.string().trim()
    .min(1, 'Please enter your full name.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z.string().trim().toLowerCase()
    .email('Please enter a valid email address.')
    .max(254, 'Email address must be 254 characters or fewer.'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

export const authRouter = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function getErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

authRouter.post('/register', async (request, response) => {
  const parsed = registrationSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid registration details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { name, email, password } = parsed.data;

  try {
    const existingUser = await UserModel.findOne({ email }).select('_id').lean();
    if (existingUser) {
      return response.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const user = await UserModel.create({ name, email, password });
    const token = jwt.sign(
      { userId: user._id.toString() },
      env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    return response.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return response.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    if (error instanceof mongoose.Error.ValidationError) {
      return response.status(400).json({
        success: false,
        error: 'Invalid registration details.',
        details: Object.values(error.errors).map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    logger.error('Registration request failed.', {
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return response.status(500).json({
      success: false,
      error: 'Failed to register user.',
    });
  }
});

authRouter.post('/login', async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      success: false,
      error: 'Invalid login details.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await UserModel.findOne({ email }).select('+password');
    if (!user) {
      return response.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return response.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    return response.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error('Login request failed.', {
      message: getErrorDetails(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return response.status(500).json({
      success: false,
      error: 'Failed to log in.',
    });
  }
});
