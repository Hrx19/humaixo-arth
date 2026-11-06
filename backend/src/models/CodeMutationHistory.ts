import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export interface CodeMutationHistoryRecord {
  mutationId: string;
  tenantId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  baseCommit: string;
  branchName: string;
  patchDigest: string;
  changedPaths: string[];
  checks: {
    linter: { status: 'not_run' | 'passed' | 'failed'; logs: string };
    typecheck: { status: 'not_run' | 'passed' | 'failed'; logs: string };
    overall: 'not_run' | 'passed' | 'failed';
    logs: string[];
  };
  approval: { state: 'pending' | 'approved' | 'rejected'; approvedBy?: Types.ObjectId; decidedAt?: Date };
  deploymentState: 'not_deployed' | 'queued' | 'deployed' | 'failed' | 'rolled_back';
  rollbackRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CodeMutationHistoryDocument = HydratedDocument<CodeMutationHistoryRecord>;
type CodeMutationHistoryModelType = Model<CodeMutationHistoryRecord>;

const checkSchema = new Schema(
  {
    status: { type: String, enum: ['not_run', 'passed', 'failed'], required: true },
    logs: { type: String, required: true, maxlength: 5_000 },
  },
  { _id: false },
);
const mutationSchema = new Schema<CodeMutationHistoryRecord>(
  {
    mutationId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true, index: true },
    baseCommit: { type: String, required: true, maxlength: 80 },
    branchName: { type: String, required: true, maxlength: 120 },
    patchDigest: { type: String, required: true, match: /^[a-f\d]{64}$/i },
    changedPaths: { type: [String], required: true, default: [] },
    checks: {
      linter: { type: checkSchema, required: true },
      typecheck: { type: checkSchema, required: true },
      overall: { type: String, enum: ['not_run', 'passed', 'failed'], required: true },
      logs: { type: [String], required: true, default: [] },
    },
    approval: {
      state: { type: String, enum: ['pending', 'approved', 'rejected'], required: true, default: 'pending' },
      approvedBy: { type: Schema.Types.ObjectId },
      decidedAt: { type: Date },
    },
    deploymentState: {
      type: String,
      enum: ['not_deployed', 'queued', 'deployed', 'failed', 'rolled_back'],
      required: true,
      default: 'not_deployed',
    },
    rollbackRef: { type: String, maxlength: 120 },
  },
  { collection: 'code_mutation_history', timestamps: true, versionKey: false },
);

mutationSchema.index({ tenantId: 1, createdAt: -1 });

export const CodeMutationHistoryModel =
  (models.CodeMutationHistory as CodeMutationHistoryModelType | undefined) ??
  model<CodeMutationHistoryRecord, CodeMutationHistoryModelType>(
    'CodeMutationHistory',
    mutationSchema,
  );
