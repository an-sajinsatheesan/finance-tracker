import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const userSchema = new Schema(
  {
    /** Login name. New accounts use their email; older accounts keep their username. */
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true, index: { unique: true, sparse: true } },
    /** Empty for an invited partner until they accept the invitation. */
    passwordHash: { type: String, select: false },
    /** Set when the admin changes the password; sessions signed in before it stop working. */
    passwordChangedAt: { type: Date },
    displayName: { type: String, required: true, trim: true },
    relationship: { type: String, default: '' },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model('User', userSchema);
