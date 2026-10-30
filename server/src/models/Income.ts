import { Schema, model, type InferSchemaType, Types } from 'mongoose';

export const INCOME_STATUSES = ['expected', 'partial', 'received', 'archived'] as const;

const incomeSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true },
    source: { type: String, required: true, trim: true },
    sourceKey: { type: String }, // set when generated from a workspace income source
    expectedAmount: { type: Number, required: true, min: 0 },
    receivedAmount: { type: Number, default: 0, min: 0 },
    expectedDate: { type: String },
    receivedDate: { type: String },
    status: { type: String, enum: INCOME_STATUSES, default: 'expected' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
incomeSchema.index({ workspaceId: 1, month: 1 });

export type IncomeDoc = InferSchemaType<typeof incomeSchema> & { _id: Types.ObjectId };
export const Income = model('Income', incomeSchema);

/** Marker so that a month's income is generated from templates exactly once. */
const incomeMonthSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    month: { type: String, required: true },
  },
  { timestamps: true },
);
incomeMonthSchema.index({ workspaceId: 1, month: 1 }, { unique: true });
export const IncomeMonth = model('IncomeMonth', incomeMonthSchema);
