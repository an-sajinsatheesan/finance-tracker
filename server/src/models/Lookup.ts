import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/**
 * One table for every enum in the app (relationship, currency, income source,
 * statuses, categories, banks, account types, ...).
 *
 * - Global rows (workspaceId = null) are seeded by `npm run seed` and on startup.
 * - Workspace rows are custom values a household adds (e.g. a new bank).
 * `code` is what records store; `label` is what the UI shows; `meta` holds
 * per-type extras (a bank's currency, an account type's group, ...).
 */
const lookupSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    type: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    /** System rows drive app logic and cannot be changed by users. */
    system: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);
lookupSchema.index({ workspaceId: 1, type: 1, code: 1 }, { unique: true });

export type LookupDoc = InferSchemaType<typeof lookupSchema> & { _id: Types.ObjectId };
export const Lookup = model('Lookup', lookupSchema);
