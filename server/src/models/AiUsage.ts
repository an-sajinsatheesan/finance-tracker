import { Schema, model } from 'mongoose';

/** AI chat messages per person per day, to keep the shared API key's cost bounded. */
const aiUsageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
);
aiUsageSchema.index({ userId: 1, day: 1 }, { unique: true });

export const AiUsage = model('AiUsage', aiUsageSchema);
