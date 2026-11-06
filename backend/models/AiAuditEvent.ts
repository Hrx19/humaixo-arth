import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export const AI_AUDIT_OUTCOMES = [
  'answered',
  'unsupported',
  'account_not_found',
  'rejected',
  'failed',
] as const;
export type AiAuditOutcome = (typeof AI_AUDIT_OUTCOMES)[number];

export interface AiAuditEventRecord {
  userId: Types.ObjectId;
  action: 'financial_query';
  outcome: AiAuditOutcome;
  questionLength: number;
  createdAt: Date;
}

export type AiAuditEventDocument = HydratedDocument<AiAuditEventRecord>;
type AiAuditEventModelType = Model<AiAuditEventRecord>;

const aiAuditEventSchema = new Schema<AiAuditEventRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['financial_query'], required: true },
    outcome: { type: String, enum: AI_AUDIT_OUTCOMES, required: true },
    questionLength: { type: Number, min: 0, max: 500, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false, collection: 'ai_audit_events' },
);

aiAuditEventSchema.index({ userId: 1, createdAt: -1 });

export const AiAuditEventModel =
  (models.AiAuditEvent as AiAuditEventModelType | undefined) ??
  model<AiAuditEventRecord, AiAuditEventModelType>('AiAuditEvent', aiAuditEventSchema);
