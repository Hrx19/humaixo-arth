import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger';
import { verifyToken } from '../middleware/verifyToken';
import { evaluatePermission } from '../services/permissionEngine';
import { listAiAuditEvents, recordAiAuditEvent } from '../services/ai-audit';
import {
  aiToolSchemas,
  executeAiToolCall,
  resolveAccountId,
  type AiToolCall,
  type GroundedAnswer,
} from '../services/ai-tools';

const requestSchema = z.object({ question: z.string().trim().min(3).max(500) }).strict();
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

export interface AiToolProvider {
  createToolCall(question: string, now: Date): Promise<AiToolPlan | null>;
}

export type AiToolPlan =
  | AiToolCall
  | { name: 'resolve_account_balance'; arguments: { account_query: string; date: string } };

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: utcDay(start), end: utcDay(end) };
}

function resolveSpendingPeriod(question: string, now: Date): { start: string; end: string } {
  const explicitRange = question.match(new RegExp(`(?:from|between)\\s+(${ISO_DATE.source})\\s+(?:to|and)\\s+(${ISO_DATE.source})`, 'i'));
  if (explicitRange) return { start: explicitRange[1], end: explicitRange[2] };

  const monthYear = question.match(/\b(?:in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  if (monthYear) {
    const monthIndex = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ].indexOf(monthYear[1].toLowerCase());
    return utcMonthBounds(Number(monthYear[2]), monthIndex);
  }

  const yearMonth = question.match(/\b(?:in\s+)?(\d{4})-(0[1-9]|1[0-2])\b/);
  if (yearMonth) return utcMonthBounds(Number(yearMonth[1]), Number(yearMonth[2]) - 1);

  if (/\blast month\b/i.test(question)) {
    return utcMonthBounds(now.getUTCFullYear(), now.getUTCMonth() - 1);
  }
  if (/\bthis month\b/i.test(question)) {
    return { start: utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), end: utcDay(now) };
  }
  if (/\blast 7 days\b/i.test(question)) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start: utcDay(start), end: utcDay(now) };
  }

  return { start: '1970-01-01', end: utcDay(now) };
}

class MockAiToolProvider implements AiToolProvider {
  async createToolCall(question: string, now: Date): Promise<AiToolPlan | null> {
    const spending = question.match(
      /\b(?:spend|spent|spending|expense|expenses)\b.*?\b(?:on|for)\s+(.+?)(?:\s+(?:last month|this month|last 7 days|in\s+\d{4}(?:-\d{2})?|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|from\s+\d{4}-\d{2}-\d{2}|between\s+\d{4}-\d{2}-\d{2}))?[?.!]*$/i,
    );
    if (spending) {
      const period = resolveSpendingPeriod(question, now);
      const args = aiToolSchemas.get_total_spent.parse({
        category: spending[1].trim().replace(/[?.!]+$/, ''),
        start_date: period.start,
        end_date: period.end,
      });
      return { name: 'get_total_spent', arguments: args };
    }

    const person = question.match(
      /\b(?:transactions?|payments?|spent|paid|transfers?)\b.*?\b(?:with|to|from|for)\s+(.+?)(?:\s+(?:limit|last\s+\d+))?[?.!]*$/i,
    );
    if (person) {
      const requestedLimit = question.match(/\blimit\s+(\d+)\b|\blast\s+(\d+)\s+(?:transactions?|payments?)\b/i);
      const limit = Math.min(50, Math.max(1, Number(requestedLimit?.[1] ?? requestedLimit?.[2] ?? 20)));
      const args = aiToolSchemas.get_transactions_by_person.parse({
        person_name: person[1].trim().replace(/[?.!]+$/, ''),
        limit,
      });
      return { name: 'get_transactions_by_person', arguments: args };
    }

    const account = question.match(
      /\b(?:account\s+)?balance\b.*?\b(?:in|for|of)\s+(.+?)(?:\s+(?:on|as of)\s+(\d{4}-\d{2}-\d{2}))?[?.!]*$/i,
    );
    if (account) {
      return {
        name: 'resolve_account_balance',
        arguments: {
          account_query: account[1].trim(),
          date: aiToolSchemas.get_account_balance.shape.date.parse(account[2] ?? utcDay(now)),
        },
      };
    }
    return null;
  }
}

function unsupportedAnswer(): GroundedAnswer {
  const explanation = 'I could not map that question to a supported database tool. Try asking about category spending, a person, or an account balance.';
  return {
    direct_answer: explanation,
    period: 'not applicable',
    amount: 'not available',
    transaction_count: 0,
    calculation_explanation: explanation,
    supporting_transaction_ids: [],
  };
}

export function createAiQueryV1Router(
  provider: AiToolProvider = new MockAiToolProvider(),
): Router {
  const router = Router();
  router.use(verifyToken);

  router.get('/permission-status', (request, response) => {
    if (!request.auth?.userId || !Types.ObjectId.isValid(request.auth.userId)) {
      return response.status(401).json({ success: false, error: 'Authentication is required.' });
    }

    return response.status(200).json({
      success: true,
      data: {
        level: 1,
        label: 'Verified user',
        capabilities: {
          readOwnFinancialRecords: true,
          reviewOwnAiActivity: true,
          modifyApplication: false,
          executeCommands: false,
          privilegedAccess: false,
        },
      },
    });
  });

  router.get('/audit', async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return response.status(401).json({ success: false, error: 'Authentication is required.' });
    }
    const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(request.query.limit ?? 50);
    if (!parsedLimit.success) {
      return response.status(400).json({ success: false, error: 'Audit limit must be between 1 and 100.' });
    }

    try {
      const data = await listAiAuditEvents(new Types.ObjectId(userId), parsedLimit.data);
      return response.status(200).json({ success: true, data });
    } catch (error) {
      logger.error('AI audit history could not be loaded.', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return response.status(500).json({ success: false, error: 'Could not load AI activity.' });
    }
  });

  router.post('/query', async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return response.status(401).json({ success: false, error: 'Authentication is required.' });
    }
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: 'Question must be between 3 and 500 characters.',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const userObjectId = new Types.ObjectId(userId);
    const permission = await evaluatePermission({
      action: 'financial_query',
      actorId: userId,
      tenantId: userObjectId,
    });
    if (permission.decision !== 'allowed') {
      return response.status(403).json({ success: false, error: permission.explanation });
    }

    const respondWithAudit = async (
      statusCode: number,
      body: unknown,
      outcome: 'answered' | 'unsupported' | 'account_not_found' | 'rejected' | 'failed',
    ) => {
      try {
        await recordAiAuditEvent(userObjectId, outcome, parsed.data.question.length);
      } catch (error) {
        logger.error('AI query audit event could not be recorded.', {
          outcome,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return response.status(503).json({
          success: false,
          error: 'Could not securely record this AI action. Please retry.',
        });
      }

      return response.status(statusCode).json(body);
    };

    try {
      let plan = await provider.createToolCall(parsed.data.question, new Date());
      if (!plan) {
        return respondWithAudit(200, unsupportedAnswer(), 'unsupported');
      }

      if (plan.name === 'resolve_account_balance') {
        const accountId = await resolveAccountId(userObjectId, plan.arguments.account_query);
        if (!accountId) {
          return respondWithAudit(200, {
            direct_answer: 'No matching account was found in your records.',
            period: plan.arguments.date,
            amount: 'not available',
            transaction_count: 0,
            calculation_explanation: 'Account names and IDs are resolved only against accounts owned by the authenticated user.',
            supporting_transaction_ids: [],
          } satisfies GroundedAnswer, 'account_not_found');
        }
        plan = {
          name: 'get_account_balance',
          arguments: aiToolSchemas.get_account_balance.parse({
            account_id: accountId,
            date: plan.arguments.date,
          }),
        };
      }

      const answer = await executeAiToolCall(userObjectId, plan);
      return respondWithAudit(200, answer, 'answered');
    } catch (error) {
      if (error instanceof z.ZodError) {
        return respondWithAudit(400, {
          success: false,
          error: 'The question could not be mapped to valid tool arguments.',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        }, 'rejected');
      }
      logger.error('Grounded AI query failed.', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return respondWithAudit(
        500,
        { success: false, error: 'Could not answer from your financial records.' },
        'failed',
      );
    }
  });
  return router;
}

export const aiQueryV1Router = createAiQueryV1Router();
