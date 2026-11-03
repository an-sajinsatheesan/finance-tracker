import { useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { Archive, Gem, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account } from '../lib/types';
import { moneyIn, todayStr } from '../lib/format';
import { Badge, Button, DateInput, ErrorNote, Field, IconButton, Modal, NumberInput, Select, TableCard, TextInput, confirmAction, useToast } from '../components/ui';
import { FormFooter } from '../components/forms';

type Karat = '24K' | '22K' | '18K';
interface GoldItem { id: string; name: string; grams: number; karat: Karat; type: 'personal' | 'common'; ownerId: string | null; location: string; accountId: string | null; notes: string }
interface GoldPrice { currency: string; perGram24: number | null; perGram22: number | null; perGram18: number | null; date: string | null }

/** Price per gram for a purity (22K/18K worked out from 24K when not entered), as on the server. */
function perGram(p: GoldPrice | undefined, k: Karat) {
  if (!p) return null;
  const direct = k === '24K' ? p.perGram24 : k === '22K' ? p.perGram22 : p.perGram18;
  return direct || (p.perGram24 ? Math.round(((p.perGram24 * Number(k.slice(0, 2))) / 24) * 100) / 100 : null);
}

function ItemForm({ initial, accounts, onClose, onSaved }: { initial?: GoldItem; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const { user, workspace } = useAuth();
  const toast = useToast();
  const owners = [...(workspace?.members ?? []).map((m) => ({ label: m.displayName, value: m.userId })), { label: 'Common', value: 'common' }];
  const [f, setF] = useState({
    name: initial?.name ?? '', grams: initial?.grams ?? null as number | null, karat: initial?.karat ?? '22K' as Karat,
    owner: initial ? (initial.type === 'common' ? 'common' : initial.ownerId ?? '') : user?.id ?? '',
    location: initial?.location ?? '', accountId: initial?.accountId ?? accounts[0]?.id ?? '', notes: initial?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.grams) { setError('Enter the weight in grams'); return; }
    setBusy(true);
    const body = {
      name: f.name, grams: f.grams, karat: f.karat, location: f.location, accountId: f.accountId || null, notes: f.notes,
      ...(f.owner === 'common' ? { type: 'common', ownerId: null } : { type: 'personal', ownerId: f.owner }),
    };
    try {
      if (initial) await api.put(`/gold/${initial.id}`, body);
      else await api.post('/gold', body);
      toast.success(`${f.name} ${initial ? 'updated' : 'added'}`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Item" className="col-span-2"><TextInput value={f.name} onChange={(v) => setF({ ...f, name: v })} required maxLength={80} placeholder="e.g. Vala (bangles)" /></Field>
        <Field label="Grams"><NumberInput value={f.grams} onChange={(v) => setF({ ...f, grams: v })} min={0.01} decimals={3} required /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Purity"><Select value={f.karat} options={['22K', '24K', '18K'].map((k) => ({ label: k, value: k }))} onChange={(v) => setF({ ...f, karat: (v || '22K') as Karat })} /></Field>
        <Field label="Belongs to"><Select value={f.owner} options={owners} onChange={(v) => setF({ ...f, owner: v || (user?.id ?? '') })} /></Field>
        <Field label="Kept at"><TextInput value={f.location} onChange={(v) => setF({ ...f, location: v })} maxLength={80} placeholder="e.g. Federal Bank locker" /></Field>
      </div>
      <Field label="Counted in" hint="The gold investment account whose value is grams × price.">
        <Select value={f.accountId} showClear placeholder="Not counted in an account" options={accounts.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }))} onChange={(v) => setF({ ...f, accountId: v || '' })} />
      </Field>
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save' : 'Add item'}</Button>
      </FormFooter>
    </form>
  );
}

function PriceForm({ price, currency, onClose, onSaved }: { price?: GoldPrice; currency: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ perGram24: price?.perGram24 ?? null, perGram22: price?.perGram22 ?? null, date: price?.date ?? todayStr() });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.perGram24 && !f.perGram22) { setError('Enter at least one price'); return; }
    setBusy(true);
    try {
      await api.put('/gold/price', { currency, perGram24: f.perGram24, perGram22: f.perGram22, date: f.date });
      toast.success('Gold price saved');
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-stone-600">Today’s price per gram in {currency}. 22K is worked out from 24K if you leave it empty. The gold account’s value for this month updates to grams × price.</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`24K per gram (${currency})`}><NumberInput value={f.perGram24} onChange={(v) => setF({ ...f, perGram24: v })} min={0.01} /></Field>
        <Field label={`22K per gram (${currency})`}><NumberInput value={f.perGram22} onChange={(v) => setF({ ...f, perGram22: v })} min={0.01} /></Field>
        <Field label="Price date"><DateInput value={f.date} max={todayStr()} onChange={(v) => setF({ ...f, date: v })} /></Field>
      </div>
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save price</Button>
      </FormFooter>
    </form>
  );
}

/** Gold held by weight (e.g. jewellery in a bank locker), valued at the saved price per gram. */
export function GoldSection({ currency, accounts, onChanged }: { currency: string; accounts: Account[]; onChanged: () => void }) {
  const { memberName } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<{ items: GoldItem[]; prices: GoldPrice[] }>('/gold');
  const [editing, setEditing] = useState<GoldItem | 'new' | null>(null);
  const [pricing, setPricing] = useState(false);
  const goldAccounts = accounts.filter((a) => a.accountType === 'gold' && a.currency === currency && !a.archived);
  // Items counted in this currency's gold accounts, and items not linked to any account.
  const items = (data?.items ?? []).filter((i) => !i.accountId || accounts.find((a) => a.id === i.accountId)?.currency === currency);
  const price = data?.prices.find((p) => p.currency === currency);
  const valueOf = (i: GoldItem) => { const g = perGram(price, i.karat); return g === null ? null : i.grams * g; };
  const grams = items.reduce((s, i) => s + i.grams, 0);
  const value = items.every((i) => valueOf(i) !== null) ? items.reduce((s, i) => s + (valueOf(i) ?? 0), 0) : null;
  const done = () => { reload(); onChanged(); };

  return (
    <TableCard>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Gem className="size-4 text-amber-500" /> Gold</h2>
          <p className="text-[11px] text-stone-500">
            {price ? <>22K {moneyIn(perGram(price, '22K') ?? 0, currency)} · 24K {moneyIn(perGram(price, '24K') ?? 0, currency)} per gram{price.date && ` · ${price.date}`}</> : 'No price yet: set today’s price per gram to see the value.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setPricing(true)}>Gold price</Button>
          <Button size="sm" variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>Add item</Button>
        </div>
      </div>
      <DataTable
        value={items} dataKey="id" size="small"
        emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">No gold yet. Add each piece with its weight.</p>}
        footerColumnGroup={items.length ? (
          <ColumnGroup><Row>
            <Column footer="Total" colSpan={3} />
            <Column align="right" footer={<span className="num font-semibold">{grams.toFixed(1)} g</span>} />
            <Column align="right" footer={<span className="num font-semibold text-emerald-700">{value === null ? '—' : `${currency} ${moneyIn(value, currency)}`}</span>} />
            <Column />
          </Row></ColumnGroup>
        ) : undefined}
      >
        <Column header="Item" body={(i: GoldItem) => <span className="font-medium">{i.name}</span>} />
        <Column header="Belongs to" body={(i: GoldItem) => i.type === 'common' ? <Badge tone="violet">Common</Badge> : <span className="text-xs text-stone-600">{memberName(i.ownerId)}</span>} />
        <Column header="Kept at" body={(i: GoldItem) => <span className="text-xs text-stone-600">{i.location || '—'} · {i.karat}</span>} />
        <Column header="Grams" align="right" body={(i: GoldItem) => <span className="num">{i.grams.toFixed(1)}</span>} />
        <Column header="Value" align="right" body={(i: GoldItem) => { const v = valueOf(i); return v === null ? <span className="text-stone-300">—</span> : <span className="num">{moneyIn(v, currency)}</span>; }} />
        <Column align="right" style={{ width: '6rem' }} body={(i: GoldItem) => (
          <div className="whitespace-nowrap">
            <IconButton title="Edit" onClick={() => setEditing(i)}><Pencil className="size-3.5" /></IconButton>
            <IconButton title="Remove" danger onClick={() => confirmAction({
              header: `Remove “${i.name}”?`, message: 'It is archived and no longer counted in the gold value.', acceptLabel: 'Remove',
              onAccept: () => api.put(`/gold/${i.id}`, { archived: true }).then(() => { toast.success(`${i.name} removed`); done(); }, (e) => toast.error(errorText(e))),
            })}><Archive className="size-3.5" /></IconButton>
          </div>
        )} />
      </DataTable>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add gold' : 'Edit gold'}>
        {editing && <ItemForm initial={editing === 'new' ? undefined : editing} accounts={goldAccounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done(); }} />}
      </Modal>
      <Modal open={pricing} onClose={() => setPricing(false)} title="Gold price">
        {pricing && <PriceForm price={price} currency={currency} onClose={() => setPricing(false)} onSaved={() => { setPricing(false); done(); }} />}
      </Modal>
    </TableCard>
  );
}
