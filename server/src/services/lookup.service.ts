import { Types } from 'mongoose';
import { Lookup } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { EXTENDABLE_TYPES, LOOKUP_SEED, type LookupType } from '../utils/lookups.js';

/**
 * Inserts any missing global lookup rows. Existing rows (and their labels) are
 * left alone, so it is safe to run on every start and from `npm run seed`.
 */
export async function ensureLookups(): Promise<number> {
  const ops = Object.entries(LOOKUP_SEED).flatMap(([type, rows]) =>
    rows.map((r, i) => ({
      updateOne: {
        filter: { workspaceId: null, type, code: r.code },
        update: {
          $setOnInsert: {
            workspaceId: null, type, code: r.code, label: r.label ?? r.code, sortOrder: (i + 1) * 10,
            active: true, system: !!r.system, meta: r.meta ?? {},
          },
        },
        upsert: true,
      },
    })),
  );
  const res = await Lookup.bulkWrite(ops, { ordered: false });
  return res.upsertedCount;
}

let ensured: Promise<number> | null = null;
/** Runs ensureLookups once per process (cheap on warm serverless instances). */
export const ensureLookupsOnce = () => (ensured ??= ensureLookups().catch((e) => { ensured = null; throw e; }));

const serialize = (l: any) => ({
  id: String(l._id), type: l.type, code: l.code, label: l.label, sortOrder: l.sortOrder,
  active: l.active, system: l.system, custom: !!l.workspaceId, meta: l.meta ?? {},
});

/** Global rows plus this workspace's own rows, grouped by type. */
export async function listLookups(workspaceId: string) {
  const rows = await Lookup.find({ $or: [{ workspaceId: null }, { workspaceId }] }).sort({ type: 1, sortOrder: 1, label: 1 }).lean();
  const out: Record<string, ReturnType<typeof serialize>[]> = {};
  for (const r of rows) (out[r.type] ??= []).push(serialize(r));
  return out;
}

export async function lookupExists(workspaceId: string, type: LookupType, code: string) {
  return !!(await Lookup.exists({ type, code, active: true, $or: [{ workspaceId: null }, { workspaceId }] }));
}

/** Throws 400 unless `code` is an active value of `type` for this workspace. */
export async function assertLookup(workspaceId: string, type: LookupType, code: string | null | undefined, field: string = type) {
  if (!code) return;
  if (!(await lookupExists(workspaceId, type, code))) throw badRequest(`Unknown ${field} "${code}"`);
}

export async function getLookup(workspaceId: string, type: LookupType, code: string) {
  return Lookup.findOne({ type, code, $or: [{ workspaceId: null }, { workspaceId }] }).lean();
}

const toCode = (label: string) => label.trim().replace(/\s+/g, ' ');

export async function createLookup(workspaceId: string, input: { type: LookupType; code?: string; label: string; meta?: Record<string, unknown> }) {
  if (!EXTENDABLE_TYPES.includes(input.type)) throw forbidden(`Values of "${input.type}" are fixed by the app`);
  const code = input.code?.trim() || (input.type === 'bank' ? toCode(input.label).toUpperCase() : toCode(input.label));
  if (await lookupExists(workspaceId, input.type, code)) throw badRequest(`"${code}" already exists`);
  const last = await Lookup.findOne({ type: input.type }).sort({ sortOrder: -1 }).lean();
  const doc = await Lookup.create({
    workspaceId: new Types.ObjectId(workspaceId), type: input.type, code, label: input.label.trim(),
    sortOrder: (last?.sortOrder ?? 0) + 10, meta: input.meta ?? {},
  });
  return serialize(doc.toObject());
}

/** Only the workspace's own rows can be renamed or hidden. */
export async function updateLookup(workspaceId: string, id: string, input: { label?: string; active?: boolean; meta?: Record<string, unknown> }) {
  const doc = await Lookup.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Custom value');
  if (input.label !== undefined) doc.label = input.label.trim();
  if (input.active !== undefined) doc.active = input.active;
  if (input.meta !== undefined) doc.meta = { ...(doc.meta ?? {}), ...input.meta };
  doc.markModified('meta');
  await doc.save();
  return serialize(doc.toObject());
}
