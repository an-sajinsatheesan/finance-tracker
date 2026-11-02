import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Archive, ArchiveRestore, ArrowLeftRight, CheckCircle2, Clock, CreditCard, Lock, Pencil, Plus, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account, Commitment, Expense } from '../lib/types';
import { categoryLabel, dateLabel, monthLabel, thisMonth } from '../lib/format';
import {
  Badge, Button, Check, Empty, ErrorNote, IconButton, Modal, Money, Page, PageHeader, TableCard, usePaging, TableSkeleton, Tabs, TypeBadge, confirmAction, useToast,
} from '../components/ui';
import { ExpenseForm, PayCommitmentModal, standing } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';


export default function Expenses({ openNew = false }: { openNew?: boolean }) {
  const { month } = useMonth();
  const { user, workspace, memberName, isCouple } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const future = month > thisMonth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useApi<Expense[]>(`/expenses?month=${month}&includeArchived=${showArchived}`);
  const accounts = useApi<Account[]>('/accounts');
  const accountName = (id?: string | null) => (id ? accounts.data?.find((a) => a.id === id)?.name : undefined);
  /** Paid from the couple's common account: each partner paid their own share of it. */
  const fromCommon = (e: Expense) => e.type === 'common' && !!e.accountId && accounts.data?.find((a) => a.id === e.accountId)?.type === 'common';
  const fromAccount = (e: Expense) => accountName(e.accountId) && (
    <div className="flex items-center gap-1 text-[11px] text-stone-500"><CreditCard className="size-3" />{accountName(e.accountId)}</div>
  );
  const commitments = useApi<Commitment[]>(`/commitments?month=${month}`);
  /** The common commitment this expense pays (each partner may pay their part as a separate expense). */
  const billOf = (e: Expense) => (e.type === 'common' && e.commitmentId ? commitments.data?.find((c) => c.id === e.commitmentId && c.shares) : undefined);
  /** Each person's part and what is still open: from the whole bill when linked, else from this expense. */
  const parts = (e: Expense) => {
    const bill = billOf(e);
    if (bill) {
      return bill.shares!.map((s) => {
        const st = standing(bill, s.userId);
        return { userId: s.userId, amount: s.amount, done: st.ownDone, open: Math.max(0, Math.round((st.part - st.paid - st.sent) * 100) / 100) };
      });
    }
    const settled = (userId: string) => e.type !== 'common' || userId === e.paidBy || fromCommon(e);
    return e.shares.map((s) => ({ userId: s.userId, amount: s.amount, done: settled(s.userId), open: settled(s.userId) ? 0 : s.amount }));
  };
  // 'all' | 'common' | a member id (everything they have a part in). Opens on your own.
  const [filter, setFilter] = useState<string>(isCouple && user ? user.id : 'all');
  const [editing, setEditing] = useState<Expense | 'new' | null>(openNew && !future ? 'new' : null);
  const [paying, setPaying] = useState<Commitment | null>(null);
  const paging = usePaging([month, filter, showArchived]);

  const forFilter = (e: Expense) => filter === 'all' || (filter === 'common' ? e.type === 'common' : e.shares.some((s) => s.userId === filter));
  const rows = useMemo(() => (data ?? []).filter(forFilter), [data, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = rows.filter((e) => e.status === 'active');
  /** Whose cost the "Mine" column shows: the chosen person, or you otherwise. */
  const who = filter === 'all' || filter === 'common' ? user!.id : filter;
  /** The linked common bill, when this person still has their part of it to pay or send. */
  const owingBill = (e: Expense, userId: string) => {
    const bill = billOf(e);
    return bill && parts(e).some((p) => p.userId === userId && !p.done) ? bill : null;
  };
  const unpaidShares = (e: Expense) => (e.type === 'common' ? parts(e).filter((p) => !p.done) : []);
  const whoLabel = who === user!.id ? 'Mine' : `${memberName(who)}’s cost`;
  const costOf = (e: Expense) => e.shares.filter((s) => s.userId === who).reduce((x, s) => x + s.amount, 0);
  const total = active.reduce((a, e) => a + e.amount, 0);
  const whoTotal = active.reduce((a, e) => a + costOf(e), 0);

  function close() {
    setEditing(null);
    if (openNew) navigate('/expenses', { replace: true });
  }

  async function setArchived(e: Expense, archived: boolean) {
    try {
      await api.post(`/expenses/${e._id}/${archived ? 'archive' : 'unarchive'}`);
      toast.success(`${e.description} ${archived ? 'archived' : 'restored'}`);
      reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  }
  const askArchive = (e: Expense) => confirmAction({
    header: 'Archive expense?',
    message: <>“{e.description}” (<Money value={e.amount} /> AED) will be removed from totals. You can restore it with “Show archived”.</>,
    acceptLabel: 'Archive',
    onAccept: () => setArchived(e, true),
  });

  return (
    <Page fill>
      <PageHeader
        title="Expenses"
        subtitle={`${monthLabel(month)} · actual spending`}
        actions={<Button variant="primary" disabled={future} onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />} title={future ? 'This month has not started yet' : undefined}>Add expense</Button>}
      />
      {future && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Lock className="size-3.5" /> {monthLabel(month)} hasn’t started yet. Expenses can be added from the 1st of the month.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isCouple && (
          <Tabs<string> value={filter} onChange={setFilter} items={[
            { value: 'all', label: 'All' },
            { value: 'common', label: 'Common' },
            ...(workspace?.members ?? []).map((m) => ({ value: m.userId, label: m.displayName })),
          ]} />
        )}
        <span className="ml-auto"><Check checked={showArchived} onChange={setShowArchived} label="Show archived" /></span>
      </div>
      <ErrorNote message={error} />
      <TableCard>
        <DataTable
          value={rows}
          dataKey="_id"
          {...paging}
          size="small"
          tableStyle={{ minWidth: '44rem' }}
          rowClassName={(e: Expense) => (e.status === 'archived' ? 'row-muted' : '')}
          emptyMessage={loading && !data ? <TableSkeleton cols={isCouple ? 7 : 4} /> : <Empty icon={<ArrowLeftRight className="size-8" />} title="No expenses recorded">Add one, or mark a commitment as paid.</Empty>}
          footer={rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
              <span className="font-medium text-stone-600">{active.length} active expense{active.length === 1 ? '' : 's'}</span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {isCouple && (
                  <span className="text-stone-600" title="Your own expenses in full, plus your share of common ones">
                    {whoLabel} <Money value={whoTotal} className="font-semibold text-brand-700" /> AED
                    <span className="text-stone-400"> · paid <Money value={active.filter((e) => e.paidBy === who).reduce((a, e) => a + e.amount, 0)} /></span>
                  </span>
                )}
                <span className="font-semibold">Total <Money value={total} /> AED</span>
              </span>
            </div>
          )}
        >
          <Column header="Date" body={(e: Expense) => <span className="num text-stone-600">{dateLabel(e.date)}</span>} style={{ width: '5.5rem' }} />
          <Column header="Description" body={(e: Expense) => (
            <div className="flex items-center gap-3">
              <CategoryIcon category={e.category} custom={e.customCategory} />
              <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium">
                {e.description}
                {e.commitmentId && <Link2 className="size-3 text-stone-400" aria-label="Linked to a commitment" />}
                {e.status === 'archived' && <Badge>Archived</Badge>}
              </div>
              <div className="text-[11px] text-stone-500">{categoryLabel(e.category, e.customCategory)}{e.notes && ` · ${e.notes}`}</div>
              </div>
            </div>
          )} />
          {isCouple && <Column header="Type" body={(e: Expense) => (
            <div className="flex items-center gap-1.5"><TypeBadge type={e.type} />{e.type === 'personal' && e.ownerId !== e.paidBy && <span className="text-[11px] text-stone-500">for {memberName(e.ownerId)}</span>}</div>
          )} />}
          {!isCouple && <Column header="Paid from" body={(e: Expense) => fromAccount(e) || <span className="text-xs text-stone-400">—</span>} />}
          <Column header="Amount" align="right" body={(e: Expense) => <Money value={e.amount} className="font-medium" />} />
          {isCouple && <Column header="Split" align="right" body={(e: Expense) => (
            <span className="text-xs text-stone-500">
              {e.type === 'common' ? parts(e).map((s) => (
                s.done
                  ? <div key={s.userId} className="flex items-center justify-end gap-1"><CheckCircle2 className="size-3.5 text-brand-700" aria-label="Paid" />{memberName(s.userId)} <Money value={s.amount} /></div>
                  : <div key={s.userId} className="flex items-center justify-end gap-1 text-rose-600" title={`${memberName(s.userId)} hasn’t paid their part yet`}><Clock className="size-3.5" aria-label="Pending" />{memberName(s.userId)} <Money value={s.amount} /></div>
              )) : '—'}
            </span>
          )} />}
          {isCouple && <Column header={whoLabel} align="right" body={(e: Expense) => (
            costOf(e) > 0 ? <Money value={costOf(e)} className="font-semibold text-brand-700" /> : <span className="text-xs text-stone-300">—</span>
          )} />}
          {isCouple && <Column header={monthLabel(month, 'short')} body={(e: Expense) => {
            if (e.status !== 'active') return <span className="text-xs text-stone-400">—</span>;
            if (unpaidShares(e).length === 0) return <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Paid</span>;
            // Your part of a common bill: pay it, or send it to your partner if they paid the whole bill.
            const bill = owingBill(e, user!.id);
            if (bill) return <Button size="sm" onClick={() => setPaying(bill)}>{bill.payment?.paid ? 'Send my share' : 'Pay my share'}</Button>;
            return <span className="inline-flex items-center gap-1 text-xs text-rose-600"><Clock className="size-3.5" /> Pending</span>;
          }} />}
          {isCouple && <Column header="Who paid" body={(e: Expense) => {
            const sent = e.commitmentId ? commitments.data?.find((c) => c.id === e.commitmentId)?.payment?.sent ?? [] : [];
            return (
              <div className="flex flex-col gap-0.5 text-[11px] leading-4">
                {fromCommon(e)
                  ? <span className="text-brand-700">✓ Paid from the common account: {e.shares.map((s) => <span key={s.userId}>{memberName(s.userId)} <Money value={s.amount} /> </span>)}</span>
                  : (
                    <span className="text-brand-700">
                      ✓ {memberName(e.paidBy)} {e.type === 'personal' && e.ownerId && e.ownerId !== e.paidBy ? 'supported' : 'paid'} <Money value={e.amount} />
                    </span>
                  )}
                {fromAccount(e)}
                {sent.map((x) => (
                  <span key={x.id} className="text-sky-700">↗ {memberName(x.fromUserId)} sent <Money value={x.amount} /> to {x.toUserId ? memberName(x.toUserId) : 'common account'}</span>
                ))}
                {unpaidShares(e).map((s) => (
                  <span key={s.userId} className="inline-flex items-center gap-1 text-rose-600">
                    <Clock className="size-3" />
                    {billOf(e) && !billOf(e)!.payment?.paid
                      ? <>{memberName(s.userId)} to pay <Money value={s.open} /></>
                      : <>{memberName(s.userId)} owes {memberName(e.paidBy)} <Money value={s.open} /></>}
                  </span>
                ))}
              </div>
            );
          }} />}
          <Column align="right" style={{ width: '5.5rem' }} body={(e: Expense) => (
            <div className="whitespace-nowrap">
              {e.status === 'active' && <IconButton title="Edit" onClick={() => setEditing(e)}><Pencil className="size-3.5" /></IconButton>}
              {e.status === 'archived'
                ? <IconButton title="Restore" onClick={() => setArchived(e, false)}><ArchiveRestore className="size-3.5" /></IconButton>
                : <IconButton title="Archive" danger onClick={() => askArchive(e)}><Archive className="size-3.5" /></IconButton>}
            </div>
          )} />
        </DataTable>
      </TableCard>
      <Modal open={!!editing} onClose={close} title={editing === 'new' ? 'Add expense' : 'Edit expense'}>
        {editing && <ExpenseForm initial={editing === 'new' ? undefined : editing} month={month} onCancel={close} onSaved={() => { close(); reload(); }} />}
      </Modal>
      <PayCommitmentModal target={paying} month={month} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); commitments.reload(); }} />
    </Page>
  );
}
