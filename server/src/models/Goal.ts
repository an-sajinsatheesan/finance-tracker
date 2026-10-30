import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const goalSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, default: 0, min: 0 },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export type GoalDoc = InferSchemaType<typeof goalSchema> & { _id: Types.ObjectId };
export const Goal = model('Goal', goalSchema);

const allocationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // whose cash was allocated
    month: { type: String, required: true },
    date: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    note: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);
allocationSchema.index({ workspaceId: 1, month: 1 });
export type AllocationDoc = InferSchemaType<typeof allocationSchema> & { _id: Types.ObjectId };
export const GoalAllocation = model('GoalAllocation', allocationSchema);
