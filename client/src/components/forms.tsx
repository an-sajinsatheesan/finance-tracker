import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, errorText } from '../lib/api';
import type { Account, Category, Commitment, CommitmentPayment, Expense, Kind, LookupItem, LookupType } from '../lib/types';
import { useApi } from '../lib/useApi';
import { dateInMonth, money, monthLabel, thisMonth, todayStr } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import {
  Button, DateInput, ErrorNote, Field, Modal, MonthInput, NumberInput, Select, Tabs, TextInput, useToast, type Option,
} from './ui';

/** Last day an expense may be dated: the end of the current month (no advance expenses). */
export const lastExpenseDate = () => dateInMonth(thisMonth(), 31);

/** Dropdown over a lookup type. Keeps an unknown stored code selectable so editing never loses it. */
export function LookupSelect({ type, value, onChange, filter, placeholder, className, showClear }: {
  type: LookupType; value: string; onChange: (code: string) => void; filter?: (l: LookupItem) => boolean;
  placeholder?: string; className?: string; required?: boolean; showClear?: boolean;
}) {
  const { options } = useLookups();
  const opts: Option[] = options(type).filter((l) => !filter || filter(l)).map((o) => ({ label: o.label, value: o.code }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ label: value, value });
  return <Select value={value} onChange={onChange} options={opts} placeholder={placeholder ?? 'Select…'} className={className} showClear={showClear} />;
}

/** Dropdown of workspace members. */
export function MemberSelect({ value, onChange, extra }: { value: string; onChange: (id: string) => void; extra?: Option[] }) {
  const { workspace } = useAuth();
  const opts = [...(workspace?.members ?? []).map((m) => ({ label: m.displayName, value: m.userId })), ...(extra ?? [])];
  return <Select value={value} onChange={onChange} options={opts} />;
}

/**
 * Optional bank-account link for income ("received into") and expenses ("paid from").
 * Offers the person's own accounts and joint accounts in the workspace currency (amounts
 * are entered in that currency). Credit cards are offered for spending only.
 */
export function AccountSelect({ accounts, value, onChange, ownerId, purpose, ariaLabel }: {
  accounts: Account[] | null; value: string; onChange: (id: string) => void; ownerId?: string; purpose: 'in' | 'out'; ariaLabel?: string;
}) {
  const { workspace } = useAuth();
  const { label } = useLookups();
  const all = accounts ?? [];
  const opts: Option[] = all
    .filter((a) => !a.archived && a.currency === (workspace?.currency ?? 'AED'))
    .filter((a) => (purpose === 'out' ? a.group === 'cash' || a.group === 'liability' : a.group === 'cash' || a.group === 'deposit'))
    .filter((a) => a.type === 'common' || !ownerId || a.ownerId === ownerId)
    .map((a) => ({ label: `${a.name} · ${label('bank', a.bank)}${a.type === 'common' ? ' (joint)' : ''}`, value: a.id }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ label: all.find((a) => a.id === value)?.name ?? 'Other account', value });
  return <Select value={value} onChange={onChange} options={opts} placeholder={opts.length ? 'Not linked' : 'No accounts yet'} showClear ariaLabel={ariaLabel} />;
}

/** Adds a custom value (e.g. a new bank) to the workspace's lookup list. */
export function AddLookupModal({ type, title, open, onClose, onAdded, withCurrency }: {
  type: LookupType; title: string; open: boolean; onClose: () => void; onAdded: (item: LookupItem) => void; withCurrency?: boolean;
}) {
  const { reload } = useLookups();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // this dialog can open on top of another form
    setBusy(true);
    setError(null);
    try {
      const item = await api.post<LookupItem>('/lookups', { type, label, code: code || undefined, meta: withCurrency ? { currency } : undefined });
      await reload();
      onAdded(item);
      toast.success(`${item.label} added`);
      setLabel(''); setCode('');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Name"><TextInput value={label} onChange={setLabel} required maxLength={60} autoFocus placeholder={type === 'bank' ? 'e.g. Wio Bank' : ''} /></Field>
          <Field label="Short code" hint="Optional"><TextInput value={code} onChange={setCode} maxLength={40} placeholder={type === 'bank' ? 'WIO' : ''} /></Field>
        </div>
        {withCurrency && <Field label="Usual currency"><LookupSelect type="currency" value={currency} onChange={setCurrency} /></Field>}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Add</Button>
        </div>
      </form>
    </Modal>
  );
}

const KIND_ITEMS: { value: Kind; label: string }[] = [{ value: 'personal', label: 'Personal' }, { value: 'common', label: 'Common' }];

function CategoryFields({ category, custom, onCategory, onCustom }: { category: Category; custom: string; onCategory: (c: Category) => void; onCustom: (s: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Category" className={category === 'Custom' ? '' : 'col-span-2'}>
        <LookupSelect type="category" value={category} onChange={onCategory} />
      </Field>
      {category === 'Custom' && (
        <Field label="Custom category">
          <TextInput value={custom} onChange={onCustom} required maxLength={40} placeholder="e.g. School fees" />
        </Field>
      )}
    </div>
  );
}

function SplitPreview({ amount }: { amount: number | null }) {
  const { workspace, isCouple } = useAuth();
  if (!workspace || !isCouple || !amount || amount <= 0) return null;
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

const REMINDER_OPTIONS: Option[] = [
  { label: 'No reminder', value: '' },
  { label: 'On the due day', value: '0' },
  ...[1, 2, 3, 5, 7].map((d) => ({ label: `${d} day${d > 1 ? 's' : ''} before`, value: String(d) })),
];

// ---------------- Commitment ----------------

export function CommitmentForm({ initial, defaultMonth, onSaved, onCancel }:
  { initial?: Commitment; defaultMonth?: string; onSaved: () => void; onCancel: () => void }) {
  const { user, isCouple } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({
    title: initial?.title ?? '',
    category: (initial?.category ?? 'Rent') as Category,
    customCategory: initial?.customCategory ?? '',
    type: (initial?.type ?? (isCouple ? 'common' : 'personal')) as Kind,
    ownerId: initial?.ownerId ?? user?.id ?? '',
    amount: initial ? initial.amount : (null as number | null),
    startMonth: initial?.startMonth ?? defaultMonth ?? thisMonth(),
    endMonth: initial?.endMonth ?? '',
    dueDay: initial?.dueDay ?? 1,
    reminderDaysBefore: initial ? (initial.reminderDaysBefore === null ? '' : String(initial.reminderDaysBefore)) : '3',
    notes: initial?.notes ?? '',
    amountEffectiveFrom: thisMonth() > (initial?.startMonth ?? '') ? thisMonth() : initial?.startMonth ?? thisMonth(),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const amountChanged = initial && f.amount !== initial.amount;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.amount || f.amount <= 0) { setError('Enter the monthly amount'); return; }
    setBusy(true);
    setError(null);
    const body = {
      title: f.title, category: f.category, customCategory: f.customCategory, type: f.type,
      ownerId: f.type === 'personal' ? f.ownerId : null, amount: f.amount, startMonth: f.startMonth,
      endMonth: f.endMonth || null, dueDay: f.dueDay, notes: f.notes,
      reminderDaysBefore: f.reminderDaysBefore === '' ? null : Number(f.reminderDaysBefore),
    };
    try {
      if (initial) {
        const { amount, ...rest } = body;
        await api.put(`/commitments/${initial.id}`, amountChanged ? { ...rest, amount, amountEffectiveFrom: f.amountEffectiveFrom } : rest);
      } else {
        await api.post('/commitments', body);
      }
      toast.success(`${f.title} ${initial ? 'updated' : 'added'}`);
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
        <TextInput value={f.title} onChange={(v) => set('title', v)} required maxLength={80} placeholder="e.g. Apartment rent, Car EMI" autoFocus />
      </Field>
      <CategoryFields category={f.category} custom={f.customCategory} onCategory={(c) => set('category', c)} onCustom={(s) => set('customCategory', s)} />
      {isCouple && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Tabs<Kind> value={f.type} onChange={(k) => set('type', k)} items={KIND_ITEMS} full /></Field>
          {f.type === 'personal' && <Field label="Belongs to"><MemberSelect value={f.ownerId} onChange={(v) => set('ownerId', v)} /></Field>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly amount (AED)"><NumberInput value={f.amount} onChange={(v) => set('amount', v)} min={0.01} required /></Field>
        <Field label="Due day"><NumberInput value={f.dueDay} onChange={(v) => set('dueDay', v ?? 1)} min={1} max={31} decimals={0} /></Field>
      </div>
      {f.type === 'common' && <SplitPreview amount={f.amount} />}
      {amountChanged && (
        <Field label="New amount applies from" hint="Earlier months keep the previous amount.">
          <MonthInput value={f.amountEffectiveFrom} min={f.startMonth} onChange={(v) => set('amountEffectiveFrom', v)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start month"><MonthInput value={f.startMonth} onChange={(v) => set('startMonth', v)} /></Field>
        <Field label="End month (optional)"><MonthInput value={f.endMonth} min={f.startMonth} onChange={(v) => set('endMonth', v)} clearable placeholder="Every month" /></Field>
      </div>
      <p className="-mt-1 text-[11px] text-stone-500">Without an end month it repeats every month automatically. For an EMI, set the last instalment month as the end month.</p>
      <Field label="Payment reminder"><Select value={f.reminderDaysBefore} onChange={(v) => set('reminderDaysBefore', v)} options={REMINDER_OPTIONS} /></Field>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => set('notes', v)} maxLength={500} /></Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add commitment'}</Button>
      </div>
    </form>
  );
}

// ---------------- Expense ----------------

/**
 * Personal expense: "Belongs to" follows "Paid by" until it is changed by hand.
 * Common expense: split 50/50, so there is no owner.
 */
export function ExpenseForm({ initial, month, onSaved, onCancel }:
  { initial?: Expense; month: string; onSaved: () => void; onCancel: () => void }) {
  const { user, isCouple } = useAuth();
  const toast = useToast();
  const accounts = useApi<Account[]>('/accounts');
  const maxDate = lastExpenseDate();
  const defaultDate = todayStr().startsWith(month) ? todayStr() : month < thisMonth() ? `${month}-01` : todayStr();
  const [f, setF] = useState({
    date: initial?.date ?? defaultDate,
    description: initial?.description ?? '',
    category: (initial?.category ?? 'Grocery') as Category,
    customCategory: initial?.customCategory ?? '',
    amount: initial ? initial.amount : (null as number | null),
    paidBy: initial?.paidBy ?? user?.id ?? '',
    type: (initial?.type ?? 'personal') as Kind,
    ownerId: initial?.ownerId ?? initial?.paidBy ?? user?.id ?? '',
    notes: initial?.notes ?? '',
    accountId: initial?.accountId ?? '',
  });
  // Owner was chosen explicitly (or differs from the payer on an existing expense).
  const [ownerPinned, setOwnerPinned] = useState(!!initial?.ownerId && initial.ownerId !== initial.paidBy);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const setPaidBy = (id: string) => setF((p) => ({ ...p, paidBy: id, ownerId: ownerPinned ? p.ownerId : id }));
  const setOwner = (id: string) => { setOwnerPinned(id !== f.paidBy); set('ownerId', id); };
  const setType = (t: Kind) => setF((p) => ({ ...p, type: t, ownerId: t === 'personal' && !ownerPinned ? p.paidBy : p.ownerId }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.amount || f.amount <= 0) { setError('Enter the amount'); return; }
    if (f.date > maxDate) { setError('Expenses can’t be added for a month that hasn’t started yet.'); return; }
    setBusy(true);
    setError(null);
    const personal = !isCouple || f.type === 'personal';
    const body = {
      ...f,
      type: isCouple ? f.type : 'personal',
      paidBy: isCouple ? f.paidBy : user!.id,
      ownerId: personal ? (isCouple ? f.ownerId || f.paidBy : user!.id) : null,
      accountId: f.accountId || null,
    };
    try {
      if (initial) await api.put(`/expenses/${initial._id}`, body);
      else await api.post('/expenses', body);
      toast.success(`${f.description} ${initial ? 'updated' : 'added'}`);
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
        <Field label="Date"><DateInput value={f.date} onChange={(v) => set('date', v)} max={maxDate} required /></Field>
        <Field label="Amount (AED)"><NumberInput value={f.amount} onChange={(v) => set('amount', v)} min={0.01} required autoFocus={!initial} /></Field>
      </div>
      <Field label="Description">
        <TextInput value={f.description} onChange={(v) => set('description', v)} required maxLength={120} placeholder="e.g. Carrefour weekly shop" />
      </Field>
      <CategoryFields category={f.category} custom={f.customCategory} onCategory={(c) => set('category', c)} onCustom={(s) => set('customCategory', s)} />
      {isCouple && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Tabs<Kind> value={f.type} onChange={setType} items={KIND_ITEMS} full /></Field>
            <Field label="Paid by"><MemberSelect value={f.paidBy} onChange={setPaidBy} /></Field>
          </div>
          {f.type === 'personal' ? (
            <Field label="Belongs to" hint="Whose personal expense this is (defaults to whoever paid).">
              <MemberSelect value={f.ownerId} onChange={setOwner} />
            </Field>
          ) : (
            <SplitPreview amount={f.amount} />
          )}
        </>
      )}
      <Field label="Paid from" hint="Optional. Linking the account keeps its balance up to date on the Balances page.">
        <AccountSelect accounts={accounts.data} value={f.accountId} onChange={(v) => set('accountId', v)} ownerId={isCouple && f.type === 'personal' ? f.paidBy : undefined} purpose="out" />
      </Field>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => set('notes', v)} maxLength={500} /></Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add expense'}</Button>
      </div>
    </form>
  );
}

// ---------------- Mark a commitment paid ----------------

/**
 * Records a commitment's payment for a month as an expense. Who paid matters
 * for common bills: it decides who owes whom in the settle-up.
 */
/** "Sajin 200 · 200 left": who has paid part of a commitment this month. */
export function PaidSoFar({ payment }: { payment: CommitmentPayment }) {
  const { memberName } = useAuth();
  return (
    <span className="text-[11px] text-stone-500">
      {payment.contributions.map((p) => `${memberName(p.userId)} ${money(p.amount)}`).join(' · ')}
      {payment.remaining > 0 && <span className="text-amber-700"> · {money(payment.remaining)} left</span>}
    </span>
  );
}

export function PayCommitmentModal({ target, month, onClose, onPaid }: {
  target: { id: string; title: string; type: Kind; ownerId?: string | null; amount: number; dueDay?: number; payment?: CommitmentPayment } | null;
  month: string; onClose: () => void; onPaid: () => void;
}) {
  const { user, isCouple, workspace } = useAuth();
  const [settles, setSettles] = useState(false);
  const toast = useToast();
  const accounts = useApi<Account[]>(target ? '/accounts' : null);
  const [paidBy, setPaidBy] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const early = month > thisMonth(); // next month's bill paid ahead: dated today, counted in its own month
  const maxDate = early ? todayStr() : [dateInMonth(month, 31), lastExpenseDate()].sort()[0];
  // Reset the fields whenever a different commitment is opened.
  if (target && target.id !== lastId) {
    setLastId(target.id);
    // Common bill where you already paid your part: the rest is usually your partner's.
    const paidAlready = target.payment?.contributions.map((p) => p.userId) ?? [];
    const me = user?.id ?? '';
    setPaidBy(target.type === 'personal' && target.ownerId ? target.ownerId
      : paidAlready.includes(me) ? workspace?.members.find((m) => !paidAlready.includes(m.userId))?.userId ?? me
      : me);
    setAmount(target.payment?.paidAmount ? target.payment.remaining : target.amount);
    setSettles(false);
    setAccountId('');
    const due = dateInMonth(month, target.dueDay ?? 1);
    setDate(early || todayStr().startsWith(month) ? todayStr() : due <= maxDate ? due : maxDate);
    setError(null);
  }
  const close = () => { setLastId(null); onClose(); };
  const remaining = target ? (target.payment?.paidAmount ? target.payment.remaining : target.amount) : 0;
  const short = !!amount && amount < remaining - 0.005; // part of the bill: the rest can be paid later (e.g. by the partner)

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (!amount || amount <= 0) { setError('Enter the amount'); return; }
    setBusy(true);
    setError(null);
    try {
      const final = short ? settles : true;
      await api.post(`/commitments/${target.id}/pay`, { month, paidBy, amount, date, accountId: accountId || null, settles: final });
      toast.success(final ? `${target.title} paid for ${monthLabel(month)}` : `${money(amount)} paid towards ${target.title} · ${money(remaining - amount)} left`);
      setLastId(null);
      onPaid();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={close} title={`Mark “${target?.title ?? ''}” paid · ${monthLabel(month)}`}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (AED)"><NumberInput value={amount} onChange={setAmount} min={0.01} required /></Field>
          <Field label="Date paid"><DateInput value={date} min={early ? todayStr() : `${month}-01`} max={maxDate} onChange={setDate} required /></Field>
        </div>
        {early && <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">Paying early: dated today, but counted in {monthLabel(month)}’s budget and shown as paid for {monthLabel(month)}.</p>}
        {!!target?.payment?.paidAmount && (
          <p className="rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600">Already paid: <PaidSoFar payment={target.payment} /></p>
        )}
        {short && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600">
            <input type="checkbox" className="mt-0.5 accent-brand-600" checked={settles} onChange={(e) => setSettles(e.target.checked)} />
            <span>
              <b className="text-stone-800">Fully paid for {monthLabel(month)}</b> — the bill was smaller this month.
              {' '}Leave unticked if the rest ({money(remaining - (amount ?? 0))}) is still to be paid{isCouple && target?.type === 'common' ? ', e.g. by your partner' : ''}.
            </span>
          </label>
        )}
        {isCouple && (
          <Field label="Paid by" hint={target?.type === 'common' ? 'For common bills this decides who owes whom: the other person owes the payer half.' : undefined}>
            <MemberSelect value={paidBy} onChange={setPaidBy} />
          </Field>
        )}
        <Field label="Paid from" hint="Optional. Keeps the account balance up to date.">
          <AccountSelect accounts={accounts.data} value={accountId} onChange={setAccountId} ownerId={target?.type === 'personal' ? paidBy : undefined} purpose="out" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Record payment</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Pay timing of a recurring income source. */
export const PAY_TIMING_OPTIONS: Option[] = [
  { label: 'In the same month', value: 'same' },
  { label: 'End of previous month', value: 'previous' },
];

/** "+" button placed next to a dropdown to add a new lookup value. */
export function AddValueButton({ title, onClick }: { title: string; onClick: () => void }) {
  return <Button className="shrink-0 !px-2" onClick={onClick} title={title} aria-label={title} icon={<Plus className="size-3.5" />} />;
}
