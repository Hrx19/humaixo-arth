import {
  model,
  models,
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from 'mongoose';

export interface StatementImportRecord {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  fileName: string;
  fileHash: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  status: 'pending_review' | 'confirmed';
  parserVersion: string;
  storageKey?: string;
  normalizedRows: unknown[];
  import_logs: unknown[];
  corrections: unknown[];
  confirmedAt?: Date;
  result?: Record<string, unknown>;
  periodStart?: Date;
  periodEnd?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type StatementImportDocument = HydratedDocument<StatementImportRecord>;
type StatementImportModelType = Model<StatementImportRecord>;

const statementImportSchema = new Schema<StatementImportRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    fileName: {
      type: String,
      trim: true,
      maxlength: 180,
      required: true,
    },
    fileHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
    },
    totalRows: { type: Number, required: true, min: 0 },
    importedRows: { type: Number, required: true, min: 0 },
    duplicateRows: { type: Number, required: true, min: 0 },
    rejectedRows: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending_review', 'confirmed'],
      default: 'pending_review',
      required: true,
    },
    parserVersion: { type: String, required: true, default: 'csv-v1' },
    storageKey: { type: String, select: false },
    normalizedRows: { type: [Schema.Types.Mixed], default: [] },
    import_logs: { type: [Schema.Types.Mixed], default: [] },
    corrections: { type: [Schema.Types.Mixed], default: [] },
    confirmedAt: Date,
    result: { type: Schema.Types.Mixed },
    periodStart: Date,
    periodEnd: Date,
  },
  { timestamps: true },
);

statementImportSchema.index({ userId: 1, createdAt: -1 });
statementImportSchema.index({ userId: 1, fileHash: 1 }, { unique: true });

export const StatementImportModel =
  (models.StatementImport as StatementImportModelType | undefined) ??
  model<StatementImportRecord, StatementImportModelType>(
    'StatementImport',
    statementImportSchema,
  );
