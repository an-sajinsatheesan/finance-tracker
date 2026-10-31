import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/**
 * A bank account, deposit, investment or loan. Bank, currency and account type
 * are Lookup codes. Loans and credit cards hold a positive outstanding balance
 * and are subtracted in the wealth totals.
 */
const accountSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true },
    bank: { type: String, required: true },
    currency: { type: String, required: true },
    accountType: { type: String, required: true },
    /** personal accounts belong to one member; common = joint. */
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    accountNumberLast4: { type: String, default: '' },
    /** Month the account starts showing in the wealth dashboard. */
    openedMonth: { type: String, required: true },
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export type AccountDoc = InferSchemaType<typeof accountSchema> & { _id: Types.ObjectId };
export const Account = model('Account', accountSchema);

/**
 * Month-end balance of an account. Months without a row carry forward the
 * latest earlier balance, so a balance only needs updating when it changes.
 * `invested` (optional) is the total amount put in, for investment gain.
 */
const balanceSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    month: { type: String, required: true },
    balance: { type: Number, required: true },
    invested: { type: Number, default: null },
    note: { type: String, default: '' },
    /**
     * true: the balance entered when the account was added — its balance when tracking starts,
     * so money linked in that month is added to it. false: an entered month-end balance.
     * Unset on rows saved before this field existed (see isOpeningBalance).
     */
    opening: { type: Boolean },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
balanceSchema.index({ workspaceId: 1, accountId: 1, month: 1 }, { unique: true });
export type AccountBalanceDoc = InferSchemaType<typeof balanceSchema> & { _id: Types.ObjectId };
export const AccountBalance = model('AccountBalance', balanceSchema);

/**
 * Money moved between accounts (e.g. AED salary account → INR SBI account).
 * Cross-currency transfers keep both amounts so the effective rate is known.
 */
const transferSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    date: { type: String, required: true },
    month: { type: String, required: true },
    fromAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    amount: { type: Number, required: true, min: 0.01 }, // in the from-account currency
    toAmount: { type: Number, required: true, min: 0.01 }, // in the to-account currency
    fee: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
transferSchema.index({ workspaceId: 1, month: 1 });
export type TransferDoc = InferSchemaType<typeof transferSchema> & { _id: Types.ObjectId };
export const Transfer = model('Transfer', transferSchema);
