import { useEffect, useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Archive, ArchiveRestore, CheckCircle2, CreditCard, Pencil, Plus, Repeat, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account, Income, IncomeSource, Member } from '../lib/types';
import { dateLabel, monthLabel, todayStr } from '../lib/format';
import {
  Badge, Button, Check, DateInput, Empty, ErrorNote, Field, IconButton, Modal, Money, NumberInput, Page, PageHeader, Select, Skeleton, TableCard, TableSkeleton, TextInput, usePaging,
  confirmAction, useToast,
} from '../components/ui';
import { AccountSelect, LookupSelect, MemberSelect, PAY_TIMING_OPTIONS } from '../components/forms';

const STATUS_TONE = { expected: 'amber', partial: 'sky', received: 'brand', archived: 'stone' } as const;

function IncomeForm({ initial, month, onSaved, onCancel }: { initial?: Income; month: string; onSaved: () => void; onCancel: () => void }) {
  const { user, isCouple } = useAuth();
  const toast = useToast();
  const accounts = useApi<Account[]>('/accounts');
  const [f, setF] = useState({
    userId: initial?.userId ?? user!.id,
    accountId: initial?.accountId ?? '',
    source: initial?.source ?? 'Salary',
    expectedAmount: initial ? initial.expectedAmount : (null as number | null),
    receivedAmount: initial ? initial.receivedAmount : (0 as number | null),
    expectedDate: initial?.expectedDate ?? '',
    receivedDate: initial?.receivedDate ?? '',
    notes: initial?.notes ?? '',
  });
  // Less than expected but nothing more is coming (e.g. a salary cut): received, not partial.
  const [inFull, setInFull] = useState(!!initial && initial.status === 'received' && initial.receivedAmount < initial.expectedAmount);
  const short = (f.receivedAmount ?? 0) > 0 && f.expectedAmount !== null && (f.receivedAmount ?? 0) < f.expectedAmount;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.expectedAmount === null) { setError('Enter the expected amount'); return; }
    setBusy(true);
    setError(null);
    const body = {
      ...f, expectedAmount: f.expectedAmount, receivedAmount: f.receivedAmount ?? 0, accountId: f.accountId || null,
      status: short && inFull ? 'received' : undefined,
    };
    try {
      if (initial) await api.put(`/income/${initial._id}`, body);
      else await api.post('/income', { ...body, month });
      toast.success(`Income ${initial ? 'updated' : 'added'}`);
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
        {isCouple && <Field label="Person"><MemberSelect value={f.userId} onChange={(v) => set('userId', v)} /></Field>}
        <Field label="Source" className={isCouple ? '' : 'col-span-2'}><LookupSelect type="incomeSource" value={f.source} onChange={(v) => set('source', v)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expected amount"><NumberInput value={f.expectedAmount} onChange={(v) => set('expectedAmount', v)} min={0} required /></Field>
        <Field label="Expected date"><DateInput value={f.expectedDate} onChange={(v) => set('expectedDate', v)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received amount"><NumberInput value={f.receivedAmount} onChange={(v) => set('receivedAmount', v)} min={0} /></Field>
        <Field label="Received date"><DateInput value={f.receivedDate} onChange={(v) => set('receivedDate', v)} max={todayStr()} /></Field>
      </div>
      {short && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600">
          <input type="checkbox" className="mt-0.5 accent-brand-600" checked={inFull} onChange={(e) => setInFull(e.target.checked)} />
          <span><b className="text-stone-800">Received in full</b> — this was the whole payment (e.g. salary cut). Shows as Received instead of Partial, and nothing stays pending.</span>
        </label>
      )}
      <Field label="Received into" hint="Optional. The bank account the money was paid into; its balance on the Balances page goes up by the received amount.">
        <AccountSelect accounts={accounts.data} value={f.accountId} onChange={(v) => set('accountId', v)} ownerId={f.userId} purpose="in" />
      </Field>
      <Field label="Notes"><TextInput value={f.notes} onChange={(v) => set('notes', v)} maxLength={500} /></Field>
      <p className="text-[11px] text-stone-500">Status is set automatically: expected, then partial, then received (or tick “Received in full” for a smaller final amount).</p>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add income'}</Button>
      </div>
    </form>
  );
}

/**
 * Recurring monthly income per person (salary etc.). Each new month's expected
 * income is created from this list; past months are never rewritten.
 */
function RecurringIncome({ month, onClose, onSaved }: { month: string; onClose: () => void; onSaved: () => void }) {
  const { workspace, refreshWorkspace } = useAuth();
  const { label } = useLookups();
  const toast = useToast();
  const accounts = useApi<Account[]>('/accounts');
  const [members, setMembers] = useState<Member[]>(workspace?.members ?? []);
  const [applyNow, setApplyNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (workspace) setMembers(workspace.members); }, [workspace]);
  const upd = (i: number, j: number, patch: Partial<IncomeSource>) =>
    setMembers((ms) => ms.map((m, k) => (k !== i ? m : { ...m, incomeSources: m.incomeSources.map((s, l) => (l === j ? { ...s, ...patch } : s)) })));
  const setSources = (i: number, fn: (s: Member['incomeSources']) => Member['incomeSources']) =>
    setMembers((ms) => ms.map((m, k) => (k !== i ? m : { ...m, incomeSources: fn(m.incomeSources) })));
  const askRemove = (i: number, j: number, s: IncomeSource) => confirmAction({
    header: 'Remove income source?',
    message: <>“{label('incomeSource', s.source)}” stops being created for new months once you save. Months already created keep their rows.</>,
    acceptLabel: 'Remove',
    onAccept: () => setSources(i, (xs) => xs.filter((_, l) => l !== j)),
  });

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.put('/workspace', {
        members: members.map((m) => ({
          userId: m.userId, displayName: m.displayName, relationship: m.relationship,
          incomeSources: m.incomeSources.map((s) => ({ ...s, amount: Number(s.amount || 0), expectedDay: Number(s.expectedDay || 1), accountId: s.accountId || null })),
        })),
      });
      if (applyNow) await api.post('/income/sync', { month });
      await refreshWorkspace();
      toast.success('Recurring income saved');
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">Used to create each month’s expected income automatically. Changing it never rewrites past months. “End of previous month” means e.g. salary credited on 28 Oct is November’s income.</p>
      {members.map((m, i) => (
        <div key={m.userId} className="rounded-md border border-stone-200">
          <div className="flex justify-between border-b border-stone-200 px-3 py-2 text-sm font-medium">
            <span>{m.displayName}</span>
            <Money value={m.incomeSources.filter((s) => s.active).reduce((a, s) => a + Number(s.amount || 0), 0)} />
          </div>
          <DataTable value={m.incomeSources.map((s, j) => ({ ...s, _j: j }))} size="small" emptyMessage={<p className="py-3 text-center text-xs text-stone-500">No recurring income yet.</p>}>
            <Column header="Source" body={(s: IncomeSource & { _j: number }) => <LookupSelect type="incomeSource" value={s.source} onChange={(v) => upd(i, s._j, { source: v })} />} />
            <Column header="AED / month" style={{ width: '10rem' }} body={(s: IncomeSource & { _j: number }) => <NumberInput value={Number(s.amount) || null} onChange={(v) => upd(i, s._j, { amount: v ?? 0 })} min={0} ariaLabel="Amount" />} />
            <Column header="Pay day" style={{ width: '6rem' }} body={(s: IncomeSource & { _j: number }) => <NumberInput value={Number(s.expectedDay) || null} onChange={(v) => upd(i, s._j, { expectedDay: v ?? 1 })} min={1} max={31} decimals={0} ariaLabel="Pay day" />} />
            <Column header="Paid into" style={{ width: '14rem' }} body={(s: IncomeSource & { _j: number }) => <AccountSelect accounts={accounts.data} value={s.accountId ?? ''} onChange={(v) => upd(i, s._j, { accountId: v || null })} ownerId={m.userId} purpose="in" ariaLabel="Account it is paid into" />} />
            <Column header="Paid" style={{ width: '12rem' }} body={(s: IncomeSource & { _j: number }) => <Select value={s.paidPreviousMonth ? 'previous' : 'same'} options={PAY_TIMING_OPTIONS} onChange={(v) => upd(i, s._j, { paidPreviousMonth: v === 'previous' })} ariaLabel="When it is paid" />} />
            <Column style={{ width: '3rem' }} body={(s: IncomeSource & { _j: number }) => <IconButton title="Remove" danger onClick={() => askRemove(i, s._j, s)}><Trash2 className="size-3.5" /></IconButton>} />
          </DataTable>
          <div className="px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => setSources(i, (xs) => [...xs, { source: 'Salary', amount: 0, expectedDay: 28, paidPreviousMonth: false, active: true }])} icon={<Plus className="size-3" />}>Add source</Button>
          </div>
        </div>
      ))}
      <Check checked={applyNow} onChange={setApplyNow} label={<>Also update {monthLabel(month)} (rows not received yet)</>} />
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>Save recurring income</Button>
      </div>
    </div>
  );
}

export default function IncomePage() {
  const { month } = useMonth();
  const { workspace, memberName, isCouple } = useAuth();
  const { label } = useLookups();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Income[]>(`/income?month=${month}`);
  const accounts = useApi<Account[]>('/accounts');
  const accountName = (id?: string | null) => (id ? accounts.data?.find((a) => a.id === id)?.name : undefined);
  const [recurring, setRecurring] = useState(false);
  const [editing, setEditing] = useState<Income | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const paging = usePaging([month, showArchived]);

  const rows = (data ?? []).filter((i) => showArchived || i.status !== 'archived');
  const live = rows.filter((i) => i.status !== 'archived');

  async function act(path: string, okText: string, body?: unknown) {
    try { await (body ? api.put(path, body) : api.post(path)); toast.success(okText); reload(); } catch (e) { toast.error(errorText(e)); }
  }
  const markReceived = (i: Income) => {
    const today = todayStr();
    act(`/income/${i._id}`, `${label('incomeSource', i.source)} marked received`, {
      receivedAmount: i.expectedAmount,
      // Never a future date: next month's salary marked early was paid today.
      receivedDate: today.startsWith(month) || today < `${month}-01` ? today : i.expectedDate || `${month}-01`,
    });
  };
  const askArchive = (i: Income) => confirmAction({
    header: 'Archive income?',
    message: <>{memberName(i.userId)}’s {label('incomeSource', i.source)} (<Money value={i.expectedAmount} /> AED) will be left out of totals. You can restore it with “Show archived”.</>,
    acceptLabel: 'Archive',
    onAccept: () => act(`/income/${i._id}/archive`, 'Income archived'),
  });

  return (
    <Page fill>
      <PageHeader
        title="Income"
        subtitle={`${monthLabel(month)} · expected vs received`}
        actions={<>
          <Button onClick={() => setRecurring(true)} icon={<Repeat className="size-3.5" />}>Recurring income</Button>
          <Button variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>Add income</Button>
        </>}
      />
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {workspace?.members.map((m) => {
          const mine = live.filter((i) => i.userId === m.userId);
          const exp = mine.reduce((a, i) => a + i.expectedAmount, 0);
          const rec = mine.reduce((a, i) => a + i.receivedAmount, 0);
          return (
            <div key={m.userId} className="card px-4 py-3">
              <div className="text-xs font-medium text-stone-500">{m.displayName}</div>
              <div className="mt-1 text-lg font-semibold">{loading && !data ? <Skeleton className="my-1 h-5 w-28" /> : <Money value={rec} />}</div>
              <div className="text-[11px] text-stone-500">received of <Money value={exp} /></div>
            </div>
          );
        })}
      </div>
      <div className="mb-2 flex justify-end"><Check checked={showArchived} onChange={setShowArchived} label="Show archived" /></div>
      <ErrorNote message={error} />
      <TableCard>
        <DataTable
          value={rows}
          dataKey="_id"
          {...paging}
          size="small"
          tableStyle={{ minWidth: '48rem' }}
          rowClassName={(i: Income) => (i.status === 'archived' ? 'row-muted' : '')}
          emptyMessage={loading && !data ? <TableSkeleton cols={isCouple ? 7 : 6} /> : <Empty icon={<Wallet className="size-8" />} title="No income for this month">
            {workspace && month < workspace.startMonth ? 'This month is before the workspace start month.' : 'Expected income is created automatically from your recurring income (current and next month).'}
          </Empty>}
          footer={live.length > 0 && (
            <div className="flex justify-end gap-6 text-xs">
              <span>Expected <Money value={live.reduce((a, i) => a + i.expectedAmount, 0)} className="font-semibold" /></span>
              <span>Received <Money value={live.reduce((a, i) => a + i.receivedAmount, 0)} className="font-semibold" /></span>
            </div>
          )}
        >
          {isCouple && <Column header="Person" body={(i: Income) => <span className="font-medium">{memberName(i.userId)}</span>} />}
          <Column header="Source" body={(i: Income) => (
            <div>
              {label('incomeSource', i.source)}
              {accountName(i.accountId) && <div className="flex items-center gap-1 text-[11px] text-stone-500"><CreditCard className="size-3" />{accountName(i.accountId)}</div>}
              {i.notes && <div className="text-[11px] text-stone-500">{i.notes}</div>}
            </div>
          )} />
          <Column header="Expected" align="right" body={(i: Income) => <Money value={i.expectedAmount} className="text-stone-600" />} />
          <Column header="Received" align="right" body={(i: Income) => <Money value={i.receivedAmount} className="font-medium" />} />
          <Column header="Expected date" body={(i: Income) => (
            <span className="num text-stone-600">
              {dateLabel(i.expectedDate)}
              {i.expectedDate && i.expectedDate.slice(0, 7) < i.month && <span className="ml-1 text-[10px] text-sky-700" title="Paid at the end of the previous month for this month's budget">prev. month</span>}
            </span>
          )} />
          <Column header="Received date" body={(i: Income) => <span className="num text-stone-600">{dateLabel(i.receivedDate)}</span>} />
          <Column header="Status" body={(i: Income) => <Badge tone={STATUS_TONE[i.status]}>{label('incomeStatus', i.status)}</Badge>} />
          <Column align="right" body={(i: Income) => (
            <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
              {i.status !== 'received' && i.status !== 'archived' && (
                <Button size="sm" onClick={() => markReceived(i)} icon={<CheckCircle2 className="size-3.5" />}>Received</Button>
              )}
              {i.status !== 'archived' && <IconButton title="Edit" onClick={() => setEditing(i)}><Pencil className="size-3.5" /></IconButton>}
              {i.status === 'archived'
                ? <IconButton title="Restore" onClick={() => act(`/income/${i._id}/unarchive`, 'Income restored')}><ArchiveRestore className="size-3.5" /></IconButton>
                : <IconButton title="Archive" danger onClick={() => askArchive(i)}><Archive className="size-3.5" /></IconButton>}
            </div>
          )} />
        </DataTable>
      </TableCard>
      <Modal open={recurring} onClose={() => setRecurring(false)} title="Recurring monthly income" size="xl">
        <RecurringIncome month={month} onClose={() => setRecurring(false)} onSaved={() => { setRecurring(false); reload(); }} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add income' : 'Edit income'}>
        {editing && <IncomeForm initial={editing === 'new' ? undefined : editing} month={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      </Modal>
    </Page>
  );
}
