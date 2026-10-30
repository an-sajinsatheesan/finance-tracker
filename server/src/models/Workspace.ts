import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const incomeSourceSchema = new Schema(
  {
    key: { type: String, required: true }, // stable id used when generating monthly income
    source: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    expectedDay: { type: Number, min: 1, max: 31, default: 1 },
    active: { type: Boolean, default: true },
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
    currency: { type: String, default: 'AED' },
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
