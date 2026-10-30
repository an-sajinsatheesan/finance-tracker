import { useState, type FormEvent } from 'react';
import { api, errorText } from '../lib/api';
import { CATEGORIES, type Category, type Commitment, type Expense, type Kind } from '../lib/types';
import { money, thisMonth, todayStr } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Button, ErrorNote, Field, cx } from './ui';

function KindToggle({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-stone-200 bg-stone-100 p-0.5">
      {(['personal', 'common'] as Kind[]).map((k) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          className={cx('rounded py-1 text-xs font-medium capitalize', value === k ? 'bg-white shadow-sm' : 'text-stone-500')}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function CategoryFields({ category, custom, onCategory, onCustom }: { category: Category; custom: string; onCategory: (c: Category) => void; onCustom: (s: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Category" className={category === 'Custom' ? '' : 'col-span-2'}>
        <select className="input" value={category} onChange={(e) => onCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      {category === 'Custom' && (
        <Field label="Custom category">
          <input className="input" value={custom} onChange={(e) => onCustom(e.target.value)} required maxLength={40} placeholder="e.g. School fees" />
        </Field>
      )}
    </div>
  );
}

function SplitPreview({ amount }: { amount: number }) {
  const { workspace } = useAuth();
  if (!workspace || !(amount > 0)) return null;
  const n = workspace.members.length;
  const fils = Math.round(amount * 100);
  const base = Math.floor(fils / n);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <span className="font-medium">Split 50/50:</span>
      {workspace.members.map((m, i) => (
        <span key={m.userId}>{m.displayName} <span className="num font-medium">{money((base + (i < fils - base * n ? 1 : 0)) / 100)}</span></span>
      ))}
    </div>
  );
}

// ---------------- Commitment ----------------

export function CommitmentForm({ initial, defaultMonth, onSaved, onCancel }:
  { initial?: Commitment; defaultMonth?: string; onSaved: () => void; onCancel: () => void }) {
  const { workspace } = useAuth();
  const members = workspace?.members ?? [];
  const [f, setF] = useState({
    title: initial?.title ?? '',
    category: (initial?.category ?? 'Rent') as Category,
    customCategory: initial?.customCategory ?? '',
    type: (initial?.type ?? 'common') as Kind,
    ownerId: initial?.ownerId ?? members[0]?.userId ?? '',
    amount: initial ? String(initial.amount) : '',
    startMonth: initial?.startMonth ?? defaultMonth ?? thisMonth(),
    endMonth: initial?.endMonth ?? '',
    dueDay: String(initial?.dueDay ?? 1),
    notes: initial?.notes ?? '',
    amountEffectiveFrom: thisMonth() > (initial?.startMonth ?? '') ? thisMonth() : initial?.startMonth ?? thisMonth(),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const amountChanged = initial && Number(f.amount) !== initial.amount;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title: f.title, category: f.category, customCategory: f.customCategory, type: f.type,
      ownerId: f.type === 'personal' ? f.ownerId : null, amount: Number(f.amount), startMonth: f.startMonth,
      endMonth: f.endMonth || null, dueDay: Number(f.dueDay), notes: f.notes,
    };
    try {
      if (initial) {
        const { amount, ...rest } = body;
        await api.put(`/commitments/${initial.id}`, amountChanged ? { ...rest, amount, amountEffectiveFrom: f.amountEffectiveFrom } : rest);
      } else {
        await api.post('/commitments', body);
      }
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title">
        <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required maxLength={80} placeholder="e.g. Apartment rent" autoFocus />
      </Field>
      <CategoryFields category={f.category} custom={f.customCategory} onCategory={(c) => set('category', c)} onCustom={(s) => set('customCategory', s)} />
      <div>
        <span className="label">Type</span>
        <KindToggle value={f.type} onChange={(k) => set('type', k)} />
      </div>
      {f.type === 'personal' && (
        <Field label="Belongs to">
          <select className="input" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly amount (AED)">
          <input className="input num text-right" type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} required />
        </Field>
        <Field label="Due day">
          <input className="input num" type="number" min={1} max={31} value={f.dueDay} onChange={(e) => set('dueDay', e.target.value)} />
        </Field>
      </div>
      {f.type === 'common' && <SplitPreview amount={Number(f.amount)} />}
      {amountChanged && (
        <Field label="New amount applies from" hint="Earlier months keep the previous amount.">
          <input className="input" type="month" value={f.amountEffectiveFrom} min={f.startMonth} onChange={(e) => set('amountEffectiveFrom', e.target.value)} required />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start month">
          <input className="input" type="month" value={f.startMonth} onChange={(e) => set('startMonth', e.target.value)} required />
        </Field>
        <Field label="End month (optional)">
          <input className="input" type="month" value={f.endMonth} min={f.startMonth} onChange={(e) => set('endMonth', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
      </Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add commitment'}</Button>
      </div>
    </form>
  );
}

// ---------------- Expense ----------------

export function ExpenseForm({ initial, month, onSaved, onCancel }:
  { initial?: Expense; month: string; onSaved: () => void; onCancel: () => void }) {
  const { workspace, user } = useAuth();
  const members = workspace?.members ?? [];
  const defaultDate = todayStr().startsWith(month) ? todayStr() : `${month}-01`;
  const [f, setF] = useState({
    date: initial?.date ?? defaultDate,
    description: initial?.description ?? '',
    category: (initial?.category ?? 'Grocery') as Category,
    customCategory: initial?.customCategory ?? '',
    amount: initial ? String(initial.amount) : '',
    paidBy: initial?.paidBy ?? user?.id ?? '',
    type: (initial?.type ?? 'personal') as Kind,
    ownerId: initial?.ownerId ?? initial?.paidBy ?? user?.id ?? '',
    notes: initial?.notes ?? '',
  });
  const [ownerTouched, setOwnerTouched] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...f, amount: Number(f.amount), ownerId: f.type === 'personal' ? f.ownerId : null };
    try {
      if (initial) await api.put(`/expenses/${initial._id}`, body);
      else await api.post('/expenses', body);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required />
        </Field>
        <Field label="Amount (AED)">
          <input className="input num text-right" type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} required autoFocus={!initial} />
        </Field>
      </div>
      <Field label="Description">
        <input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} required maxLength={120} placeholder="e.g. Carrefour weekly shop" />
      </Field>
      <CategoryFields category={f.category} custom={f.customCategory} onCategory={(c) => set('category', c)} onCustom={(s) => set('customCategory', s)} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">Type</span>
          <KindToggle value={f.type} onChange={(k) => set('type', k)} />
        </div>
        <Field label="Paid by">
          <select
            className="input"
            value={f.paidBy}
            onChange={(e) => { set('paidBy', e.target.value); if (!ownerTouched) set('ownerId', e.target.value); }}
          >
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </Field>
      </div>
      {f.type === 'personal' ? (
        <Field label="Belongs to" hint="Whose personal expense this is.">
          <select className="input" value={f.ownerId} onChange={(e) => { setOwnerTouched(true); set('ownerId', e.target.value); }}>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </Field>
      ) : (
        <SplitPreview amount={Number(f.amount)} />
      )}
      <Field label="Notes">
        <input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
      </Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add expense'}</Button>
      </div>
    </form>
  );
}
