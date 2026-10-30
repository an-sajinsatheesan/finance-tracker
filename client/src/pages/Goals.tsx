import { useState, type FormEvent } from 'react';
import { Archive, Plus, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Allocation, Goal, Kind } from '../lib/types';
import { dateLabel, monthLabel, todayStr } from '../lib/format';
import { Badge, Button, Empty, ErrorNote, Field, Modal, Money, PageHeader, Spinner, TypeBadge } from '../components/ui';

export default function Goals() {
  const { month } = useMonth();
  const { workspace, user, memberName } = useAuth();
  const goals = useApi<Goal[]>('/goals');
  const allocs = useApi<Allocation[]>(`/goal-allocations?month=${month}`);
  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [g, setG] = useState({ name: '', targetAmount: '', type: 'common' as Kind, ownerId: user!.id, notes: '' });
  const [a, setA] = useState({ userId: user!.id, amount: '', date: todayStr(), note: '' });

  const reload = () => { goals.reload(); allocs.reload(); };

  async function createGoal(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.post('/goals', { ...g, targetAmount: Number(g.targetAmount || 0), ownerId: g.type === 'personal' ? g.ownerId : null });
      setCreating(false); setG({ ...g, name: '', targetAmount: '', notes: '' }); reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function allocate(e: FormEvent) {
    e.preventDefault(); if (!allocating) return; setBusy(true); setError(null);
    try {
      await api.post(`/goals/${allocating._id}/allocations`, { ...a, amount: Number(a.amount) });
      setAllocating(null); reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  const openAllocate = (goal: Goal) => {
    const today = todayStr();
    setA({ userId: goal.type === 'personal' ? goal.ownerId! : user!.id, amount: '', date: today.startsWith(month) ? today : `${month}-01`, note: '' });
    setError(null);
    setAllocating(goal);
  };

  const visible = (goals.data ?? []).filter((x) => x.status !== 'archived');

  return (
    <div>
      <PageHeader title="Goals" subtitle="Set money aside from cash left" actions={<Button variant="primary" onClick={() => { setError(null); setCreating(true); }}><Plus className="size-3.5" /> New goal</Button>} />
      <ErrorNote message={goals.error} />
      {goals.loading && !goals.data ? <Spinner /> : visible.length === 0 ? (
        <div className="card"><Empty icon={<Target className="size-8" />} title="No goals yet">Create a goal (emergency fund, travel, gold…) and allocate to it each month.</Empty></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((goal) => {
            const pct = goal.targetAmount > 0 ? Math.min(100, (goal.allocatedTotal / goal.targetAmount) * 100) : 0;
            return (
              <div key={goal._id} className="card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{goal.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5"><TypeBadge type={goal.type} />{goal.type === 'personal' && <span className="text-[11px] text-stone-500">{memberName(goal.ownerId)}</span>}{goal.status === 'completed' && <Badge tone="brand">Completed</Badge>}</div>
                  </div>
                  <button className="rounded p-1 text-stone-400 hover:bg-stone-100" title="Archive goal" onClick={async () => { await api.put(`/goals/${goal._id}`, { status: 'archived' }); reload(); }}><Archive className="size-3.5" /></button>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <Money value={goal.allocatedTotal} className="font-semibold" />
                  {goal.targetAmount > 0 && <span className="text-xs text-stone-500">of <Money value={goal.targetAmount} /></span>}
                </div>
                {goal.targetAmount > 0 && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>}
                <div className="mt-3 flex gap-2">
                  {goal.status === 'active' && <Button size="sm" onClick={() => openAllocate(goal)}><Plus className="size-3" /> Allocate</Button>}
                  {goal.status === 'active' && goal.targetAmount > 0 && goal.allocatedTotal >= goal.targetAmount && (
                    <Button size="sm" variant="ghost" onClick={async () => { await api.put(`/goals/${goal._id}`, { status: 'completed' }); reload(); }}>Mark completed</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-xs font-semibold text-stone-700">Allocations in {monthLabel(month)}</h2>
      <div className="card overflow-hidden">
        {(allocs.data ?? []).filter((x) => x.status === 'active').length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-stone-500">Nothing allocated this month.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Date</th><th className="th">Goal</th><th className="th">From</th><th className="th text-right">Amount</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {(allocs.data ?? []).filter((x) => x.status === 'active').map((x) => (
                <tr key={x._id}>
                  <td className="td num text-stone-600">{dateLabel(x.date)}</td>
                  <td className="td">{goals.data?.find((y) => y._id === x.goalId)?.name}{x.note && <div className="text-[11px] text-stone-500">{x.note}</div>}</td>
                  <td className="td text-stone-600">{memberName(x.userId)}</td>
                  <td className="td text-right font-medium"><Money value={x.amount} /></td>
                  <td className="td text-right"><button className="rounded p-1.5 text-stone-400 hover:bg-stone-100" title="Archive allocation" onClick={async () => { await api.post(`/goal-allocations/${x._id}/archive`); reload(); }}><Archive className="size-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New goal">
        <form onSubmit={createGoal} className="space-y-3">
          <Field label="Name"><input className="input" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} required maxLength={80} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target (optional)"><input className="input num text-right" type="number" min={0} step="0.01" value={g.targetAmount} onChange={(e) => setG({ ...g, targetAmount: e.target.value })} /></Field>
            <Field label="Type">
              <select className="input" value={g.type} onChange={(e) => setG({ ...g, type: e.target.value as Kind })}><option value="common">Common</option><option value="personal">Personal</option></select>
            </Field>
          </div>
          {g.type === 'personal' && (
            <Field label="Owner"><select className="input" value={g.ownerId} onChange={(e) => setG({ ...g, ownerId: e.target.value })}>{workspace?.members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></Field>
          )}
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><Button type="button" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Create goal</Button></div>
        </form>
      </Modal>
      <Modal open={!!allocating} onClose={() => setAllocating(null)} title={`Allocate to ${allocating?.name ?? ''}`}>
        <form onSubmit={allocate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <select className="input" value={a.userId} disabled={allocating?.type === 'personal'} onChange={(e) => setA({ ...a, userId: e.target.value })}>
                {workspace?.members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </Field>
            <Field label="Amount"><input className="input num text-right" type="number" min={0.01} step="0.01" value={a.amount} onChange={(e) => setA({ ...a, amount: e.target.value })} required autoFocus /></Field>
          </div>
          <Field label="Date"><input className="input" type="date" value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} required /></Field>
          <Field label="Note"><input className="input" value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} maxLength={200} /></Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><Button type="button" onClick={() => setAllocating(null)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Allocate</Button></div>
        </form>
      </Modal>
    </div>
  );
}
