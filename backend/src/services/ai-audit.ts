import { Types } from 'mongoose';
import {
  AiAuditEventModel,
  type AiAuditOutcome,
} from '../../models/AiAuditEvent';

export type AiAuditEntry = {
  id: string;
  action: 'financial_query';
  outcome: AiAuditOutcome;
  question_length: number;
  created_at: string;
};

export async function recordAiAuditEvent(
  userId: Types.ObjectId,
  outcome: AiAuditOutcome,
  questionLength: number,
): Promise<void> {
  await AiAuditEventModel.create({
    userId,
    action: 'financial_query',
    outcome,
    questionLength,
  });
}

export async function listAiAuditEvents(
  userId: Types.ObjectId,
  limit: number,
): Promise<AiAuditEntry[]> {
  const events = await AiAuditEventModel.find({ userId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .select('_id action outcome questionLength createdAt')
    .lean();

  return events.map((event) => ({
    id: event._id.toString(),
    action: event.action,
    outcome: event.outcome,
    question_length: event.questionLength,
    created_at: event.createdAt.toISOString(),
  }));
}
