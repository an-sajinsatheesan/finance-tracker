import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, Plus, Receipt, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Expense } from '../lib/types';
import { categoryLabel, dateLabel, monthLabel } from '../lib/format';
import { Badge, Button, Empty, ErrorNote, Modal, Money, PageHeader, Spinner, Tabs, TypeBadge, cx } from '../components/ui';
import { ExpenseForm } from '../components/forms';

type Filter = 'all' | 'personal' | 'common';

export default function Expenses({ openNew = false }: { openNew?: boolean }) {
  const { month } = useMonth();
  const { workspace, memberName } = useAuth();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useApi<Expense[]>(`/expenses?month=${month}&includeArchived=${showArchived}`);
  const [filter, setFilter] = useState<Filter>('all');
  const [person, setPerson] = useState<string>('all');
  const [editing, setEditing] = useState<Expense | 'new' | null>(openNew ? 'new' : null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((e) => (filter === 'all' || e.type === filter) && (person === 'all' || e.shares.some((s) => s.userId === person))),
    [data, filter, person],
  );
  const active = rows.filter((e) => e.status === 'active');
  const total = active.reduce((a, e) => a + (person === 'all' ? e.amount : e.shares.filter((s) => s.userId === person).reduce((x, s) => x + s.amount, 0)), 0);

  function close() {
    setEditing(null);
    if (openNew) navigate('/expenses', { replace: true });
  }

  async function toggleArchive(e: Expense) {
    setActionError(null);
    try {
      await api.post(`/expenses/${e._id}/${e.status === 'archived' ? 'unarchive' : 'archive'}`);
      reload();
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={`${monthLabel(month)} · actual spending`}
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add expense</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Filter> value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All' }, { value: 'personal', label: 'Personal' }, { value: 'common', label: 'Common' }]} />
        <select className="input h-8 w-auto py-0" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="all">Everyone</option>
          {workspace?.members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}'s costs</option>)}
        </select>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-stone-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      <ErrorNote message={error || actionError} />
      <div className="card overflow-hidden">
        {loading && !data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<Receipt className="size-8" />} title="No expenses recorded">Add one, or mark a commitment as paid on the dashboard.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-stone-200 bg-stone-50/60">
                <tr>
                  <th className="th w-20">Date</th><th className="th">Description</th><th className="th">Type</th><th className="th">Paid by</th>
                  <th className="th text-right">Amount</th><th className="th text-right">{person === 'all' ? 'Split' : 'Their cost'}</th><th className="th w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((e) => (
                  <tr key={e._id} className={cx(e.status === 'archived' && 'bg-stone-50 text-stone-400')}>
                    <td className="td num text-stone-600">{dateLabel(e.date)}</td>
                    <td className="td">
                      <div className="flex items-center gap-1.5 font-medium">
                        {e.description}
                        {e.commitmentId && <Link2 className="size-3 text-stone-400" aria-label="Linked to a commitment" />}
                        {e.status === 'archived' && <Badge>Archived</Badge>}
                      </div>
                      <div className="text-[11px] text-stone-500">{categoryLabel(e.category, e.customCategory)}{e.notes && ` · ${e.notes}`}</div>
                    </td>
                    <td className="td"><div className="flex items-center gap-1.5"><TypeBadge type={e.type} />{e.type === 'personal' && e.ownerId !== e.paidBy && <span className="text-[11px] text-stone-500">for {memberName(e.ownerId)}</span>}</div></td>
                    <td className="td text-stone-600">{memberName(e.paidBy)}</td>
                    <td className="td text-right font-medium"><Money value={e.amount} /></td>
                    <td className="td text-right text-xs text-stone-500">
                      {person === 'all'
                        ? e.type === 'common' ? e.shares.map((s) => <div key={s.userId}>{memberName(s.userId)} <Money value={s.amount} /></div>) : '—'
                        : <Money value={e.shares.filter((s) => s.userId === person).reduce((a, s) => a + s.amount, 0)} />}
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      {e.status === 'active' && <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Edit" onClick={() => setEditing(e)}><Pencil className="size-3.5" /></button>}
                      <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title={e.status === 'archived' ? 'Restore' : 'Archive'} onClick={() => toggleArchive(e)}>
                        {e.status === 'archived' ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50/60">
                <tr>
                  <td className="td text-xs font-medium text-stone-600" colSpan={4}>{active.length} active expense{active.length === 1 ? '' : 's'}</td>
                  <td className="td text-right font-semibold" colSpan={2}><Money value={total} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!editing} onClose={close} title={editing === 'new' ? 'Add expense' : 'Edit expense'}>
        {editing && (
          <ExpenseForm initial={editing === 'new' ? undefined : editing} month={month} onCancel={close} onSaved={() => { close(); reload(); }} />
        )}
      </Modal>
    </div>
  );
}
