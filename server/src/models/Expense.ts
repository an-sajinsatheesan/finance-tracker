import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const shareSchema = new Schema(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, amount: { type: Number, required: true } },
  { _id: false },
);

const expenseSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    month: { type: String, required: true }, // derived from date
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    customCategory: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0.01 },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' }, // personal: who the expense belongs to
    /** Who bears the cost. Personal: one share. Common: split equally. Sum === amount. */
    shares: { type: [shareSchema], required: true },
    commitmentId: { type: Schema.Types.ObjectId, ref: 'Commitment' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    archivedAt: { type: Date },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
expenseSchema.index({ workspaceId: 1, month: 1 });

export type ExpenseDoc = InferSchemaType<typeof expenseSchema> & { _id: Types.ObjectId };
export const Expense = model('Expense', expenseSchema);
