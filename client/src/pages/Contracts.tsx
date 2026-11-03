import { useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Archive, CalendarClock, CheckCircle2, Clock, FileText, Pencil, PiggyBank, Plus, RefreshCw, RotateCcw, Undo2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account, Cheque, Commitment, Contract, Deposit, Kind } from '../lib/types';
import { money, todayStr } from '../lib/format';
import {
  Badge, Button, DateInput, Empty, ErrorNote, Field, IconButton, Modal, Money, NumberInput, Page, PageHeader, Select, TableCard, TextInput, confirmAction, cx, useToast,
} from '../components/ui';
import { FormFooter } from '../components/forms';

const fullDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const daysUntil = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayStr()}T00:00:00Z`)) / 86_400_000);

/** Owner dropdown: each partner, or "Common". */
function useOwners() {
  const { workspace } = useAuth();
  return [...(workspace?.members ?? []).map((m) => ({ label: m.displayName, value: m.userId })), { label: 'Common', value: 'common' }];
}
const ownerValue = (x: { type: Kind; ownerId: string | null }) => (x.type === 'common' ? 'common' : x.ownerId ?? '');
const fromOwner = (v: string) => (v === 'common' ? { type: 'common' as Kind, ownerId: null } : { type: 'personal' as Kind, ownerId: v });

/** New contract, or edit an existing one (changing rent, length or cheques re-plans the uncleared cheques). */
function ContractForm({ initial, onClose, onSaved }: { initial?: Contract; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const owners = useOwners();
  const accounts = useApi<Account[]>('/accounts');
  const commitments = useApi<Commitment[]>('/commitments');
  const [f, setF] = useState({
    name: initial?.name ?? 'Apartment rent',
    owner: initial ? ownerValue(initial) : 'common',
    startDate: initial?.startDate ?? todayStr(),
    months: initial?.months ?? 12 as number | null,
    totalAmount: initial?.totalAmount ?? null as number | null,
    chequeCount: initial?.cheques.length ?? 6 as number | null,
    chequesPaid: 0 as number | null,
    commitmentId: initial?.commitmentId ?? '',
    accountId: initial?.accountId ?? '',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const each = f.totalAmount && f.chequeCount ? f.totalAmount / f.chequeCount : 0;
  const monthly = f.totalAmount && f.months ? f.totalAmount / f.months : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.totalAmount || !f.months || !f.chequeCount) { setError('Enter the rent for the contract, its length and the number of cheques'); return; }
    setBusy(true);
    setError(null);
    const body = {
      ...fromOwner(f.owner), name: f.name, startDate: f.startDate, months: f.months, totalAmount: f.totalAmount, chequeCount: f.chequeCount,
      commitmentId: f.commitmentId || null, accountId: f.accountId || null, notes: f.notes,
    };
    try {
      if (initial) await api.put(`/contracts/${initial.id}`, body);
      else await api.post('/contracts', { ...body, chequesPaid: f.chequesPaid ?? 0 });
      toast.success(`${f.name} ${initial ? 'updated' : 'added'}`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><TextInput value={f.name} onChange={(v) => setF({ ...f, name: v })} required maxLength={80} /></Field>
        <Field label="Belongs to"><Select value={f.owner} options={owners} onChange={(v) => setF({ ...f, owner: v || (user?.id ?? '') })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Starts on"><DateInput value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} required /></Field>
        <Field label="Months"><NumberInput value={f.months} onChange={(v) => setF({ ...f, months: v })} min={1} max={60} decimals={0} required /></Field>
        <Field label="Cheques"><NumberInput value={f.chequeCount} onChange={(v) => setF({ ...f, chequeCount: v })} min={1} max={60} decimals={0} required /></Field>
      </div>
      <Field label="Rent for the whole contract (AED)" hint={each > 0 ? `${f.chequeCount} cheques of ${money(each)} · ${money(monthly)} a month in the budget` : 'e.g. 36,000 for a year'}>
        <NumberInput value={f.totalAmount} onChange={(v) => setF({ ...f, totalAmount: v })} min={0.01} required />
      </Field>
      {!initial && (
        <Field label="Cheques already paid before tracking" hint="These are marked cleared and don't change any balance (e.g. the first cheque paid on signing).">
          <NumberInput value={f.chequesPaid} onChange={(v) => setF({ ...f, chequesPaid: v })} min={0} max={60} decimals={0} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly commitment" hint="Its monthly amount is kept at the contract's monthly rent.">
          <Select value={f.commitmentId} showClear placeholder="None"
            options={(commitments.data ?? []).filter((c) => c.status !== 'ended').map((c) => ({ label: c.title, value: c.id }))}
            onChange={(v) => setF({ ...f, commitmentId: v || '' })} />
        </Field>
        <Field label="Cheques drawn on" hint="The account the cheques leave when they clear.">
          <Select value={f.accountId} showClear placeholder="None"
            options={(accounts.data ?? []).filter((a) => !a.archived && a.group === 'cash').map((a) => ({ label: a.name, value: a.id }))}
            onChange={(v) => setF({ ...f, accountId: v || '' })} />
        </Field>
      </div>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={500} /></Field>
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save' : 'Add contract'}</Button>
      </FormFooter>
    </form>
  );
}

/** Next year's contract: new rent and cheque count, from the day after this one ends. */
function RenewForm({ contract, onClose, onSaved }: { contract: Contract; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [total, setTotal] = useState<number | null>(contract.totalAmount);
  const [count, setCount] = useState<number | null>(contract.cheques.length);
  const [months, setMonths] = useState<number | null>(contract.months);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!total || !count || !months) return;
    setBusy(true);
    try {
      await api.post(`/contracts/${contract.id}/renew`, { totalAmount: total, chequeCount: count, months });
      toast.success(`${contract.name} renewed`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-stone-600">The new contract starts the day after {fullDate(contract.endDate)}. The monthly commitment follows the new rent from then on.</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Rent (AED)"><NumberInput value={total} onChange={setTotal} min={0.01} required /></Field>
        <Field label="Months"><NumberInput value={months} onChange={setMonths} min={1} max={60} decimals={0} required /></Field>
        <Field label="Cheques"><NumberInput value={count} onChange={setCount} min={1} max={60} decimals={0} required /></Field>
      </div>
      {total && count ? <p className="text-[11px] text-stone-500">{count} cheques of {money(total / count)} · {money(total / (months || 12))} a month</p> : null}
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Renew</Button>
      </FormFooter>
    </form>
  );
}

function DepositForm({ initial, contracts, onClose, onSaved }: { initial?: Deposit; contracts: Contract[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const owners = useOwners();
  const [f, setF] = useState({
    name: initial?.name ?? '', amount: initial?.amount ?? null as number | null, owner: initial ? ownerValue(initial) : user?.id ?? '',
    contractId: initial?.contractId ?? '', paidDate: initial?.paidDate ?? '', notes: initial?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.amount) { setError('Enter the amount'); return; }
    setBusy(true);
    const body = { ...fromOwner(f.owner), name: f.name, amount: f.amount, contractId: f.contractId || null, paidDate: f.paidDate || null, notes: f.notes };
    try {
      if (initial) await api.put(`/deposits/${initial.id}`, body);
      else await api.post('/deposits', body);
      toast.success(`${f.name} ${initial ? 'updated' : 'added'}`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><TextInput value={f.name} onChange={(v) => setF({ ...f, name: v })} required maxLength={80} placeholder="e.g. DEWA deposit" /></Field>
        <Field label="Amount (AED)"><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} min={0.01} required /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Belongs to"><Select value={f.owner} options={owners} onChange={(v) => setF({ ...f, owner: v || (user?.id ?? '') })} /></Field>
        <Field label="Paid on"><DateInput value={f.paidDate} onChange={(v) => setF({ ...f, paidDate: v })} /></Field>
        <Field label="Contract">
          <Select value={f.contractId} showClear placeholder="None" options={contracts.map((c) => ({ label: c.name, value: c.id }))} onChange={(v) => setF({ ...f, contractId: v || '' })} />
        </Field>
      </div>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={500} /></Field>
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save' : 'Add deposit'}</Button>
      </FormFooter>
    </form>
  );
}

/** Marks a cheque cleared on a date (it then leaves its account), or back to waiting. */
export function ChequeModal({ contract, cheque, onClose, onSaved }: { contract: Contract | null; cheque: Cheque | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!contract || !cheque) return;
    setBusy(true);
    try {
      await api.put(`/contracts/${contract.id}/cheques/${cheque.id}`, { cleared: true, clearedDate: date });
      toast.success(`Cheque of ${money(cheque.amount)} cleared`);
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!cheque} onClose={onClose} title={`Cheque cleared · ${contract?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-stone-600">
          The {fullDate(cheque?.date)} cheque of <Money value={cheque?.amount ?? 0} /> AED leaves the account on the date it cleared.
        </p>
        <Field label="Cleared on"><DateInput value={date} max={todayStr()} onChange={setDate} required /></Field>
        <ErrorNote message={error} />
        <FormFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Cheque cleared</Button>
        </FormFooter>
      </form>
    </Modal>
  );
}

/** Contract summary: progress through the cheques, the next one due, and a renewal reminder. */
function ContractCard({ c, accountName, memberName, onEdit, onRenew, onArchive, onClear, onUndo }: {
  c: Contract; accountName: (id: string | null) => string | undefined; memberName: (id: string | null) => string;
  onEdit: () => void; onRenew: () => void; onArchive: () => void; onClear: (q: Cheque) => void; onUndo: (q: Cheque) => void;
}) {
  const cleared = c.cheques.filter((q) => q.cleared);
  const next = c.cheques.find((q) => !q.cleared);
  const ends = daysUntil(c.endDate);
  return (
    <TableCard>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <FileText className="size-4 text-brand-600" />{c.name}
            {c.type === 'common' ? <Badge tone="violet">Common</Badge> : <Badge tone="sky">{memberName(c.ownerId)}</Badge>}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {fullDate(c.startDate)} → {fullDate(c.endDate)} · {c.months} months · <Money value={c.totalAmount} /> AED
            · <Money value={c.monthly} /> a month{c.accountId && <> · cheques from {accountName(c.accountId)}</>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-stone-700">{cleared.length} of {c.cheques.length} cheques cleared</span>
            {next && (
              <span className={cx('inline-flex items-center gap-1', daysUntil(next.date) <= 7 ? 'text-amber-700' : 'text-stone-600')}>
                <CalendarClock className="size-3.5" /> Next: {fullDate(next.date)} · <Money value={next.amount} />
                {daysUntil(next.date) >= 0 ? ` (in ${daysUntil(next.date)} days)` : ' (date passed)'}
              </span>
            )}
            {ends <= 60 && ends >= 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Ends in {ends} days: renew</span>}
            {ends < 0 && <span className="rounded-md bg-stone-100 px-2 py-0.5 text-stone-600">Ended</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onRenew} icon={<RefreshCw className="size-3.5" />}>Renew</Button>
          <IconButton title="Edit" onClick={onEdit}><Pencil className="size-3.5" /></IconButton>
          <IconButton title="Archive" danger onClick={onArchive}><Archive className="size-3.5" /></IconButton>
        </div>
      </div>
      <DataTable value={c.cheques} dataKey="id" size="small">
        <Column header="#" body={(_q: Cheque, o) => <span className="text-stone-500">{o.rowIndex + 1}</span>} style={{ width: '3rem' }} />
        <Column header="Cheque date" body={(q: Cheque) => fullDate(q.date)} />
        <Column header="Amount" align="right" body={(q: Cheque) => <Money value={q.amount} className="font-medium" />} />
        <Column header="Status" body={(q: Cheque) => (q.cleared
          ? <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Cleared{q.clearedDate && q.clearedDate !== q.date ? ` · ${fullDate(q.clearedDate)}` : ''}</span>
          : <span className={cx('inline-flex items-center gap-1 text-xs', daysUntil(q.date) < 0 ? 'text-rose-600' : 'text-stone-500')}><Clock className="size-3.5" /> {daysUntil(q.date) < 0 ? 'Due, not cleared' : 'Waiting'}</span>)} />
        <Column align="right" body={(q: Cheque) => (q.cleared
          ? <IconButton title="Mark as not cleared" onClick={() => onUndo(q)}><Undo2 className="size-3.5" /></IconButton>
          : <Button size="sm" onClick={() => onClear(q)}>Cleared</Button>)} style={{ width: '7rem' }} />
      </DataTable>
    </TableCard>
  );
}

export default function Contracts() {
  const { memberName } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ contracts: Contract[]; deposits: Deposit[] }>('/contracts');
  const accounts = useApi<Account[]>('/accounts');
  const [editing, setEditing] = useState<Contract | 'new' | null>(null);
  const [renewing, setRenewing] = useState<Contract | null>(null);
  const [deposit, setDeposit] = useState<Deposit | 'new' | null>(null);
  const [clearing, setClearing] = useState<{ c: Contract; q: Cheque } | null>(null);
  const contracts = data?.contracts ?? [];
  const deposits = data?.deposits ?? [];
  const held = deposits.filter((d) => !d.refundedDate);
  const accountName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name;

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); reload(); } catch (err) { toast.error(errorText(err)); }
  }

  return (
    <Page>
      <PageHeader
        title="Contracts & deposits"
        subtitle="Rent paid by cheques, contract dates to renew, and deposits held"
        actions={<>
          <Button onClick={() => setDeposit('new')} icon={<PiggyBank className="size-3.5" />}>Add deposit</Button>
          <Button variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>Add contract</Button>
        </>}
      />
      <ErrorNote message={error} />
      <div className="space-y-4">
        {!loading && contracts.length === 0 && (
          <div className="card">
            <Empty icon={<FileText className="size-8" />} title="No contracts yet">
              Add your rent contract: when it starts, how long, the rent and how many cheques. Each cheque then leaves the account when you mark it cleared.
            </Empty>
          </div>
        )}
        {contracts.map((c) => (
          <ContractCard
            key={c.id} c={c} accountName={accountName} memberName={memberName}
            onEdit={() => setEditing(c)} onRenew={() => setRenewing(c)}
            onArchive={() => confirmAction({
              header: `Archive “${c.name}”?`, message: 'Its cheques no longer count in account balances.', acceptLabel: 'Archive',
              onAccept: () => run(() => api.post(`/contracts/${c.id}/archive`), `${c.name} archived`),
            })}
            onClear={(q) => setClearing({ c, q })}
            onUndo={(q) => run(() => api.put(`/contracts/${c.id}/cheques/${q.id}`, { cleared: false }), 'Cheque marked as not cleared')}
          />
        ))}

        <TableCard>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-sm font-semibold text-stone-800">Deposits</h2>
            <span className="text-xs text-stone-500">Held now <Money value={held.reduce((a, d) => a + d.amount, 0)} className="font-semibold text-stone-800" /> AED</span>
          </div>
          <DataTable
            value={deposits} dataKey="id" size="small"
            emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">No deposits yet, e.g. apartment, DEWA or gas deposit.</p>}
          >
            <Column header="Deposit" body={(d: Deposit) => (
              <div>
                <div className="font-medium">{d.name}</div>
                {(d.contractId || d.notes) && <div className="text-[11px] text-stone-500">{[contracts.find((c) => c.id === d.contractId)?.name, d.notes].filter(Boolean).join(' · ')}</div>}
              </div>
            )} />
            <Column header="Belongs to" body={(d: Deposit) => d.type === 'common' ? <Badge tone="violet">Common</Badge> : <span className="text-xs text-stone-600">{memberName(d.ownerId)}</span>} />
            <Column header="Paid on" body={(d: Deposit) => <span className="text-xs text-stone-600">{fullDate(d.paidDate)}</span>} />
            <Column header="Amount" align="right" body={(d: Deposit) => <Money value={d.amount} className={cx('font-medium', d.refundedDate && 'text-stone-400 line-through')} />} />
            <Column header="Status" body={(d: Deposit) => (d.refundedDate
              ? <span className="text-xs text-stone-500">Refunded {fullDate(d.refundedDate)}</span>
              : <span className="text-xs text-brand-700">Held</span>)} />
            <Column align="right" style={{ width: '7rem' }} body={(d: Deposit) => (
              <div className="whitespace-nowrap">
                <IconButton title="Edit" onClick={() => setDeposit(d)}><Pencil className="size-3.5" /></IconButton>
                {d.refundedDate
                  ? <IconButton title="Mark as still held" onClick={() => run(() => api.put(`/deposits/${d.id}`, { refundedDate: null }), `${d.name} marked as held`)}><RotateCcw className="size-3.5" /></IconButton>
                  : <IconButton title="Mark refunded today" onClick={() => run(() => api.put(`/deposits/${d.id}`, { refundedDate: todayStr() }), `${d.name} refunded`)}><Undo2 className="size-3.5" /></IconButton>}
                <IconButton title="Archive" danger onClick={() => run(() => api.put(`/deposits/${d.id}`, { archived: true }), `${d.name} archived`)}><Archive className="size-3.5" /></IconButton>
              </div>
            )} />
          </DataTable>
        </TableCard>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add contract' : 'Edit contract'}>
        {editing && <ContractForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      </Modal>
      <Modal open={!!renewing} onClose={() => setRenewing(null)} title={`Renew ${renewing?.name ?? ''}`}>
        {renewing && <RenewForm contract={renewing} onClose={() => setRenewing(null)} onSaved={() => { setRenewing(null); reload(); }} />}
      </Modal>
      <Modal open={!!deposit} onClose={() => setDeposit(null)} title={deposit === 'new' ? 'Add deposit' : 'Edit deposit'}>
        {deposit && <DepositForm initial={deposit === 'new' ? undefined : deposit} contracts={contracts} onClose={() => setDeposit(null)} onSaved={() => { setDeposit(null); reload(); }} />}
      </Modal>
      <ChequeModal contract={clearing?.c ?? null} cheque={clearing?.q ?? null} onClose={() => setClearing(null)} onSaved={() => { setClearing(null); reload(); }} />
    </Page>
  );
}
