import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export type AIPermissionTier = 1 | 2 | 3;
export type AIPermissionDecision = 'allowed' | 'approval_required' | 'denied';

export interface AIPermissionLogRecord {
  requestId: string;
  actorType: 'ai' | 'owner' | 'system';
  actorId: string;
  tenantId: Types.ObjectId;
  action: string;
  tier: AIPermissionTier;
  decision: AIPermissionDecision;
  resourceType: string;
  ownerSessionId?: string;
  executionId?: string;
  result: string;
  createdAt: Date;
}

export type AIPermissionLogDocument = HydratedDocument<AIPermissionLogRecord>;
type AIPermissionLogModelType = Model<AIPermissionLogRecord>;

const aiPermissionLogSchema = new Schema<AIPermissionLogRecord>(
  {
    requestId: { type: String, required: true, index: true },
    actorType: { type: String, enum: ['ai', 'owner', 'system'], required: true },
    actorId: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true, maxlength: 100 },
    tier: { type: Number, enum: [1, 2, 3], required: true },
    decision: { type: String, enum: ['allowed', 'approval_required', 'denied'], required: true },
    resourceType: { type: String, required: true, maxlength: 100 },
    ownerSessionId: { type: String },
    executionId: { type: String },
    result: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { collection: 'ai_permission_logs', versionKey: false, timestamps: false },
);

aiPermissionLogSchema.index({ tenantId: 1, createdAt: -1 });
aiPermissionLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function rejectAuditMutation() {
    throw new Error('AI permission audit records are append-only.');
  },
);

export const AIPermissionLogModel =
  (models.AIPermissionLog as AIPermissionLogModelType | undefined) ??
  model<AIPermissionLogRecord, AIPermissionLogModelType>('AIPermissionLog', aiPermissionLogSchema);
