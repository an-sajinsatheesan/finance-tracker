import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ArrowRight, Bell, BellOff, ReceiptText, CheckCircle2, Pencil, Plus, RotateCcw, CalendarX2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Commitment, Expense } from '../lib/types';
import { categoryLabel, money, monthLabel, thisMonth } from '../lib/format';
import {
  Button, Empty, ErrorNote, Field, IconButton, Modal, Money, MonthInput, Page, PageHeader, TableCard, TableSkeleton, Tabs, TypeBadge, confirmAction, usePaging, useToast,
} from '../components/ui';
import { CommitmentForm, PayCommitmentModal } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';

type Tab = 'active' | 'scheduled' | 'ended';

export default function Commitments() {
  const { month } = useMonth();
  const { memberName, workspace, isCouple } = useAuth();
  const toast = useToast();
  const list = useApi<Commitment[]>('/commitments');
  const future = month > thisMonth();
  const expenses = useApi<Expense[]>(future ? null : `/expenses?month=${month}`);
  const [tab, setTab] = useState<Tab>('active');
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);
  const [ending, setEnding] = useState<Commitment | null>(null);
  const [paying, setPaying] = useState<Commitment | null>(null);
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const paging = usePaging([tab, month]);

  const all = list.data ?? [];
  const rows = all.filter((c) => c.status === tab);
  const paidIds = useMemo(() => new Set((future ? [] : expenses.data ?? []).map((e) => e.commitmentId).filter(Boolean)), [expenses.data, future]);
  const inMonth = (c: Commitment) => c.startMonth <= month && (!c.endMonth || c.endMonth >= month);
  const amountIn = (c: Commitment) => {
    const v = [...c.amountHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
    let a = v[0]?.amount ?? 0;
    for (const x of v) if (x.fromMonth <= month) a = x.amount;
    return a;
  };
  const n = workspace?.members.length ?? 2;
  const plannedTotal = all.filter(inMonth).reduce((a, c) => a + amountIn(c), 0);
  const reloadAll = () => { list.reload(); expenses.reload(); };

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    try { await fn(); toast.success(okText); reloadAll(); return true; } catch (e) { toast.error(errorText(e)); return false; } finally { setBusy(false); }
  }

  const askDelete = (c: Commitment) => confirmAction({
    header: `Delete “${c.title}”?`,
    message: <>
      <p>It is removed from every month’s plan, including past months. Payments you already recorded stay in Expenses.</p>
      <p className="mt-2 text-xs text-stone-500">Only want it to stop from now on (for example an EMI that finished)? Use <b>End</b> instead, so past months keep it.</p>
    </>,
    onAccept: () => run(() => api.del(`/commitments/${c.id}`), `${c.title} deleted`),
  });

  return (
    <Page fill>
      <PageHeader
        title="Commitments"
        subtitle={`Planned monthly payments — they repeat every month until their end month · ${monthLabel(month)} total ${money(plannedTotal)} AED`}
        actions={<Button variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>New commitment</Button>}
      />
      <div className="mb-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={(['active', 'scheduled', 'ended'] as Tab[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1), count: all.filter((c) => c.status === t).length }))} />
      </div>
      <ErrorNote message={list.error} />
      <TableCard>
        <DataTable
          value={rows}
          dataKey="id"
          {...paging}
          size="small"
          tableStyle={{ minWidth: '48rem' }}
          emptyMessage={list.loading && !list.data ? <TableSkeleton cols={isCouple ? 7 : 5} /> : <Empty icon={<ReceiptText className="size-8" />} title={`No ${tab} commitments`}>
            {tab === 'active' && 'Add rent, EMIs (car, mobile…), bills and subscriptions. They carry over to every month automatically.'}
          </Empty>}
        >
          <Column header="Commitment" body={(c: Commitment) => (
            <div className="flex items-center gap-3">
            <CategoryIcon category={c.category} custom={c.customCategory} />
            <div className="min-w-0">
              <div className="font-medium">{c.title}</div>
              <div className="flex items-center gap-1 text-[11px] text-stone-500">
                {categoryLabel(c.category, c.customCategory)} · due day {c.dueDay}{c.amountHistory.length > 1 && ' · amount changed'}
                {c.reminderDaysBefore === null
                  ? <BellOff className="ml-0.5 size-3 text-stone-300" aria-label="No reminder" />
                  : <span className="ml-0.5 inline-flex items-center gap-0.5" title="Payment reminder"><Bell className="size-3" />{c.reminderDaysBefore === 0 ? 'on the day' : `${c.reminderDaysBefore}d before`}</span>}
              </div>
            </div>
            </div>
          )} />
          {isCouple && <Column header="Type" body={(c: Commitment) => (
            <div className="flex items-center gap-1.5"><TypeBadge type={c.type} />{c.type === 'personal' && <span className="text-xs text-stone-500">{memberName(c.ownerId)}</span>}</div>
          )} />}
          <Column header="Monthly" align="right" body={(c: Commitment) => <Money value={inMonth(c) ? amountIn(c) : c.amount} className="font-medium" />} />
          {isCouple && <Column header="Per person" align="right" body={(c: Commitment) => (
            <span className="text-xs text-stone-500">{c.type === 'common' ? <Money value={(inMonth(c) ? amountIn(c) : c.amount) / n} /> : '—'}</span>
          )} />}
          <Column header="Period" body={(c: Commitment) => (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-stone-600">
              {monthLabel(c.startMonth, 'short')} <ArrowRight className="size-3 text-stone-400" /> {c.endMonth ? monthLabel(c.endMonth, 'short') : 'every month'}
            </span>
          )} />
          <Column header={monthLabel(month, 'short')} body={(c: Commitment) => (
            !inMonth(c) ? <span className="text-xs text-stone-400">n/a</span>
              : paidIds.has(c.id) ? <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Paid</span>
              : future ? <span className="text-xs text-stone-400">Not started</span>
              : <Button size="sm" onClick={() => setPaying({ ...c, amount: amountIn(c) })}>Mark paid</Button>
          )} />
          <Column align="right" style={{ width: '7rem' }} body={(c: Commitment) => (
            <div className="whitespace-nowrap">
              <IconButton title="Edit" onClick={() => setEditing(c)}><Pencil className="size-3.5" /></IconButton>
              {c.status === 'ended'
                ? <IconButton title="Reactivate" onClick={() => run(() => api.post(`/commitments/${c.id}/reactivate`), `${c.title} reactivated`)}><RotateCcw className="size-3.5" /></IconButton>
                : <IconButton title="End (stop from a month, keep history)" onClick={() => { setEnding(c); setEndMonth(c.startMonth > thisMonth() ? c.startMonth : thisMonth()); }}><CalendarX2 className="size-3.5" /></IconButton>}
              <IconButton title="Delete" danger onClick={() => askDelete(c)}><Trash2 className="size-3.5" /></IconButton>
            </div>
          )} />
        </DataTable>
      </TableCard>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New commitment' : 'Edit commitment'}>
        {editing && <CommitmentForm initial={editing === 'new' ? undefined : editing} defaultMonth={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <PayCommitmentModal target={paying} month={month} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reloadAll(); }} />
      <Modal
        open={!!ending}
        onClose={() => setEnding(null)}
        title={`End “${ending?.title ?? ''}”`}
        footer={<>
          <Button onClick={() => setEnding(null)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={async () => { if (ending && await run(() => api.post(`/commitments/${ending.id}/end`, { endMonth }), `${ending.title} ends after ${monthLabel(endMonth)}`)) setEnding(null); }}>End commitment</Button>
        </>}
      >
        <Field label="Last month it applies" hint="It stops automatically after this month. Earlier months keep their history.">
          <MonthInput value={endMonth} min={ending?.startMonth} onChange={setEndMonth} />
        </Field>
      </Modal>
    </Page>
  );
}
