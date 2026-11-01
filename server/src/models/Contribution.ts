import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/**
 * A partner's share of a common commitment handed over before the bill is paid:
 * sent to the partner who pays it (`toUserId`), or into a joint account (`toUserId`
 * empty). It is not spending: the bill payment (an expense) carries the cost, and
 * the settle-up counts the contribution as paid by the sender.
 */
const contributionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    commitmentId: { type: Schema.Types.ObjectId, ref: 'Commitment', required: true },
    month: { type: String, required: true }, // budget month of the bill
    date: { type: String, required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    fromAccountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    toAccountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    amount: { type: Number, required: true, min: 0.01 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
contributionSchema.index({ workspaceId: 1, month: 1 });

export type ContributionDoc = InferSchemaType<typeof contributionSchema> & { _id: Types.ObjectId };
export const Contribution = model('Contribution', contributionSchema);
