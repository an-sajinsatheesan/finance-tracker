import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { currentMonth } from '../utils/month.js';
import { Account, AccountBalance, GoldItem, GoldPrice } from '../models/index.js';
import { assertMember } from './workspace.service.js';

type Karat = '24K' | '22K' | '18K';
export type GoldItemInput = {
  name: string; grams: number; karat?: Karat; type: 'personal' | 'common'; ownerId?: string | null;
  location?: string; accountId?: string | null; notes?: string;
};
type Price = { perGram24?: number | null; perGram22?: number | null; perGram18?: number | null };

/** Price per gram for a purity; a missing 22K/18K price is worked out from the 24K one. */
export function pricePerGram(p: Price | null | undefined, karat: Karat): number | null {
  if (!p) return null;
  const direct = karat === '24K' ? p.perGram24 : karat === '22K' ? p.perGram22 : p.perGram18;
  if (direct) return direct;
  return p.perGram24 ? round2((p.perGram24 * Number(karat.slice(0, 2))) / 24) : null;
}

const serializeItem = (g: any) => ({
  id: String(g._id), name: g.name, grams: g.grams, karat: g.karat, type: g.type, ownerId: g.ownerId ? String(g.ownerId) : null,
  location: g.location ?? '', accountId: g.accountId ? String(g.accountId) : null, notes: g.notes ?? '',
});
const serializePrice = (p: any) => ({
  currency: p.currency, perGram24: p.perGram24 ?? null, perGram22: p.perGram22 ?? null, perGram18: p.perGram18 ?? null, date: p.date ?? null,
});

async function assertGoldAccount(workspaceId: string, accountId?: string | null) {
  if (!accountId) return null;
  const a = await Account.findOne({ _id: accountId, workspaceId }).lean();
  if (!a) throw badRequest('Unknown account');
  return a;
}

/**
 * Keeps each linked gold account's value for this month at grams × price, so Investments,
 * Wealth and Balances show the gold at today's price. Needs a price in the account's currency.
 */
async function syncAccounts(workspaceId: string, userId?: string) {
  const [items, prices] = await Promise.all([
    GoldItem.find({ workspaceId, status: 'active', accountId: { $exists: true } }).lean(),
    GoldPrice.find({ workspaceId }).lean(),
  ]);
  const ids = [...new Set(items.map((i) => String(i.accountId)))];
  const accounts = await Account.find({ workspaceId, _id: { $in: ids } }).lean();
  const month = currentMonth();
  for (const a of accounts) {
    const price = prices.find((p) => p.currency === a.currency);
    const mine = items.filter((i) => String(i.accountId) === String(a._id));
    const values = mine.map((i) => pricePerGram(price, i.karat as Karat));
    if (!mine.length || values.some((v) => v === null) || month < a.openedMonth) continue;
    const value = round2(mine.reduce((s, i, k) => s + i.grams * (values[k] as number), 0));
    await AccountBalance.updateOne(
      { workspaceId, accountId: a._id, month },
      { $set: { balance: value, opening: false, note: 'Gold: grams × price', ...(userId && { updatedBy: userId }) } },
      { upsert: true },
    );
  }
}

export async function listGold(workspaceId: string) {
  const [items, prices] = await Promise.all([
    GoldItem.find({ workspaceId, status: 'active' }).sort({ createdAt: 1 }).lean(),
    GoldPrice.find({ workspaceId }).lean(),
  ]);
  return { items: items.map(serializeItem), prices: prices.map(serializePrice) };
}

export async function createGoldItem(workspaceId: string, userId: string, input: GoldItemInput) {
  if (input.type === 'personal') await assertMember(workspaceId, input.ownerId, 'ownerId');
  await assertGoldAccount(workspaceId, input.accountId);
  const doc = await GoldItem.create({
    workspaceId, name: input.name, grams: round2(input.grams), karat: input.karat ?? '22K', type: input.type,
    ownerId: input.type === 'personal' ? input.ownerId : undefined, location: input.location ?? '',
    accountId: input.accountId || undefined, notes: input.notes ?? '', createdBy: userId,
  });
  await syncAccounts(workspaceId, userId);
  return serializeItem(doc.toObject());
}

export async function updateGoldItem(workspaceId: string, userId: string, id: string, input: Partial<GoldItemInput> & { archived?: boolean }) {
  const doc = await GoldItem.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Gold item');
  if (input.type) {
    if (input.type === 'personal') await assertMember(workspaceId, input.ownerId, 'ownerId');
    doc.type = input.type;
    doc.set('ownerId', input.type === 'personal' ? input.ownerId : undefined);
  }
  if (input.accountId !== undefined) { await assertGoldAccount(workspaceId, input.accountId); doc.set('accountId', input.accountId || undefined); }
  if (input.name !== undefined) doc.name = input.name;
  if (input.grams !== undefined) doc.grams = round2(input.grams);
  if (input.karat) doc.karat = input.karat;
  for (const k of ['location', 'notes'] as const) if (input[k] !== undefined) doc.set(k, input[k]);
  if (input.archived !== undefined) doc.status = input.archived ? 'archived' : 'active';
  await doc.save();
  await syncAccounts(workspaceId, userId);
  return serializeItem(doc.toObject());
}

export async function setGoldPrice(workspaceId: string, userId: string, input: Price & { currency: string; date?: string | null }) {
  const doc = await GoldPrice.findOneAndUpdate(
    { workspaceId, currency: input.currency },
    { $set: { perGram24: input.perGram24 ?? undefined, perGram22: input.perGram22 ?? undefined, perGram18: input.perGram18 ?? undefined, date: input.date ?? undefined } },
    { upsert: true, new: true },
  );
  await syncAccounts(workspaceId, userId);
  return serializePrice(doc!.toObject());
}
