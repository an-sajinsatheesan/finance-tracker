import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/**
 * One line of a loan statement (home, car or personal loan). `kind` decides how it moves the
 * amount outstanding: disbursements, charges and interest add to it; repayments and
 * prepayments reduce it; a rate change only records the new rate.
 */
const loanEntrySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    kind: { type: String, enum: ['disbursement', 'charge', 'interest', 'repayment', 'prepayment', 'rate', 'adjustment'], required: true },
    details: { type: String, default: '' },
    ref: { type: String, default: '' },
    /** Always positive, except an adjustment, which is signed (+ adds to the outstanding). */
    amount: { type: Number, default: 0 },
    rate: { type: Number }, // new interest rate (%) on a rate change
    /** The balance printed on the bank statement, to check against the running balance. */
    statementBalance: { type: Number },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
loanEntrySchema.index({ workspaceId: 1, accountId: 1, date: 1 });

export type LoanEntryDoc = InferSchemaType<typeof loanEntrySchema> & { _id: Types.ObjectId };
export const LoanEntry = model('LoanEntry', loanEntrySchema);
