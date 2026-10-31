import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/** Partner invitation. Only a SHA-256 hash of the token is stored. */
const invitationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    /** The placeholder (status: invited) user the partner will claim. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    lastSentAt: { type: Date },
    sendCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export type InvitationDoc = InferSchemaType<typeof invitationSchema> & { _id: Types.ObjectId };
export const Invitation = model('Invitation', invitationSchema);
