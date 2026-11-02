import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ArrowRight, Bell, BellOff, ReceiptText, CheckCircle2, Clock, Pencil, Plus, RotateCcw, CalendarX2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Commitment } from '../lib/types';
import { addMonths, categoryLabel, money, monthLabel, thisMonth } from '../lib/format';
import {
  Button, Empty, cx, ErrorNote, Field, IconButton, Modal, Money, MonthInput, Page, PageHeader, TableCard, TableSkeleton, Tabs, TypeBadge, confirmAction, usePaging, useToast,
} from '../components/ui';
import { CommitmentForm, PayCommitmentModal, WhoPaid, payLabel, standing } from '../components/forms';
import { SPLIT_LABEL } from '../lib/split';
import { CategoryIcon } from '../components/CategoryIcon';

type Tab = 'active' | 'scheduled' | 'ended';

export default function Commitments() {
  const { month } = useMonth();
  const { memberName, workspace, isCouple, user } = useAuth();
  const toast = useToast();
  const list = useApi<Commitment[]>(`/commitments?month=${month}`);
  // Next month's commitments can be paid early; months after that haven't started.
  const early = month === addMonths(thisMonth(), 1);
  const future = month > thisMonth() && !early;
  const [tab, setTab] = useState<Tab>('active');
  const [who, setWho] = useState<string>('all'); // 'all' | 'common' | a member id (their personal commitments)
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);
  const [ending, setEnding] = useState<Commitment | null>(null);
  const [paying, setPaying] = useState<Commitment | null>(null);
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const paging = usePaging([tab, month, who]);

  const all = list.data ?? [];
  const forWho = (c: Commitment) => who === 'all' || (who === 'common' ? c.type === 'common' : c.type === 'personal' && c.ownerId === who);
  // Unpaid first; paid ones move to the end, each group by due day.
  const rows = useMemo(() => all.filter((c) => c.status === tab && forWho(c))
    .sort((a, b) => Number(!!a.payment?.paid) - Number(!!b.payment?.paid) || a.dueDay - b.dueDay), [all, tab, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const inMonth = (c: Commitment) => c.startMonth <= month && (!c.endMonth || c.endMonth >= month);
  const amountIn = (c: Commitment) => {
    const v = [...c.amountHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
    let a = v[0]?.amount ?? 0;
    for (const x of v) if (x.fromMonth <= month) a = x.amount;
    return a;
  };
  const plannedTotal = all.filter(inMonth).reduce((a, c) => a + amountIn(c), 0);
  const reloadAll = () => list.reload();

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

  const askUndo = (c: Commitment, shareId: string) => confirmAction({
    header: 'Undo this share?',
    message: <p>The money sent towards “{c.title}” is removed from the record (and from any account balances it moved).</p>,
    onAccept: () => run(() => api.del(`/commitments/${c.id}/shares/${shareId}`), 'Share removed'),
  });

  return (
    <Page fill>
      <PageHeader
        title="Commitments"
        subtitle={`Planned monthly payments — they repeat every month until their end month · ${monthLabel(month)} total ${money(plannedTotal)} AED`}
        actions={<Button variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>New commitment</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Tab> value={tab} onChange={setTab} items={(['active', 'scheduled', 'ended'] as Tab[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1), count: all.filter((c) => c.status === t && forWho(c)).length }))} />
        {isCouple && (
          <Tabs<string> value={who} onChange={setWho} items={[
            { value: 'all', label: 'All' },
            { value: 'common', label: 'Common' },
            ...(workspace?.members ?? []).map((m) => ({ value: m.userId, label: m.displayName })),
          ]} />
        )}
      </div>
      <ErrorNote message={list.error} />
      <TableCard>
        <DataTable
          value={rows}
          dataKey="id"
          {...paging}
          size="small"
          tableStyle={{ minWidth: '56rem' }}
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
            c.type !== 'common' ? <span className="text-xs text-stone-500">—</span> : (
              <div className="text-[11px] leading-4 text-stone-500" title={`Split: ${SPLIT_LABEL[c.split?.mode ?? 'equal']}`}>
                {(c.shares ?? []).map((x) => {
                  const done = inMonth(c) && !future && standing({ ...c, amount: amountIn(c) }, x.userId).ownDone;
                  const pending = inMonth(c) && !future && !done;
                  return (
                    <div key={x.userId} className={cx('flex items-center justify-end gap-1', pending && 'text-rose-600')}>
                      {done && <CheckCircle2 className="size-3.5 text-brand-700" aria-label="Paid" />}
                      {pending && <Clock className="size-3.5" aria-label="Pending" />}
                      {memberName(x.userId)} <span className={cx('num', pending ? 'text-rose-600' : 'text-stone-700')}>{money(x.amount)}</span>
                    </div>
                  );
                })}
                {c.split?.mode && c.split.mode !== 'equal' && <div className="text-violet-700">{SPLIT_LABEL[c.split.mode]}</div>}
              </div>
            )
          )} />}
          <Column header="Period" body={(c: Commitment) => (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-stone-600">
              {monthLabel(c.startMonth, 'short')} <ArrowRight className="size-3 text-stone-400" /> {c.endMonth ? monthLabel(c.endMonth, 'short') : 'every month'}
            </span>
          )} />
          <Column header={monthLabel(month, 'short')} body={(c: Commitment) => (
            !inMonth(c) ? <span className="text-xs text-stone-400">n/a</span>
              : c.payment?.paid ? (
                <div className="text-xs">
                  <span className="inline-flex items-center gap-1 text-brand-700"><CheckCircle2 className="size-3.5" /> Paid</span>
                  {c.payment.paidAmount !== amountIn(c) && <span className="num ml-1 text-stone-500">{money(c.payment.paidAmount)}</span>}
                </div>
              )
              : future ? <span className="text-xs text-stone-400">Not started</span>
              : (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setPaying({ ...c, amount: amountIn(c) })} title={early ? `Pay ${monthLabel(month)}’s bill today` : undefined}>
                    {payLabel(c, user!.id, isCouple, early)}
                  </Button>
                </div>
              )
          )} />
          <Column header="Who paid" body={(c: Commitment) => (inMonth(c) && c.payment ? <WhoPaid c={{ ...c, amount: amountIn(c) }} onUndo={(id) => askUndo(c, id)} /> : <span className="text-xs text-stone-400">—</span>)} />
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
