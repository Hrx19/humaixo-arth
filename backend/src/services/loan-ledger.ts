import Decimal from 'decimal.js';
import mongoose, { Types } from 'mongoose';
import { LoanModel } from '../../models/Loan';
import { PersonModel } from '../../models/Person';
import { TransactionModel } from '../../models/Transaction';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type LoanDirection = 'lent' | 'borrowed';

export class LoanLedgerError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid_transaction' | 'overpayment' | 'already_linked',
  ) {
    super(message);
    this.name = 'LoanLedgerError';
  }
}

export async function createLoan(
  userId: Types.ObjectId,
  input: {
    personId: Types.ObjectId;
    direction: LoanDirection;
    principal: string;
    interestRate?: number;
    startDate: Date;
  },
) {
  const personExists = await PersonModel.exists({ _id: input.personId, userId });
  if (!personExists) return null;
  const loan = await LoanModel.create({
    userId,
    personId: input.personId,
    direction: input.direction,
    principal: Types.Decimal128.fromString(input.principal),
    ...(input.interestRate === undefined ? {} : { interestRate: input.interestRate }),
    startDate: input.startDate,
    status: 'active',
  });
  return {
    id: loan._id.toString(),
    personId: loan.personId.toString(),
    direction: loan.direction,
    principal: loan.principal.toString(),
    interestRate: loan.interestRate ?? null,
    startDate: loan.startDate.toISOString(),
    status: loan.status,
  };
}

export async function recordLoanRepayment(
  userId: Types.ObjectId,
  loanId: Types.ObjectId,
  transactionId: Types.ObjectId,
  note?: string,
) {
  const session = await mongoose.startSession();
  let output: {
    loanId: string;
    transactionId: string;
    repaymentAmount: string;
    outstandingPrincipal: string;
    status: 'active' | 'closed';
  } | undefined;

  try {
    await session.withTransaction(async () => {
      const loan = await LoanModel.findOne({ _id: loanId, userId }).session(session);
      if (!loan) throw new LoanLedgerError('Loan was not found.', 'not_found');
      if (loan.status === 'closed') throw new LoanLedgerError('Loan is already closed.', 'invalid_transaction');

      const transaction = await TransactionModel.findOne({ _id: transactionId, userId }).session(session);
      if (!transaction) throw new LoanLedgerError('Repayment transaction was not found.', 'not_found');
      if (
        transaction.isInternalTransfer ||
        transaction.isLoanRepayment ||
        transaction.loanId ||
        transaction.amount.toString() === '0'
      ) {
        throw new LoanLedgerError('Transaction is already classified or cannot be used as a repayment.', 'already_linked');
      }

      const expectedType = loan.direction === 'lent' ? 'credit' : 'debit';
      if (transaction.type !== expectedType) {
        throw new LoanLedgerError(
          `Repayment transaction must be a ${expectedType} for this ${loan.direction} loan.`,
          'invalid_transaction',
        );
      }

      const repaymentAmount = new Decimal(transaction.amount.toString());
      const outstanding = loan.repayments.reduce(
        (balance, repayment) => balance.minus(repayment.amount.toString()),
        new Decimal(loan.principal.toString()),
      );
      if (!repaymentAmount.isPositive()) {
        throw new LoanLedgerError('Repayment amount must be greater than zero.', 'invalid_transaction');
      }
      if (repaymentAmount.gt(outstanding)) {
        throw new LoanLedgerError('Repayment exceeds the outstanding principal.', 'overpayment');
      }

      const linkResult = await TransactionModel.updateOne(
        {
          _id: transactionId,
          userId,
          isLoanRepayment: { $ne: true },
          loanId: { $exists: false },
          isInternalTransfer: { $ne: true },
        },
        {
          $set: { isLoanRepayment: true, loanId: loan._id },
          $push: {
            userEdits: {
              field: 'loanRepayment',
              value: loan._id.toString(),
              editedAt: new Date(),
              source: 'user_confirmation',
            },
          },
        },
        { session },
      );
      if (linkResult.modifiedCount !== 1) {
        throw new LoanLedgerError('Transaction is already linked to another repayment or transfer.', 'already_linked');
      }

      loan.repayments.push({
        transactionId: transaction._id,
        amount: transaction.amount,
        date: transaction.date ?? new Date(),
        ...(note ? { note } : {}),
      });
      const nextOutstanding = outstanding.minus(repaymentAmount);
      if (nextOutstanding.isZero()) loan.status = 'closed';
      await loan.save({ session });

      output = {
        loanId: loan._id.toString(),
        transactionId: transaction._id.toString(),
        repaymentAmount: repaymentAmount.toString(),
        outstandingPrincipal: nextOutstanding.toString(),
        status: loan.status,
      };
    });
  } finally {
    await session.endSession();
  }
  if (!output) throw new Error('Repayment recording completed without a result.');
  return output;
}

export async function getLoanBalance(userId: Types.ObjectId, loanId: Types.ObjectId) {
  const loan = await LoanModel.findOne({ _id: loanId, userId })
    .populate({ path: 'personId', select: 'displayName', match: { userId } })
    .lean();
  if (!loan) return null;
  const principal = new Decimal(loan.principal.toString());
  const repaid = loan.repayments.reduce(
    (total, repayment) => total.plus(repayment.amount.toString()),
    new Decimal(0),
  );
  const outstanding = Decimal.max(0, principal.minus(repaid));
  const person = loan.personId && typeof loan.personId === 'object' && 'displayName' in loan.personId
    ? loan.personId.displayName
    : null;
  return {
    id: loan._id.toString(),
    personId: String(loan.personId && typeof loan.personId === 'object' && '_id' in loan.personId ? loan.personId._id : loan.personId),
    personName: person,
    direction: loan.direction,
    principal: principal.toString(),
    repaidAmount: repaid.toString(),
    outstandingPrincipal: outstanding.toString(),
    interestRate: loan.interestRate ?? null,
    startDate: loan.startDate.toISOString(),
    status: loan.status,
    repayments: loan.repayments.map((repayment) => ({
      transactionId: repayment.transactionId.toString(),
      amount: repayment.amount.toString(),
      date: repayment.date.toISOString(),
      note: repayment.note ?? null,
    })),
  };
}
