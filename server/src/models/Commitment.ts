import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const amountVersionSchema = new Schema(
  { fromMonth: { type: String, required: true }, amount: { type: Number, required: true, min: 0 } },
  { _id: false },
);

const commitmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    customCategory: { type: String, default: '' },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' }, // personal only
    /**
     * Amount history. Changing the amount adds a version that applies from a
     * given month onwards, so earlier months keep their original planned value.
     */
    amountHistory: { type: [amountVersionSchema], required: true },
    /**
     * How a common commitment is shared: 'equal' (50/50), 'custom' (the agreed amount
     * each person pays) or 'income' (by expected income). Missing means equal.
     */
    split: {
      mode: { type: String, enum: ['equal', 'custom', 'income'] },
      shares: { type: [new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User' }, amount: { type: Number, min: 0 } }, { _id: false })], default: undefined },
    },
    startMonth: { type: String, required: true },
    endMonth: { type: String, default: null },
    dueDay: { type: Number, min: 1, max: 31, default: 1 },
    /** Remind this many days before the due day; null turns reminders off. */
    reminderDaysBefore: { type: Number, min: 0, max: 15, default: 3 },
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type CommitmentDoc = InferSchemaType<typeof commitmentSchema> & { _id: Types.ObjectId };
export const Commitment = model('Commitment', commitmentSchema);
