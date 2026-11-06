import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export type LoanDirection = 'lent' | 'borrowed';
export type LoanStatus = 'active' | 'closed';

export interface LoanRepayment {
  transactionId: Types.ObjectId;
  amount: Types.Decimal128;
  date: Date;
  note?: string;
}

export interface LoanRecord {
  userId: Types.ObjectId;
  personId: Types.ObjectId;
  direction: LoanDirection;
  principal: Types.Decimal128;
  interestRate?: number;
  startDate: Date;
  status: LoanStatus;
  repayments: LoanRepayment[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type LoanDocument = HydratedDocument<LoanRecord>;
type LoanModelType = Model<LoanRecord>;

const repaymentSchema = new Schema<LoanRepayment>(
  {
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const loanSchema = new Schema<LoanRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    personId: { type: Schema.Types.ObjectId, ref: 'FinancialPerson', required: true },
    direction: { type: String, enum: ['lent', 'borrowed'], required: true },
    principal: { type: Schema.Types.Decimal128, required: true },
    interestRate: { type: Number, min: 0, max: 100 },
    startDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active', required: true },
    repayments: { type: [repaymentSchema], default: [] },
  },
  { timestamps: true },
);

loanSchema.index({ userId: 1, status: 1, startDate: -1 });
loanSchema.index({ userId: 1, personId: 1, status: 1 });
loanSchema.index({ userId: 1, 'repayments.transactionId': 1 });

export const LoanModel =
  (models.Loan as LoanModelType | undefined) ??
  model<LoanRecord, LoanModelType>('Loan', loanSchema, 'loans');
