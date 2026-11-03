import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/** One cheque of a contract; it leaves the account only once it has cleared. */
const chequeSchema = new Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD the cheque is dated
    amount: { type: Number, required: true, min: 0 },
    cleared: { type: Boolean, default: false },
    clearedDate: { type: String }, // when it actually left the account (defaults to `date`)
  },
  { _id: true },
);

/**
 * A rent (or other) contract paid by cheques, e.g. 12 months in 6 cheques of 6,000 every
 * two months. The linked commitment keeps the monthly budget (36,000 / 12 = 3,000), while
 * the cheques decide when money actually leaves the account. Renewing starts a new contract.
 */
const contractSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    months: { type: Number, required: true, min: 1, max: 60 },
    totalAmount: { type: Number, required: true, min: 0 },
    commitmentId: { type: Schema.Types.ObjectId, ref: 'Commitment' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' }, // account the cheques are drawn on
    cheques: { type: [chequeSchema], default: [] },
    renewedFrom: { type: Schema.Types.ObjectId, ref: 'Contract' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
contractSchema.index({ workspaceId: 1, status: 1 });

export type ContractDoc = InferSchemaType<typeof contractSchema> & { _id: Types.ObjectId };
export const Contract = model('Contract', contractSchema);

/** Money held as a deposit (apartment, DEWA, gas…): not spending, it comes back when refunded. */
const depositSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'AED' },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract' },
    paidDate: { type: String },
    refundedDate: { type: String },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
depositSchema.index({ workspaceId: 1 });

export type DepositDoc = InferSchemaType<typeof depositSchema> & { _id: Types.ObjectId };
export const Deposit = model('Deposit', depositSchema);
