import { Schema, model } from 'mongoose';

/** Server-side snapshots (taken automatically before every restore). */
const backupSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    reason: { type: String, enum: ['pre-restore', 'manual'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    schemaVersion: { type: Number, required: true },
    payload: { type: String, required: true }, // JSON string of the full backup document
    sizeBytes: { type: Number },
  },
  { timestamps: true },
);
export const Backup = model('Backup', backupSchema);
