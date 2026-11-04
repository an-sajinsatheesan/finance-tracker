import { Schema, model } from 'mongoose';

/** Admin panel sign-in. Created with `npm run admin:create`; only a bcrypt hash is stored. */
const adminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const Admin = model('Admin', adminSchema);
