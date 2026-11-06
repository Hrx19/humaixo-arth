import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export interface AIPermissionProposalRecord {
  proposalId: string;
  tenantId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  action: string;
  resourceType: string;
  summary: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'approved' | 'rejected';
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
}

export type AIPermissionProposalDocument = HydratedDocument<AIPermissionProposalRecord>;
type AIPermissionProposalModelType = Model<AIPermissionProposalRecord>;

const proposalSchema = new Schema<AIPermissionProposalRecord>(
  {
    proposalId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true, maxlength: 100 },
    resourceType: { type: String, required: true, maxlength: 100 },
    summary: { type: String, required: true, maxlength: 1_000 },
    payload: { type: Schema.Types.Mixed, required: true },
    state: { type: String, enum: ['pending', 'approved', 'rejected'], required: true, default: 'pending' },
    decidedBy: { type: Schema.Types.ObjectId },
    decidedAt: { type: Date },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { collection: 'ai_permission_proposals', versionKey: false },
);

export const AIPermissionProposalModel =
  (models.AIPermissionProposal as AIPermissionProposalModelType | undefined) ??
  model<AIPermissionProposalRecord, AIPermissionProposalModelType>(
    'AIPermissionProposal',
    proposalSchema,
  );
