import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const incomeSourceSchema = new Schema(
  {
    key: { type: String, required: true }, // stable id used when generating monthly income
    source: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    expectedDay: { type: Number, min: 1, max: 31, default: 1 },
    /**
     * Paid at the end of the previous month for this month's budget (e.g. salary
     * credited on 28 Oct is November's income). The row belongs to the budget
     * month; only its expected date falls in the month before.
     */
    paidPreviousMonth: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    /** Account the income is usually paid into; copied onto each month's generated row. */
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
  },
  { _id: false },
);

const memberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true, trim: true },
    relationship: { type: String, default: '' },
    incomeSources: { type: [incomeSourceSchema], default: [] },
  },
  { _id: false },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** personal = one member; couple = two members sharing common expenses 50/50. */
    mode: { type: String, enum: ['personal', 'couple'], default: 'couple' },
    currency: { type: String, default: 'AED' },
    /** Units of each currency per 1 unit of `currency`, e.g. { INR: 23.5 } means 1 AED = 23.5 INR. */
    fxRates: { type: Map, of: Number, default: () => ({ INR: 23.5 }) },
    members: { type: [memberSchema], default: [] },
    setupCompleted: { type: Boolean, default: false },
    setupCompletedAt: { type: Date },
    /** First month (YYYY-MM) the workspace tracks. Income is generated from here on. */
    startMonth: { type: String, required: true },
  },
  { timestamps: true },
);

export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema> & { _id: Types.ObjectId };
export const Workspace = model('Workspace', workspaceSchema);
