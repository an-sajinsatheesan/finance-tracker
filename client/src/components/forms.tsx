import { useState, type FormEvent, type ReactNode } from 'react';
import { Clock, Plus } from 'lucide-react';
import { api, errorText } from '../lib/api';
import type { Account, Category, Commitment, CommitmentPayment, Expense, Kind, LookupItem, LookupType, Share, SplitMode } from '../lib/types';
import { previewSplit, salaryOf, SPLIT_LABEL } from '../lib/split';
import { useApi } from '../lib/useApi';
import { dateInMonth, money, monthLabel, thisMonth, todayStr } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import {
  Button, DateInput, ErrorNote, Field, Modal, MonthInput, NumberInput, Select, Tabs, TextInput, cx, useToast, type Option,
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
    .map((a) => ({ label: `${a.name} · ${label('bank', a.bank)}${a.type === 'common' ? ' (common)' : ''}`, value: a.id }));
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

const SPLIT_ITEMS = (['equal', 'custom', 'income'] as SplitMode[]).map((value) => ({ value, label: SPLIT_LABEL[value] }));

/**
 * How a common commitment is shared: 50/50, the amount each person agreed to pay
 * (e.g. 150 / 200 of a 350 mobile bill), or in proportion to salary.
 */
function SplitFields({ amount, mode, custom, onMode, onCustom }: {
  amount: number | null; mode: SplitMode; custom: Share[]; onMode: (m: SplitMode) => void; onCustom: (s: Share[]) => void;
}) {
  const { workspace, isCouple } = useAuth();
  if (!workspace || !isCouple) return null;
  const members = workspace.members;
  const parts = amount && amount > 0 ? previewSplit(amount, members, mode, custom) : null;
  const valueOf = (id: string) => custom.find((x) => x.userId === id)?.amount ?? null;
  const assigned = custom.reduce((a, x) => a + (x.amount || 0), 0);
  // With two people, typing one amount fills in the rest for the other.
  const setPart = (id: string, v: number | null) => onCustom(members.map((m) => ({
    userId: m.userId,
    amount: m.userId === id ? v ?? 0 : members.length === 2 && amount ? Math.max(0, Math.round((amount - (v ?? 0)) * 100) / 100) : valueOf(m.userId) ?? 0,
  })));
  const salaries = members.map(salaryOf);
  const totalSalary = salaries.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-2 rounded-xl bg-violet-50 px-3 py-2.5 text-xs text-violet-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Who pays how much</span>
        <Tabs<SplitMode> value={mode} onChange={onMode} items={SPLIT_ITEMS} />
      </div>
      {mode === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          {members.map((m) => (
            <Field key={m.userId} label={`${m.displayName} pays`}>
              <NumberInput value={valueOf(m.userId)} onChange={(v) => setPart(m.userId, v)} min={0} />
            </Field>
          ))}
          {!!amount && Math.abs(assigned - amount) > 0.004 && (
            <p className="col-span-2 text-amber-800">These add up to <span className="num">{money(assigned)}</span>. Make them total <span className="num">{money(amount)}</span>.</p>
          )}
        </div>
      ) : parts && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {members.map((m, i) => (
            <span key={m.userId}>
              {m.displayName} <span className="num font-medium">{money(parts[i])}</span>
              {mode === 'income' && totalSalary > 0 && <span className="text-violet-600"> ({Math.round((salaries[i] / totalSalary) * 100)}%)</span>}
            </span>
          ))}
        </div>
      )}
      {mode === 'income' && <p className="text-[11px] text-violet-700">Follows each month’s expected income{totalSalary > 0 ? ' (preview uses your current salaries)' : '. Add salaries in Settings; until then it is 50/50'}.</p>}
      {mode !== 'equal' && <p className="text-[11px] text-violet-700">The settle-up follows this split, so if each of you pays your own part nobody owes anything.</p>}
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
  const { user, isCouple, workspace } = useAuth();
  const toast = useToast();
  const [splitMode, setSplitMode] = useState<SplitMode>(initial?.split?.mode ?? 'equal');
  const [custom, setCustom] = useState<Share[]>(initial?.split?.mode === 'custom' ? initial.shares ?? initial.split.shares ?? [] : []);
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
    const common = isCouple && f.type === 'common';
    if (common && splitMode === 'custom' && Math.abs(custom.reduce((a, x) => a + x.amount, 0) - f.amount) > 0.004) {
      setError(`Each person’s part must add up to ${money(f.amount)}`); return;
    }
    setBusy(true);
    setError(null);
    const body = {
      title: f.title, category: f.category, customCategory: f.customCategory, type: f.type,
      ownerId: f.type === 'personal' ? f.ownerId : null, amount: f.amount, startMonth: f.startMonth,
      endMonth: f.endMonth || null, dueDay: f.dueDay, notes: f.notes,
      reminderDaysBefore: f.reminderDaysBefore === '' ? null : Number(f.reminderDaysBefore),
      ...(common && { split: { mode: splitMode, ...(splitMode === 'custom' && { shares: custom }) } }),
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
      {f.type === 'common' && (
        <SplitFields
          amount={f.amount} mode={splitMode} custom={custom} onCustom={setCustom}
          onMode={(m) => {
            setSplitMode(m);
            // Start custom amounts from an even split.
            if (m === 'custom' && !custom.length && workspace && f.amount) {
              const parts = previewSplit(f.amount, workspace.members, 'equal');
              setCustom(workspace.members.map((x, i) => ({ userId: x.userId, amount: parts[i] })));
            }
          }}
        />
      )}
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
      <FormFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add commitment'}</Button>
      </FormFooter>
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
      const savedMonth = f.date.slice(0, 7);
      toast.success(savedMonth === month
        ? `${f.description} ${initial ? 'updated' : 'added'}`
        : `${f.description} ${initial ? 'moved' : 'added'} to ${monthLabel(savedMonth)} (its date), switch to that month to see it`);
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
      <FormFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add expense'}</Button>
      </FormFooter>
    </form>
  );
}

// ---------------- Mark a commitment paid ----------------

/** Buttons at the bottom of a form in a dialog: they stay in view while the form scrolls. */
export function FormFooter({ children }: { children: ReactNode }) {
  return <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 flex justify-end gap-2 border-t border-stone-100 bg-white px-5 py-3">{children}</div>;
}

type PayTarget = {
  id: string; title: string; type: Kind; ownerId?: string | null; amount: number; dueDay?: number; payment?: CommitmentPayment;
  split?: SplitMode | { mode: SplitMode }; shares?: Share[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where one person stands on a common commitment this month: their planned part,
 * what they paid on the bill, sent to the partner (or joint account) and received
 * from the partner. `due` is what they still have to pay on the bill: their own
 * part plus any share handed to them.
 */
export function standing(c: PayTarget, userId: string) {
  const part = c.shares?.find((x) => x.userId === userId)?.amount ?? 0;
  const paid = c.payment?.contributions.find((p) => p.userId === userId)?.amount ?? 0;
  const sent = (c.payment?.sent ?? []).filter((x) => x.fromUserId === userId).reduce((a, x) => a + x.amount, 0);
  const received = (c.payment?.sent ?? []).filter((x) => x.toUserId === userId).reduce((a, x) => a + x.amount, 0);
  const due = c.payment?.paid ? 0 : Math.min(c.payment?.remaining ?? c.amount, Math.max(0, r2(part + received - paid - sent)));
  return { part, paid, sent, received, due, ownDone: paid + sent >= part - 0.005 };
}

/**
 * Pay button label. Your partner's own bill: "Support". A common bill: pay your share,
 * or the whole bill once your partner has sent you theirs.
 */
export function payLabel(c: PayTarget, me: string, isCouple: boolean, early: boolean) {
  if (isCouple && c.type === 'personal' && c.ownerId && c.ownerId !== me) return 'Support';
  if (isCouple && c.type === 'common' && c.shares) {
    const s = standing(c, me);
    if (s.received > 0 && s.due > 0) return 'Pay bill';
    return s.ownDone ? 'Pay rest' : 'Pay my share';
  }
  return c.payment?.paidAmount ? 'Pay rest' : early ? 'Pay early' : 'Mark paid';
}

/**
 * Who paid what this month: payments on the bill, shares sent to the partner or a
 * joint account (undoable), and who still has to pay.
 */
export function WhoPaid({ c, onUndo, compact }: { c: PayTarget; onUndo?: (shareId: string) => void; compact?: boolean }) {
  const { memberName, workspace, isCouple } = useAuth();
  const p = c.payment;
  const items: ReactNode[] = [];
  for (const x of p?.contributions ?? []) {
    const support = c.type === 'personal' && c.ownerId && x.userId !== c.ownerId;
    items.push(<span key={`p${x.userId}`} className="text-brand-700">✓ {memberName(x.userId)} {support ? 'supported' : 'paid'} <span className="num">{money(x.amount)}</span></span>);
  }
  for (const x of p?.sent ?? []) {
    items.push(
      <span key={`s${x.id}`} className="inline-flex items-center gap-1 text-sky-700">
        ↗ {memberName(x.fromUserId)} sent <span className="num">{money(x.amount)}</span> to {x.toUserId ? memberName(x.toUserId) : 'common account'}
        {onUndo && <button type="button" className="text-stone-400 hover:text-rose-600" title="Undo this share" aria-label="Undo this share" onClick={() => onUndo(x.id)}>×</button>}
      </span>,
    );
  }
  if (p && isCouple && c.type === 'common' && c.shares) {
    const members = workspace?.members ?? [];
    for (const m of members) {
      const s = standing(c, m.userId);
      const short = r2(s.part - s.paid - s.sent);
      if (!p.paid && s.due > 0) items.push(<span key={`d${m.userId}`} className="text-amber-700">{memberName(m.userId)} to pay <span className="num">{money(s.due)}</span></span>);
      else if (p.paid && short > 0.004) {
        // The bill is paid, but by the partner: this person owes them their part.
        const other = members.find((x) => x.userId !== m.userId);
        items.push(
          <span key={`o${m.userId}`} className="inline-flex items-center gap-1 text-rose-600">
            <Clock className="size-3" />{memberName(m.userId)} owes {other ? memberName(other.userId) : 'their partner'} <span className="num">{money(short)}</span>
          </span>,
        );
      }
    }
  } else if (p && !p.paid) {
    if (p.paidAmount > 0) {
      items.push(<span key="left" className="text-amber-700"><span className="num">{money(p.remaining)}</span> left</span>);
    }
  }
  if (!items.length) return <span className="text-xs text-stone-400">—</span>;
  return <div className={cx('flex text-[11px] leading-4', compact ? 'flex-wrap gap-x-2' : 'flex-col gap-0.5')}>{items}</div>;
}

type PayMode = 'pay' | 'send';
const PAY_MODES: { value: PayMode; label: string }[] = [{ value: 'pay', label: 'Pay the bill' }, { value: 'send', label: 'Send my share' }];

/**
 * Records a commitment's payment for a month as an expense. Who paid matters for
 * common bills: it decides who owes whom in the settle-up. On a common bill a partner
 * can instead send their share to the one who pays it (or into a joint account).
 */
export function PayCommitmentModal({ target, month, onClose, onPaid }: {
  target: PayTarget | null; month: string; onClose: () => void; onPaid: () => void;
}) {
  const { user, isCouple, workspace, memberName } = useAuth();
  const { label } = useLookups();
  const [settles, setSettles] = useState(false);
  const toast = useToast();
  const accounts = useApi<Account[]>(target ? '/accounts' : null);
  const [mode, setMode] = useState<PayMode>('pay');
  const [paidBy, setPaidBy] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [sendAmount, setSendAmount] = useState<number | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const me = user?.id ?? '';
  const partner = workspace?.members.find((m) => m.userId !== me);
  const early = month > thisMonth(); // next month's bill paid ahead: dated today, counted in its own month
  const maxDate = early ? todayStr() : [dateInMonth(month, 31), lastExpenseDate()].sort()[0];
  const shared = isCouple && target?.type === 'common' && !!target.shares;
  // Reset the fields whenever a different commitment is opened.
  if (target && target.id !== lastId) {
    setLastId(target.id);
    const left = target.payment?.paidAmount ? target.payment.remaining : target.amount;
    // Your own bill, or your partner's one you support: you pay. Common: you, unless your part is done and theirs isn't.
    const payer = target.type === 'personal' ? (isCouple ? me : target.ownerId || me)
      : !isCouple || !target.shares || standing(target, me).due > 0 ? me
      : workspace?.members.find((m) => standing(target, m.userId).due > 0)?.userId ?? me;
    setPaidBy(payer);
    // A common bill: each pays their own part (plus any share sent to them), not the whole bill.
    const due = isCouple && target.type === 'common' && target.shares ? standing(target, payer).due : 0;
    setAmount(due > 0 ? Math.min(due, left) : left);
    const mine = target.shares ? standing(target, me) : null;
    setSendAmount(mine ? r2(Math.max(0, mine.part - mine.paid - mine.sent)) || null : null);
    setSendTo(partner ? `user:${partner.userId}` : '');
    // A bill your partner already paid in full: all that's left is sending them your share.
    setMode(target.payment?.paid && target.type === 'common' && target.shares ? 'send' : 'pay');
    setSettles(false);
    setAccountId('');
    const dueDate = dateInMonth(month, target.dueDay ?? 1);
    setDate(early || todayStr().startsWith(month) ? todayStr() : dueDate <= maxDate ? dueDate : maxDate);
    setError(null);
  }
  const close = () => { setLastId(null); onClose(); };
  const remaining = target ? (target.payment?.paidAmount ? target.payment.remaining : target.amount) : 0;
  const short = !!amount && amount < remaining - 0.005; // part of the bill: the rest can be paid later (e.g. by the partner)
  // Paying your partner's personal commitment is support: the cost is yours (not owed back).
  const supporting = isCouple && target?.type === 'personal' && !!target.ownerId && paidBy !== target.ownerId;
  const sending = shared && mode === 'send';

  // Where a share can go: the partner (any or a chosen account of theirs) or a joint account.
  const sendOptions: Option[] = [
    ...(partner ? [{ label: `${partner.displayName} (no account)`, value: `user:${partner.userId}` }] : []),
    ...(accounts.data ?? [])
      .filter((a) => !a.archived && a.group === 'cash' && (a.type === 'common' || a.ownerId === partner?.userId))
      .map((a) => ({ label: `${a.type === 'common' ? 'Common' : partner?.displayName} · ${a.name} · ${label('bank', a.bank)}`, value: `acct:${a.id}` })),
  ];
  const sendToName = sendTo.startsWith('user:') ? memberName(sendTo.slice(5))
    : (accounts.data ?? []).find((a) => `acct:${a.id}` === sendTo)?.type === 'common' ? 'the common account' : partner?.displayName ?? '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    if (sending) {
      if (!sendAmount || sendAmount <= 0) { setError('Enter the amount'); return; }
      if (!sendTo) { setError('Choose who receives your share'); return; }
      setBusy(true);
      try {
        await api.post(`/commitments/${target.id}/shares`, {
          month, amount: sendAmount, date, fromAccountId: accountId || null,
          ...(sendTo.startsWith('acct:') ? { toAccountId: sendTo.slice(5) } : { toUserId: sendTo.slice(5) }),
        });
        toast.success(`Sent ${money(sendAmount)} to ${sendToName} for ${target.title}`);
        setLastId(null);
        onPaid();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!amount || amount <= 0) { setError('Enter the amount'); return; }
    setBusy(true);
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

  const title = sending ? `Send your share · “${target?.title ?? ''}” · ${monthLabel(month)}`
    : supporting ? `Support ${memberName(target?.ownerId ?? null)} · “${target?.title ?? ''}” · ${monthLabel(month)}`
    : `Mark “${target?.title ?? ''}” paid · ${monthLabel(month)}`;

  return (
    <Modal open={!!target} onClose={close} title={title}>
      <form onSubmit={submit} className="space-y-3">
        {shared && !target?.payment?.paid && <Tabs<PayMode> value={mode} onChange={(m) => { setMode(m); setAccountId(''); setError(null); }} items={PAY_MODES} full />}
        <div className="grid grid-cols-2 gap-3">
          {sending
            ? <Field label="Amount (AED)"><NumberInput value={sendAmount} onChange={setSendAmount} min={0.01} required /></Field>
            : <Field label="Amount (AED)"><NumberInput value={amount} onChange={setAmount} min={0.01} required /></Field>}
          <Field label={sending ? 'Date sent' : 'Date paid'}><DateInput value={date} min={early ? todayStr() : `${month}-01`} max={maxDate} onChange={setDate} required /></Field>
        </div>
        {early && !sending && <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">Paying early: dated today, but counted in {monthLabel(month)}’s budget and shown as paid for {monthLabel(month)}.</p>}
        {shared && target?.shares && (
          <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">Split: {target.shares.map((x) => `${memberName(x.userId)} ${money(x.amount)}`).join(' · ')}</p>
        )}
        {target && (!!target.payment?.paidAmount || !!target.payment?.sent?.length) && (
          <div className="rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600"><span className="mb-0.5 block">So far:</span><WhoPaid c={target} compact /></div>
        )}
        {sending ? (
          <>
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {target?.payment?.paid
                ? <>The bill is already paid. This pays {sendToName || 'your partner'} back your share, and it is then shown as paid.</>
                : <>Your share goes to {sendToName || 'your partner'}, who pays the whole bill. It is not marked paid until the bill is paid; until then the settle-up shows {sendToName || 'they'} holding your money.</>}
            </p>
            <Field label="Send to" hint="Choose an account to add the money to its balance.">
              <Select value={sendTo} onChange={setSendTo} options={sendOptions} />
            </Field>
            <Field label="Sent from" hint="Optional. Keeps your account balance up to date.">
              <AccountSelect accounts={accounts.data} value={accountId} onChange={setAccountId} ownerId={me} purpose="out" />
            </Field>
          </>
        ) : (
          <>
            {supporting && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {memberName(paidBy)} pays {memberName(target?.ownerId ?? null)}’s bill as support: it counts as {memberName(paidBy)}’s spending and is not owed back.
              </p>
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
              <Field label="Paid by" hint={target?.type === 'common' ? 'For common bills this decides who owes whom: each person’s part follows the split.' : 'Someone other than the owner paying counts as support.'}>
                <MemberSelect value={paidBy} onChange={(id) => {
                  setPaidBy(id);
                  if (target && shared) { const d = standing(target, id).due; if (d > 0) setAmount(Math.min(d, remaining)); }
                }} />
              </Field>
            )}
            <Field label="Paid from" hint="Optional. Keeps the account balance up to date.">
              <AccountSelect accounts={accounts.data} value={accountId} onChange={setAccountId} ownerId={paidBy} purpose="out" />
            </Field>
          </>
        )}
        <ErrorNote message={error} />
        <FormFooter>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{sending ? 'Record share sent' : supporting ? 'Record support' : 'Record payment'}</Button>
        </FormFooter>
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
