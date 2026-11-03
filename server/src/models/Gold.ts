import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/** One piece of gold jewellery (or a coin/bar) by weight; its value comes from the gold price. */
const goldItemSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    grams: { type: Number, required: true, min: 0 },
    karat: { type: String, enum: ['24K', '22K', '18K'], default: '22K' },
    type: { type: String, enum: ['personal', 'common'], required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    location: { type: String, default: '' }, // e.g. Federal Bank locker
    /** Investment account (gold) whose monthly value is the total of its items. */
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
goldItemSchema.index({ workspaceId: 1 });
export type GoldItemDoc = InferSchemaType<typeof goldItemSchema> & { _id: Types.ObjectId };
export const GoldItem = model('GoldItem', goldItemSchema);

/** The gold price per gram the workspace uses (one per currency), by purity. */
const goldPriceSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    currency: { type: String, required: true },
    perGram24: { type: Number, min: 0 },
    perGram22: { type: Number, min: 0 },
    perGram18: { type: Number, min: 0 },
    date: { type: String }, // when the price was checked
  },
  { timestamps: true },
);
goldPriceSchema.index({ workspaceId: 1, currency: 1 }, { unique: true });
export const GoldPrice = model('GoldPrice', goldPriceSchema);
