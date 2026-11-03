import { useMemo, useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ArrowRight, ArrowRightLeft, Archive, CreditCard, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account, AccountGroup, Kind, Transfer, Wealth, WealthAccount } from '../lib/types';
import { addMonths, dateLabel, monthLabel, moneyIn, todayStr } from '../lib/format';
import {
  Badge, Button, DateInput, Empty, ErrorNote, Field, IconButton, Modal, MonthInput, NumberInput, Page, PageHeader, Select, StatRail, TableCard, TableSkeleton, Tabs, TextInput, usePaging,
  confirmAction, cx, useToast, type Option,
} from '../components/ui';
import { AddLookupModal, AddValueButton, LookupSelect } from '../components/forms';
import { GoldSection } from './Gold';
import { LoanLedger } from './LoanLedger';

export const GROUP_LABEL: Record<AccountGroup, string> = { cash: 'Savings & cash', deposit: 'Deposits', investment: 'Investments', liability: 'Loans & cards' };

function Amount({ value, currency, className, signed }: { value: number | null; currency: string; className?: string; signed?: boolean }) {
  if (value === null) return <span className="text-stone-300">—</span>;
  return <span className={cx('num whitespace-nowrap', value < 0 && 'text-rose-700', className)}>{signed && value > 0 ? '+' : ''}{moneyIn(value, currency)}</span>;
}

/** Owner dropdown value: a member id, or "common" for the shared account both partners pay common bills from. */
function useOwnerOptions(): Option[] {
  const { workspace } = useAuth();
  return [...(workspace?.members ?? []).map((m) => ({ label: m.displayName, value: m.userId })), { label: 'Common', value: 'common' }];
}

// ---------------- Add accounts (editable table) ----------------

interface Row { key: number; bank: string; name: string; accountType: string; type: Kind; ownerId: string; accountNumberLast4: string; openedMonth: string; openingBalance: number | null; openingInvested: number | null }

/** Adds several accounts of one currency at once, e.g. ENBD, RAK and EIB savings. */
function AddAccounts({ currency: startCurrency, currencies, groups, defaultType, month, onClose, onSaved }: {
  currency: string; currencies: string[]; groups: AccountGroup[]; defaultType?: string; month: string; onClose: () => void; onSaved: () => void;
}) {
  const [currency, setCurrency] = useState(startCurrency);
  const { user, isCouple } = useAuth();
  const { options, find } = useLookups();
  const toast = useToast();
  const ownerOptions = useOwnerOptions();
  const bankFilter = (b: { meta: Record<string, unknown> }) => !b.meta.currency || b.meta.currency === currency;
  const firstBank = options('bank').find(bankFilter)?.code ?? '';
  // Only the account types of this page (bank accounts, investments, or loans and cards).
  const typeFilter = (t: { meta: Record<string, unknown> }) => groups.includes(((t.meta.group as AccountGroup | undefined) ?? 'cash'));
  const firstType = options('accountType').find((t) => typeFilter(t) && (!defaultType || t.code === defaultType))?.code
    ?? options('accountType').find(typeFilter)?.code ?? 'savings';
  const [seq, setSeq] = useState(1);
  const blank = (key: number): Row => ({
    key, bank: firstBank, name: '', accountType: firstType, type: 'personal', ownerId: user!.id, accountNumberLast4: '', openedMonth: month, openingBalance: null, openingInvested: null,
  });
  const [rows, setRows] = useState<Row[]>([blank(0)]);
  const [addingBankFor, setAddingBankFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upd = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const groupOf = (code: string) => (find('accountType', code)?.meta.group as AccountGroup | undefined) ?? 'cash';
  const addRow = () => { setRows((rs) => [...rs, blank(seq)]); setSeq((s) => s + 1); };
  const askRemove = (r: Row) => confirmAction({
    header: 'Remove this row?',
    message: <>The {find('bank', r.bank)?.label ?? 'new'} row hasn’t been saved yet and will be discarded.</>,
    acceptLabel: 'Remove',
    onAccept: () => setRows((rs) => rs.filter((x) => x.key !== r.key)),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rows.some((r) => !r.bank)) { setError('Choose a bank for every row'); return; }
    setBusy(true);
    setError(null);
    const done: number[] = [];
    try {
      for (const r of rows) {
        const bankLabel = find('bank', r.bank)?.label ?? r.bank;
        await api.post('/accounts', {
          name: r.name.trim() || `${bankLabel} ${find('accountType', r.accountType)?.label ?? ''}`.trim(),
          bank: r.bank, currency, accountType: r.accountType, type: r.type, ownerId: r.type === 'personal' ? r.ownerId : null,
          accountNumberLast4: r.accountNumberLast4, openedMonth: r.openedMonth,
          openingBalance: r.openingBalance, openingInvested: groupOf(r.accountType) === 'investment' ? r.openingInvested : null,
        });
        done.push(r.key);
      }
      toast.success(`${rows.length} ${currency} account${rows.length > 1 ? 's' : ''} added`);
      onSaved();
    } catch (err) {
      setRows((rs) => rs.filter((r) => !done.includes(r.key))); // keep only the rows that still need saving
      if (done.length) toast.info(`${done.length} saved; fix the remaining row${rows.length - done.length > 1 ? 's' : ''}.`);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {currencies.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-stone-600">
          Currency
          <Tabs<string> value={currency} onChange={(c) => {
            setCurrency(c);
            const bank = options('bank').find((b) => !b.meta.currency || b.meta.currency === c)?.code ?? '';
            setRows((rs) => rs.map((r) => ({ ...r, bank })));
          }} items={currencies.map((c) => ({ value: c, label: c === 'AED' ? 'AED · UAE' : c === 'INR' ? 'INR · India' : c }))} />
        </div>
      )}
      <p className="text-xs text-stone-500">Pick the month each balance is from; the account is tracked from that month. Balance = amount at the end of that month (for loans and cards, the amount outstanding). Leave the name blank to use “Bank + type”.</p>
      <div className="overflow-hidden rounded-md border border-stone-200">
        <DataTable value={rows} dataKey="key" size="small" scrollable tableStyle={{ minWidth: '72rem' }}>
          <Column header="#" style={{ width: '2.5rem' }} body={(_r: Row, o) => <span className="text-xs text-stone-400">{o.rowIndex + 1}</span>} />
          <Column header="Bank" style={{ width: '15rem' }} body={(r: Row) => (
            <div className="flex gap-1">
              <LookupSelect type="bank" value={r.bank} onChange={(v) => upd(r.key, { bank: v })} filter={bankFilter} />
              <AddValueButton title="Add a bank" onClick={() => setAddingBankFor(r.key)} />
            </div>
          )} />
          <Column header="Type" style={{ width: '11rem' }} body={(r: Row) => <LookupSelect type="accountType" value={r.accountType} onChange={(v) => upd(r.key, { accountType: v })} filter={typeFilter} />} />
          <Column header="Name (optional)" body={(r: Row) => <TextInput value={r.name} onChange={(v) => upd(r.key, { name: v })} maxLength={80} placeholder="e.g. Salary account" />} />
          {isCouple && <Column header="Owner" style={{ width: '9rem' }} body={(r: Row) => (
            <Select value={r.type === 'common' ? 'common' : r.ownerId} options={ownerOptions}
              onChange={(v) => upd(r.key, v === 'common' ? { type: 'common' } : { type: 'personal', ownerId: v })} />
          )} />}
          <Column header="Last 4" style={{ width: '5.5rem' }} body={(r: Row) => <TextInput value={r.accountNumberLast4} onChange={(v) => upd(r.key, { accountNumberLast4: v.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" />} />
          <Column header="Balance month" style={{ width: '9rem' }} body={(r: Row) => <MonthInput value={r.openedMonth} onChange={(v) => upd(r.key, { openedMonth: v })} />} />
          <Column header={`Balance (${currency})`} style={{ width: '10rem' }} body={(r: Row) => <NumberInput value={r.openingBalance} onChange={(v) => upd(r.key, { openingBalance: v })} />} />
          <Column header="Invested" style={{ width: '9rem' }} body={(r: Row) => (
            groupOf(r.accountType) === 'investment'
              ? <NumberInput value={r.openingInvested} onChange={(v) => upd(r.key, { openingInvested: v })} min={0} title="Total amount put in so far" />
              : <span className="block text-center text-stone-300">—</span>
          )} />
          <Column style={{ width: '3rem' }} body={(r: Row) => (rows.length > 1 ? <IconButton title="Remove row" danger onClick={() => askRemove(r)}><Trash2 className="size-3.5" /></IconButton> : null)} />
        </DataTable>
      </div>
      <Button size="sm" variant="ghost" onClick={addRow} icon={<Plus className="size-3" />}>Add another account</Button>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save {rows.length} account{rows.length > 1 ? 's' : ''}</Button>
      </div>
      <AddLookupModal
        type="bank" title="Add a bank" withCurrency open={addingBankFor !== null} onClose={() => setAddingBankFor(null)}
        onAdded={(b) => addingBankFor !== null && upd(addingBankFor, { bank: b.code })}
      />
    </form>
  );
}

// ---------------- Edit one account ----------------

function EditAccount({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const { isCouple } = useAuth();
  const toast = useToast();
  const ownerOptions = useOwnerOptions();
  const [f, setF] = useState({ ...account, ownerId: account.ownerId ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  // The balance tracking starts from (entered when the account was added); editable to correct it.
  const history = useApi<{ month: string; balance: number; opening?: boolean }[]>(`/accounts/${account.id}/balances`);
  const savedOpening = history.data?.find((b) => b.month === account.openedMonth && b.opening)?.balance ?? null;
  const [opening, setOpening] = useState<number | null | undefined>(undefined); // undefined: unchanged
  const openingValue = opening === undefined ? savedOpening : opening;

  async function save(patch?: Partial<Account>) {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/accounts/${account.id}`, patch ?? {
        name: f.name, bank: f.bank, accountType: f.accountType, type: f.type, ownerId: f.type === 'personal' ? f.ownerId : null,
        accountNumberLast4: f.accountNumberLast4, openedMonth: f.openedMonth, notes: f.notes,
        ...(opening !== undefined && opening !== savedOpening && { openingBalance: opening }),
      });
      toast.success(patch?.archived ? `${account.name} closed` : `${f.name} saved`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  const askClose = () => confirmAction({
    header: `Close “${account.name}”?`,
    message: 'The account is hidden from every month and from wealth totals. Its recorded balances are kept.',
    acceptLabel: 'Close account',
    onAccept: () => save({ archived: true }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
      <Field label="Name"><TextInput value={f.name} onChange={(v) => setF({ ...f, name: v })} required maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank">
          <div className="flex gap-1">
            <LookupSelect type="bank" value={f.bank} onChange={(v) => setF({ ...f, bank: v })} />
            <AddValueButton title="Add a bank" onClick={() => setAddingBank(true)} />
          </div>
        </Field>
        <Field label="Type"><LookupSelect type="accountType" value={f.accountType} onChange={(v) => setF({ ...f, accountType: v })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {isCouple && (
          <Field label="Owner" hint="Common: the shared account you both move money into for common bills. Your own savings stay under your name.">
            <Select value={f.type === 'common' ? 'common' : f.ownerId} options={ownerOptions}
              onChange={(v) => setF(v === 'common' ? { ...f, type: 'common' } : { ...f, type: 'personal', ownerId: v })} />
          </Field>
        )}
        <Field label="Last 4 digits"><TextInput value={f.accountNumberLast4} onChange={(v) => setF({ ...f, accountNumberLast4: v.replace(/\D/g, '').slice(0, 4) })} /></Field>
        <Field label="Tracked from"><MonthInput value={f.openedMonth} onChange={(v) => setF({ ...f, openedMonth: v })} /></Field>
      </div>
      <Field
        label={`Opening balance (${account.currency}, start of ${monthLabel(f.openedMonth)})`}
        hint="What the account held when tracking started. Later months add the linked income, expenses and transfers to it."
      >
        <NumberInput value={openingValue} onChange={setOpening} placeholder={history.loading ? 'Loading…' : ''} ariaLabel="Opening balance" />
      </Field>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={500} /></Field>
      <p className="text-[11px] text-stone-500">Currency: {account.currency} (fixed once balances exist).</p>
      <ErrorNote message={error} />
      <div className="flex justify-between gap-2">
        <Button variant="danger" onClick={askClose} title="Hide the account from every month (balances are kept)" icon={<Archive className="size-3.5" />}>Close account</Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
        </div>
      </div>
      <AddLookupModal type="bank" title="Add a bank" withCurrency open={addingBank} onClose={() => setAddingBank(false)} onAdded={(b) => setF((x) => ({ ...x, bank: b.code }))} />
    </form>
  );
}

// ---------------- Update month balances ----------------

function UpdateBalances({ accounts, month, onClose, onSaved }: { accounts: WealthAccount[]; month: string; onClose: () => void; onSaved: () => void }) {
  const { label } = useLookups();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, { balance: number | null; invested: number | null }>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, {
      balance: a.recordedThisMonth ? a.current : null,
      invested: a.recordedThisMonth ? a.invested : null,
    }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (id: string, patch: Partial<{ balance: number | null; invested: number | null }>) => setValues((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = accounts
      .map((a) => ({ a, v: values[a.id] }))
      // Blank = carry forward. Clearing a value recorded this month removes that record.
      .filter(({ a, v }) => v.balance !== null || a.recordedThisMonth)
      .map(({ a, v }) => ({ accountId: a.id, balance: v.balance, invested: a.group === 'investment' ? v.invested : null }));
    if (!items.length) { onClose(); return; }
    // A cleared value deletes the balance recorded for this month, so ask first.
    const removed = accounts.filter((a) => items.some((i) => i.accountId === a.id && i.balance === null));
    if (!removed.length) { await save(items); return; }
    confirmAction({
      header: `Remove ${removed.length > 1 ? `${removed.length} recorded balances` : 'recorded balance'}?`,
      message: <>The {monthLabel(month)} balance of {removed.map((a) => a.name).join(', ')} will be deleted, and the last earlier balance carries forward instead.</>,
      acceptLabel: 'Remove',
      onAccept: () => save(items),
    });
  }

  async function save(items: { accountId: string; balance: number | null; invested: number | null }[]) {
    setBusy(true);
    setError(null);
    try {
      await api.put('/account-balances', { month, items });
      toast.success(`${items.length} balance${items.length > 1 ? 's' : ''} saved for ${monthLabel(month)}`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-stone-500">Balance at the end of {monthLabel(month)}. Leave blank to carry the last balance forward. Loans & cards: amount outstanding.</p>
      <div className="overflow-hidden rounded-md border border-stone-200">
        <DataTable value={accounts} dataKey="id" size="small" scrollable scrollHeight="60vh" tableStyle={{ minWidth: '48rem' }}>
          <Column header="Account" body={(a: WealthAccount) => (
            <div>
              <div className="text-sm font-medium">{a.name}</div>
              <div className="text-[11px] text-stone-500">{label('bank', a.bank)} · {label('accountType', a.accountType)} · {a.currency}</div>
            </div>
          )} />
          <Column header={monthLabel(addMonths(month, -1), 'short')} align="right" style={{ width: '10rem' }} body={(a: WealthAccount) => <span className="text-xs text-stone-500"><Amount value={a.previous} currency={a.currency} /></span>} />
          <Column header={monthLabel(month, 'short')} style={{ width: '12rem' }} body={(a: WealthAccount) => (
            <NumberInput value={values[a.id].balance} onChange={(v) => set(a.id, { balance: v })} placeholder={a.current !== null ? moneyIn(a.current, a.currency) : ''} ariaLabel={`${a.name} balance`} />
          )} />
          <Column header="Invested" style={{ width: '11rem' }} body={(a: WealthAccount) => (
            a.group === 'investment'
              ? <NumberInput value={values[a.id].invested} onChange={(v) => set(a.id, { invested: v })} min={0} placeholder={a.invested !== null ? moneyIn(a.invested, a.currency) : ''} />
              : <span className="block text-center text-stone-300">—</span>
          )} />
        </DataTable>
      </div>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save balances</Button>
      </div>
    </form>
  );
}

// ---------------- Transfers ----------------

function TransferForm({ accounts, month, onClose, onSaved }: { accounts: WealthAccount[]; month: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const aed = accounts.find((a) => a.currency === 'AED' && a.group === 'cash') ?? accounts[0];
  const inr = accounts.find((a) => a.currency === 'INR' && a.group === 'cash') ?? accounts[1] ?? accounts[0];
  const [f, setF] = useState({
    date: todayStr().startsWith(month) ? todayStr() : `${month}-01`,
    fromAccountId: aed?.id ?? '', toAccountId: inr?.id ?? '',
    amount: null as number | null, toAmount: null as number | null, fee: null as number | null, note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = accounts.find((a) => a.id === f.fromAccountId);
  const to = accounts.find((a) => a.id === f.toAccountId);
  const cross = !!from && !!to && from.currency !== to.currency;
  const rate = cross && f.amount && f.toAmount ? f.toAmount / f.amount : null;
  const opts = accounts.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.amount) { setError('Enter the amount sent'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post('/transfers', { ...f, toAmount: cross ? f.toAmount : null, fee: f.fee ?? 0 });
      toast.success(`Transfer recorded: ${moneyIn(f.amount, from!.currency)} ${from!.currency}`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Select value={f.fromAccountId} onChange={(v) => setF({ ...f, fromAccountId: v })} options={opts} /></Field>
        <Field label="To"><Select value={f.toAccountId} onChange={(v) => setF({ ...f, toAccountId: v })} options={opts} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Sent${from ? ` (${from.currency})` : ''}`}><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} min={0.01} required autoFocus /></Field>
        {cross
          ? <Field label={`Received (${to!.currency})`}><NumberInput value={f.toAmount} onChange={(v) => setF({ ...f, toAmount: v })} min={0.01} required /></Field>
          : <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} max={todayStr()} required /></Field>}
      </div>
      {cross && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} max={todayStr()} required /></Field>
          <Field label={`Fee (${from!.currency})`} hint={rate ? `Rate: 1 ${from!.currency} = ${rate.toFixed(4)} ${to!.currency}` : undefined}>
            <NumberInput value={f.fee} onChange={(v) => setF({ ...f, fee: v })} min={0} />
          </Field>
        </div>
      )}
      <Field label="Note"><TextInput value={f.note} onChange={(v) => setF({ ...f, note: v })} maxLength={200} placeholder="e.g. Monthly family support" /></Field>
      <p className="text-[11px] text-stone-500">Transfers are a record for analysis. Update the account balances at month end as usual.</p>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Record transfer</Button>
      </div>
    </form>
  );
}

function TransfersTab({ accounts, month, tick }: { accounts: WealthAccount[]; month: string; tick: number }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Transfer[]>(`/transfers?month=${month}&r=${tick}`);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const paging = usePaging(month);
  const askArchive = (t: Transfer) => confirmAction({
    header: 'Archive transfer?',
    message: 'It is removed from this month’s transfers and the wealth analysis.',
    acceptLabel: 'Archive',
    onAccept: async () => {
      try { await api.post(`/transfers/${t._id}/archive`); toast.success('Transfer archived'); reload(); } catch (e) { toast.error(errorText(e)); }
    },
  });
  return (
    <TableCard>
      <ErrorNote message={error} />
      <DataTable
        value={data ?? []}
        dataKey="_id"
        {...paging}
        size="small"
        tableStyle={{ minWidth: '44rem' }}
        emptyMessage={loading && !data ? <TableSkeleton cols={5} /> : <Empty icon={<ArrowRightLeft className="size-8" />} title={`No transfers in ${monthLabel(month)}`}>Record money moved between accounts, such as AED to INR remittances.</Empty>}
      >
        <Column header="Date" body={(t: Transfer) => <span className="num text-stone-600">{dateLabel(t.date)}</span>} />
        <Column header="From / to" body={(t: Transfer) => (
          <div>
            <span className="inline-flex items-center gap-1">{byId.get(t.fromAccountId)?.name ?? '?'} <ArrowRight className="size-3 text-stone-400" /> {byId.get(t.toAccountId)?.name ?? '?'}</span>
            {t.note && <div className="text-[11px] text-stone-500">{t.note}</div>}
          </div>
        )} />
        <Column header="Sent" align="right" body={(t: Transfer) => {
          const c = byId.get(t.fromAccountId)?.currency ?? '';
          return <div><Amount value={t.amount} currency={c} /> <span className="text-[11px] text-stone-400">{c}</span>{t.fee > 0 && <div className="text-[11px] text-stone-400">fee {moneyIn(t.fee, c)}</div>}</div>;
        }} />
        <Column header="Received" align="right" body={(t: Transfer) => {
          const c = byId.get(t.toAccountId)?.currency ?? '';
          return <span><Amount value={t.toAmount} currency={c} /> <span className="text-[11px] text-stone-400">{c}</span></span>;
        }} />
        <Column header="Rate" align="right" body={(t: Transfer) => (
          <span className="num text-xs text-stone-500">{byId.get(t.fromAccountId)?.currency !== byId.get(t.toAccountId)?.currency ? (t.toAmount / t.amount).toFixed(4) : '—'}</span>
        )} />
        <Column align="right" style={{ width: '3rem' }} body={(t: Transfer) => <IconButton title="Archive" danger onClick={() => askArchive(t)}><Archive className="size-3.5" /></IconButton>} />
      </DataTable>
    </TableCard>
  );
}

// ---------------- Page ----------------

type Section = 'bank' | 'investments' | 'loans';
const SECTIONS: Record<Section, { title: string; subtitle: string; groups: AccountGroup[]; noun: string }> = {
  bank: { title: 'Accounts', subtitle: 'Bank accounts: savings, current, NRE / NRO and cash', groups: ['cash'], noun: 'bank account' },
  investments: { title: 'Investments', subtitle: 'Deposits, stocks, mutual funds, SIPs, gold and PPF / NPS', groups: ['deposit', 'investment'], noun: 'investment' },
  loans: { title: 'Loans & cards', subtitle: 'Housing loan, other loans and credit cards: the amount outstanding', groups: ['liability'], noun: 'loan or card' },
};

export default function Accounts({ section = 'bank' }: { section?: Section }) {
  const S = SECTIONS[section];
  const { month } = useMonth();
  const { memberName, isCouple } = useAuth();
  const { label, options } = useLookups();
  const { data, error, loading, reload } = useApi<Wealth>(`/wealth?month=${month}`);
  const currencies = useMemo(() => {
    const used = new Set((data?.accounts ?? []).map((a) => a.currency));
    const base = options('currency').map((c) => c.code).filter((c) => c === 'AED' || c === 'INR' || used.has(c));
    return [...new Set([...base, ...used])];
  }, [data, options]);
  const [tab, setTab] = useState<string>('AED');
  const [group, setGroup] = useState<AccountGroup | 'all'>('all');
  const groupTabs: (AccountGroup | 'all')[] = S.groups.length > 1 ? ['all', ...S.groups] : [];
  const [modal, setModal] = useState<'add' | 'balances' | 'transfer' | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [transferTick, setTransferTick] = useState(0);
  const paging = usePaging([month, tab, group, section]);

  const everything = data?.accounts ?? [];
  const all = everything.filter((a) => S.groups.includes(a.group));
  const inCurrency = all.filter((a) => a.currency === tab);
  // Investments: one tab per type (stocks, mutual funds, gold…); the gold tab always shows.
  const [kind, setKind] = useState<string>(section === 'loans' ? 'home_loan' : 'all');
  const kinds = section === 'investments' ? [...new Set([...inCurrency.map((a) => a.accountType), 'gold'])]
    : section === 'loans' ? [...new Set(['home_loan', 'car_loan', 'personal_loan', 'credit_card', ...inCurrency.map((a) => a.accountType)])] : [];
  const kindLabel = (k: string) => (k === 'all' ? 'All' : label('accountType', k));
  const rows = inCurrency.filter((a) => (group === 'all' || a.group === group) && (kind === 'all' || a.accountType === kind));
  // A loan tab with loans: just each loan's own cards and statement (no list or second set of cards).
  const loanView = section === 'loans' && kind !== 'all' && kind !== 'credit_card' && rows.length > 0;
  const stale = inCurrency.filter((a) => !a.recordedThisMonth).length;
  const isTransfers = tab === 'transfers';

  return (
    <Page fill={section === "bank"}>
      <PageHeader
        title={S.title}
        subtitle={`${S.subtitle} · end of ${monthLabel(month)}`}
        actions={<>
          {section === 'bank' && <Button onClick={() => setModal('transfer')} disabled={everything.length < 2} icon={<ArrowRightLeft className="size-3.5" />}>Transfer</Button>}
          {!isTransfers && <Button onClick={() => setModal('add')} icon={<Plus className="size-3.5" />}>{kind === 'all' ? `Add ${S.noun}s` : `Add ${kindLabel(kind)}`}</Button>}
          {!isTransfers && <Button variant="primary" onClick={() => setModal('balances')} disabled={!rows.length} icon={<RefreshCw className="size-3.5" />}>{kind === 'all' ? 'Update balances' : `Update ${kindLabel(kind)} values`}</Button>}
        </>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<string>
          value={tab}
          onChange={setTab}
          items={[...currencies.map((c) => ({ value: c, label: c === 'AED' ? 'AED · UAE' : c === 'INR' ? 'INR · India' : c, count: all.filter((a) => a.currency === c).length })), ...(section === 'bank' ? [{ value: 'transfers', label: 'Transfers' }] : [])]}
        />
        {!isTransfers && kinds.length > 0 && (
          <Tabs<string> value={kind} onChange={setKind} items={['all', ...kinds].map((k) => ({ value: k, label: kindLabel(k), count: k === 'all' ? inCurrency.length : inCurrency.filter((a) => a.accountType === k).length }))} />
        )}
        {!isTransfers && kinds.length === 0 && groupTabs.length > 0 && (
          <Tabs<AccountGroup | 'all'> value={group} onChange={setGroup} items={groupTabs.map((g) => ({ value: g, label: g === 'all' ? 'All' : GROUP_LABEL[g] }))} />
        )}
      </div>
      <ErrorNote message={error} />

      {isTransfers ? (
        <TransfersTab accounts={everything} month={month} tick={transferTick} />
      ) : (
        <>
          {!loanView && rows.length > 0 && (() => {
            const now = rows.reduce((s, a) => s + (a.current ?? 0), 0);
            const before = rows.reduce((s, a) => s + (a.previous ?? 0), 0);
            const n = `${rows.length} ${kind === 'all' ? S.noun : kindLabel(kind).toLowerCase()}${rows.length === 1 || kind !== 'all' ? '' : 's'}`;
            if (section === 'investments') {
              const invested = rows.reduce((s, a) => s + (a.invested ?? a.current ?? 0), 0);
              return <StatRail items={[
                { label: 'Current value', value: now, currency: tab, icon: <CreditCard className="size-3.5" />, sub: `${n} · end of ${monthLabel(month, 'short')}` },
                { label: 'Invested', value: invested, currency: tab, icon: <Plus className="size-3.5" />, sub: 'Amount put in' },
                { label: 'Gain / loss', value: now - invested, currency: tab, tone: now - invested < 0 ? 'text-rose-700' : 'text-emerald-700', icon: <ArrowRight className="size-3.5" />, sub: invested > 0 ? `${(((now - invested) / invested) * 100).toFixed(2)}%` : '—' },
                { label: 'Change vs last month', value: now - before, currency: tab, tone: now - before < 0 ? 'text-rose-700' : 'text-emerald-700', icon: <RefreshCw className="size-3.5" />, sub: `${monthLabel(addMonths(month, -1), 'short')}: ${moneyIn(before, tab)}` },
              ]} />;
            }
            if (section === 'loans') {
              return <StatRail items={[
                { label: 'Outstanding', value: now, currency: tab, tone: now > 0 ? 'text-rose-700' : 'text-stone-900', icon: <Archive className="size-3.5" />, sub: n },
                { label: 'Last month', value: before, currency: tab, icon: <RefreshCw className="size-3.5" />, sub: monthLabel(addMonths(month, -1), 'short') },
                { label: 'Paid down', value: before - now, currency: tab, tone: before - now >= 0 ? 'text-emerald-700' : 'text-rose-700', icon: <ArrowRight className="size-3.5" />, sub: 'Since last month' },
              ]} />;
            }
            const common = rows.filter((a) => a.type === 'common').reduce((s, a) => s + (a.current ?? 0), 0);
            return <StatRail items={[
              { label: `In the bank · ${tab}`, value: now, currency: tab, tone: now < 0 ? 'text-rose-700' : 'text-emerald-700', icon: <CreditCard className="size-3.5" />, sub: `${n} · end of ${monthLabel(month, 'short')}` },
              ...(isCouple ? [{ label: 'Personal accounts', value: now - common, currency: tab, icon: <Plus className="size-3.5" />, sub: 'Both of you' }] : []),
              ...(isCouple ? [{ label: 'Common account', value: common, currency: tab, tone: 'text-violet-700', icon: <Archive className="size-3.5" />, sub: 'Shared bills money' }] : []),
              { label: 'Change vs last month', value: now - before, currency: tab, tone: now - before < 0 ? 'text-rose-700' : 'text-emerald-700', icon: <ArrowRight className="size-3.5" />, sub: `${monthLabel(addMonths(month, -1), 'short')}: ${moneyIn(before, tab)}` },
            ]} />;
          })()}
          {!loanView && stale > 0 && inCurrency.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {stale} of {inCurrency.length} {tab} account{inCurrency.length > 1 ? 's' : ''} without an entered balance for {monthLabel(month)}: showing the calculated balance (last entered balance + linked income − expenses).{' '}
              <button className="font-medium underline" onClick={() => setModal('balances')}>Update now</button>
            </div>
          )}
          {!loanView && (<>
          <TableCard>
            <DataTable
              value={rows}
              dataKey="id"
              {...paging}
              size="small"
              tableStyle={{ minWidth: '48rem' }}
              emptyMessage={loading && !data ? <TableSkeleton cols={isCouple ? 7 : 6} /> : <Empty icon={<CreditCard className="size-8" />} title={`No ${tab} ${S.noun}s yet`}>
                {section === 'bank' ? (tab === 'INR' ? 'Add your Federal NRE / NRO, HDFC, ICICI… accounts' : 'Add your ENBD, RAK, EIB… accounts') : section === 'investments' ? 'Add deposits, Zerodha stocks, mutual funds, SIPs or gold' : 'Add a housing loan, car loan or credit card'} to track them month by month.
              </Empty>}
              footer={rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-stone-600">Total {tab}{section === 'loans' ? ' outstanding' : ''}</span>
                  <span className="flex items-center gap-4">
                    <span className="text-stone-500">{monthLabel(addMonths(month, -1), 'short')} <Amount value={rows.reduce((s, a) => s + (a.previous ?? 0), 0)} currency={tab} /></span>
                    <span className="font-semibold">{monthLabel(month, 'short')} <Amount value={rows.reduce((s, a) => s + (a.current ?? 0), 0)} currency={tab} /></span>
                  </span>
                </div>
              )}
            >
              <Column header="Account" body={(a: WealthAccount) => (
                <div>
                  <div className="flex items-center gap-1.5 font-medium">{a.name}{a.accountNumberLast4 && <span className="num text-[11px] font-normal text-stone-400">••{a.accountNumberLast4}</span>}</div>
                  <div className="text-[11px] text-stone-500">{label('bank', a.bank)} · {label('accountType', a.accountType)}{!a.recordedThisMonth && a.lastRecordedMonth && ` · calculated from ${monthLabel(a.lastRecordedMonth, 'short')}`}</div>
                </div>
              )} />
              {isCouple && <Column header="Owner" body={(a: WealthAccount) => a.type === 'common' ? <Badge tone="violet">Common</Badge> : <span className="text-xs text-stone-600">{memberName(a.ownerId)}</span>} />}
              <Column header={monthLabel(addMonths(month, -1), 'short')} align="right" body={(a: WealthAccount) => <span className="text-stone-500"><Amount value={a.previous} currency={a.currency} /></span>} />
              <Column header={monthLabel(month, 'short')} align="right" body={(a: WealthAccount) => <Amount value={a.current} currency={a.currency} className={cx('font-medium', !a.recordedThisMonth && 'text-stone-400')} />} />
              {/* For loans a falling balance is good, so colour by the effect on net worth. */}
              <Column header="Change" align="right" body={(a: WealthAccount) => <span className="text-xs"><Amount value={a.change === null ? null : a.group === 'liability' ? -a.change : a.change} currency={a.currency} signed className={a.change ? '' : 'text-stone-400'} /></span>} />
              <Column header="Gain" align="right" body={(a: WealthAccount) => <span className="text-xs">{a.gain !== null ? <Amount value={a.gain} currency={a.currency} signed /> : <span className="text-stone-300">—</span>}</span>} />
              <Column align="right" style={{ width: '3rem' }} body={(a: WealthAccount) => <IconButton title="Edit" onClick={() => setEditing(a)}><Pencil className="size-3.5" /></IconButton>} />
            </DataTable>
          </TableCard>
          <p className="mt-2 shrink-0 text-[11px] text-stone-500">Change for loans and cards shows the effect on net worth (paying down a loan is positive). Gain = current value − amount invested.</p>
          </>)}
          {section === 'investments' && kind === 'gold' && <div className="mt-4"><GoldSection currency={tab} accounts={everything} onChanged={reload} /></div>}
          {loanView && rows.map((a) => (
            <div key={a.id} className="mt-1"><LoanLedger account={a} onChanged={reload} onEdit={() => setEditing(a)} /></div>
          ))}
          {section === 'loans' && !rows.some((a) => a.accountType !== 'credit_card') && kind !== 'credit_card' && (
            <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
              Add a {kind === 'all' ? 'home or car loan' : kindLabel(kind).toLowerCase()} with the Add button above, then add its statement rows here each month: interest, EMIs and prepayments.
            </p>
          )}
        </>
      )}

      <Modal open={modal === 'add'} onClose={() => setModal(null)} title={`Add ${S.noun}s`} size="xl">
        <AddAccounts currency={tab === 'transfers' ? 'AED' : tab} currencies={currencies} groups={S.groups} defaultType={kind === 'all' ? undefined : kind} month={month} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      </Modal>
      <Modal open={modal === 'balances'} onClose={() => setModal(null)} title={`${tab}${kind !== 'all' ? ` ${kindLabel(kind)}` : ''} balances · ${monthLabel(month)}`} size="xl">
        <UpdateBalances accounts={kind === 'all' ? inCurrency : rows} month={month} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      </Modal>
      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} title="Record a transfer">
        <TransferForm accounts={all} month={month} onClose={() => setModal(null)} onSaved={() => { setModal(null); setTransferTick((t) => t + 1); reload(); setTab('transfers'); }} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit account" size="lg">
        {editing && <EditAccount account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      </Modal>
    </Page>
  );
}
