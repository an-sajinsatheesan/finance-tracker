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
  Badge, Button, Check, Empty, ErrorNote, IconButton, Modal, Money, Page, PageHeader, Select, TableCard, usePaging, TableSkeleton, Tabs, TypeBadge, confirmAction, useToast,
} from '../components/ui';
import { ExpenseForm } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';

type Filter = 'all' | 'personal' | 'common';

export default function Expenses({ openNew = false }: { openNew?: boolean }) {
  const { month } = useMonth();
  const { workspace, memberName, isCouple } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const future = month > thisMonth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useApi<Expense[]>(`/expenses?month=${month}&includeArchived=${showArchived}`);
  const accounts = useApi<Account[]>('/accounts');
  const accountName = (id?: string | null) => (id ? accounts.data?.find((a) => a.id === id)?.name : undefined);
  const fromAccount = (e: Expense) => accountName(e.accountId) && (
    <div className="flex items-center gap-1 text-[11px] text-stone-500"><CreditCard className="size-3" />{accountName(e.accountId)}</div>
  );
  const commitments = useApi<Commitment[]>(`/commitments?month=${month}`);
  /** A person's part is paid when they paid the expense, or sent their share of the linked bill. */
  const sharePaid = (e: Expense, s: Expense['shares'][number]) => {
    if (s.userId === e.paidBy) return true;
    if (!e.commitmentId) return false;
    const sent = commitments.data?.find((c) => c.id === e.commitmentId)?.payment?.sent ?? [];
    return sent.filter((x) => x.fromUserId === s.userId).reduce((a, x) => a + x.amount, 0) >= s.amount - 0.005;
  };
  const [filter, setFilter] = useState<Filter>('all');
  const [person, setPerson] = useState<string>('all');
  const [editing, setEditing] = useState<Expense | 'new' | null>(openNew && !future ? 'new' : null);
  const paging = usePaging([month, filter, person, showArchived]);

  const rows = useMemo(
    () => (data ?? []).filter((e) => (filter === 'all' || e.type === filter) && (person === 'all' || e.shares.some((s) => s.userId === person))),
    [data, filter, person],
  );
  const active = rows.filter((e) => e.status === 'active');
  const costOf = (e: Expense) => (person === 'all' ? e.amount : e.shares.filter((s) => s.userId === person).reduce((x, s) => x + s.amount, 0));
  const total = active.reduce((a, e) => a + costOf(e), 0);

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
          <>
            <Tabs<Filter> value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All' }, { value: 'personal', label: 'Personal' }, { value: 'common', label: 'Common' }]} />
            <div className="w-48">
              <Select
                value={person}
                onChange={(v) => setPerson(v || 'all')}
                ariaLabel="Filter by person"
                options={[{ label: 'Everyone', value: 'all' }, ...(workspace?.members ?? []).map((m) => ({ label: `${m.displayName}'s costs`, value: m.userId }))]}
              />
            </div>
          </>
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
          emptyMessage={loading && !data ? <TableSkeleton cols={isCouple ? 6 : 4} /> : <Empty icon={<ArrowLeftRight className="size-8" />} title="No expenses recorded">Add one, or mark a commitment as paid.</Empty>}
          footer={rows.length > 0 && (
            <div className="flex justify-between text-xs">
              <span className="font-medium text-stone-600">{active.length} active expense{active.length === 1 ? '' : 's'}</span>
              <span className="font-semibold">Total <Money value={total} /> AED</span>
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
          {isCouple
            ? <Column header="Paid by" body={(e: Expense) => <div><span className="text-stone-600">{memberName(e.paidBy)}</span>{fromAccount(e)}</div>} />
            : <Column header="Paid from" body={(e: Expense) => fromAccount(e) || <span className="text-xs text-stone-400">—</span>} />}
          <Column header="Amount" align="right" body={(e: Expense) => <Money value={e.amount} className="font-medium" />} />
          {isCouple && <Column header={person === 'all' ? 'Split' : 'Their cost'} align="right" body={(e: Expense) => (
            <span className="text-xs text-stone-500">
              {person === 'all'
                ? e.type === 'common' ? e.shares.map((s) => (
                  sharePaid(e, s)
                    ? <div key={s.userId} className="flex items-center justify-end gap-1"><CheckCircle2 className="size-3.5 text-brand-700" aria-label="Paid" />{memberName(s.userId)} <Money value={s.amount} /></div>
                    : <div key={s.userId} className="flex items-center justify-end gap-1 text-rose-600" title={`${memberName(s.userId)} still owes ${memberName(e.paidBy)}`}><Clock className="size-3.5" aria-label="Pending" />{memberName(s.userId)} <Money value={s.amount} /></div>
                )) : '—'
                : <Money value={costOf(e)} />}
            </span>
          )} />}
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
    </Page>
  );
}
