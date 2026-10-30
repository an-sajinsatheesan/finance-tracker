import { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Pencil, Plus, RotateCcw, CalendarX2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Commitment, Expense } from '../lib/types';
import { categoryLabel, money, monthLabel, thisMonth } from '../lib/format';
import { Button, Empty, ErrorNote, Field, Modal, Money, PageHeader, Spinner, Tabs, TypeBadge } from '../components/ui';
import { CommitmentForm } from '../components/forms';

type Tab = 'active' | 'scheduled' | 'ended';

export default function Commitments() {
  const { month } = useMonth();
  const { memberName, workspace } = useAuth();
  const list = useApi<Commitment[]>('/commitments');
  const expenses = useApi<Expense[]>(`/expenses?month=${month}`);
  const [tab, setTab] = useState<Tab>('active');
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);
  const [ending, setEnding] = useState<Commitment | null>(null);
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = list.data ?? [];
  const rows = all.filter((c) => c.status === tab);
  const paidIds = useMemo(() => new Set((expenses.data ?? []).map((e) => e.commitmentId).filter(Boolean)), [expenses.data]);
  const inMonth = (c: Commitment) => c.startMonth <= month && (!c.endMonth || c.endMonth >= month);
  const amountIn = (c: Commitment) => {
    const v = [...c.amountHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
    let a = v[0]?.amount ?? 0;
    for (const x of v) if (x.fromMonth <= month) a = x.amount;
    return a;
  };
  const n = workspace?.members.length ?? 2;
  const plannedTotal = all.filter(inMonth).reduce((a, c) => a + amountIn(c), 0);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try { await fn(); list.reload(); expenses.reload(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader
        title="Commitments"
        subtitle={`Planned monthly payments · ${monthLabel(month)} total ${money(plannedTotal)} AED`}
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> New commitment</Button>}
      />
      <div className="mb-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={(['active', 'scheduled', 'ended'] as Tab[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1), count: all.filter((c) => c.status === t).length }))} />
      </div>
      <ErrorNote message={list.error || error} />
      <div className="card overflow-hidden">
        {list.loading && !list.data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<CalendarClock className="size-8" />} title={`No ${tab} commitments`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-stone-200 bg-stone-50/60">
                <tr>
                  <th className="th">Commitment</th><th className="th">Type</th><th className="th text-right">Monthly</th><th className="th text-right">Per person</th>
                  <th className="th">Period</th><th className="th">{monthLabel(month, 'short')}</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((c) => {
                  const applies = inMonth(c);
                  const paid = paidIds.has(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="td">
                        <div className="font-medium">{c.title}</div>
                        <div className="text-[11px] text-stone-500">{categoryLabel(c.category, c.customCategory)} · due day {c.dueDay}{c.amountHistory.length > 1 && ' · amount changed'}</div>
                      </td>
                      <td className="td"><div className="flex items-center gap-1.5"><TypeBadge type={c.type} />{c.type === 'personal' && <span className="text-xs text-stone-500">{memberName(c.ownerId)}</span>}</div></td>
                      <td className="td text-right font-medium"><Money value={applies ? amountIn(c) : c.amount} /></td>
                      <td className="td text-right text-xs text-stone-500">{c.type === 'common' ? <Money value={(applies ? amountIn(c) : c.amount) / n} /> : '—'}</td>
                      <td className="td text-xs text-stone-600 whitespace-nowrap">{monthLabel(c.startMonth, 'short')} → {c.endMonth ? monthLabel(c.endMonth, 'short') : 'ongoing'}</td>
                      <td className="td">
                        {!applies ? <span className="text-xs text-stone-400">n/a</span> : paid ? (
                          <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Paid</span>
                        ) : (
                          <Button size="sm" loading={busy === `pay-${c.id}`} onClick={() => run(`pay-${c.id}`, () => api.post(`/commitments/${c.id}/pay`, { month }))}>Mark paid</Button>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Edit" onClick={() => setEditing(c)}><Pencil className="size-3.5" /></button>
                        {c.status === 'ended' ? (
                          <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Reactivate" onClick={() => run(c.id, () => api.post(`/commitments/${c.id}/reactivate`))}><RotateCcw className="size-3.5" /></button>
                        ) : (
                          <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" title="End commitment" onClick={() => { setEnding(c); setEndMonth(c.startMonth > thisMonth() ? c.startMonth : thisMonth()); }}><CalendarX2 className="size-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New commitment' : 'Edit commitment'}>
        {editing && (
          <CommitmentForm initial={editing === 'new' ? undefined : editing} defaultMonth={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
        )}
      </Modal>
      <Modal
        open={!!ending}
        onClose={() => setEnding(null)}
        title={`End “${ending?.title ?? ''}”`}
        footer={<>
          <Button onClick={() => setEnding(null)}>Cancel</Button>
          <Button variant="primary" loading={busy === ending?.id} onClick={() => ending && run(ending.id, () => api.post(`/commitments/${ending.id}/end`, { endMonth })).then(() => setEnding(null))}>End commitment</Button>
        </>}
      >
        <Field label="Last month it applies" hint="It stops automatically after this month. Earlier months keep their history.">
          <input className="input" type="month" value={endMonth} min={ending?.startMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
