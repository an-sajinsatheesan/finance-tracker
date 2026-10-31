import { useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ProgressBar } from 'primereact/progressbar';
import { Archive, Plus, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Allocation, Goal, Kind } from '../lib/types';
import { dateLabel, money, monthLabel, todayStr } from '../lib/format';
import {
  Badge, Button, DateInput, Empty, ErrorNote, Field, IconButton, Modal, Money, NumberInput, Page, PageHeader, StatSkeleton, TableCard, TableSkeleton, Tabs, TextInput, usePaging,
  TypeBadge, confirmAction, useToast,
} from '../components/ui';
import { MemberSelect } from '../components/forms';

export default function Goals() {
  const { month } = useMonth();
  const { user, memberName, isCouple } = useAuth();
  const toast = useToast();
  const goals = useApi<Goal[]>('/goals');
  const allocs = useApi<Allocation[]>(`/goal-allocations?month=${month}`);
  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [g, setG] = useState({ name: '', targetAmount: null as number | null, type: (isCouple ? 'common' : 'personal') as Kind, ownerId: user!.id, notes: '' });
  const [a, setA] = useState({ userId: user!.id, amount: null as number | null, date: todayStr(), note: '' });

  const reload = () => { goals.reload(); allocs.reload(); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errorText(e)); }
  };

  async function createGoal(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.post('/goals', { ...g, targetAmount: g.targetAmount ?? 0, ownerId: g.type === 'personal' ? g.ownerId : null });
      toast.success(`Goal “${g.name}” created`);
      setCreating(false); setG({ ...g, name: '', targetAmount: null, notes: '' }); reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function allocate(e: FormEvent) {
    e.preventDefault(); if (!allocating) return;
    if (!a.amount || a.amount <= 0) { setError('Enter the amount'); return; }
    if (remaining !== null && a.amount > remaining + 0.001) { setError('That is more than the ' + money(remaining) + ' still needed for this goal'); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/goals/${allocating._id}/allocations`, a);
      toast.success(`Allocated to ${allocating.name}`);
      setAllocating(null); reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  const openAllocate = (goal: Goal) => {
    const today = todayStr();
    setA({ userId: goal.type === 'personal' ? goal.ownerId! : user!.id, amount: null, date: today.startsWith(month) ? today : `${month}-01`, note: '' });
    setError(null);
    setAllocating(goal);
  };
  const askArchiveGoal = (goal: Goal) => confirmAction({
    header: `Archive “${goal.name}”?`,
    message: 'The goal is hidden. Its allocations stay in history.',
    acceptLabel: 'Archive',
    onAccept: () => run(() => api.put(`/goals/${goal._id}`, { status: 'archived' }), 'Goal archived'),
  });
  const askArchiveAlloc = (x: Allocation) => confirmAction({
    header: 'Archive allocation?',
    message: <>The <Money value={x.amount} /> AED allocation is removed from the goal’s total and from “Allocated to goals”.</>,
    acceptLabel: 'Archive',
    onAccept: () => run(() => api.post(`/goal-allocations/${x._id}/archive`), 'Allocation archived'),
  });

  const paging = usePaging(month);
  const visible = (goals.data ?? []).filter((x) => x.status !== 'archived');
  // Allocations can't take a goal past its target.
  const remaining = allocating && allocating.targetAmount > 0 ? Math.max(0, Math.round((allocating.targetAmount - allocating.allocatedTotal) * 100) / 100) : null;
  const monthAllocs = (allocs.data ?? []).filter((x) => x.status === 'active');

  return (
    <Page fill>
      <PageHeader
        title="Goals"
        subtitle="Earmark part of your cash left for goals. Allocations don’t change bank balances."
        actions={<Button variant="primary" onClick={() => { setError(null); setCreating(true); }} icon={<Plus className="size-3.5" />}>New goal</Button>}
      />
      <ErrorNote message={goals.error} />
      {goals.loading && !goals.data ? <StatSkeleton count={3} className="sm:grid-cols-2 lg:grid-cols-3" /> : visible.length === 0 ? (
        <div className="card"><Empty icon={<Target className="size-8" />} title="No goals yet">Create a goal (emergency fund, travel, gold…) and allocate to it each month.</Empty></div>
      ) : (
        <div className="scroll-thin grid max-h-[45vh] shrink-0 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((goal) => {
            const pct = goal.targetAmount > 0 ? Math.min(100, (goal.allocatedTotal / goal.targetAmount) * 100) : 0;
            return (
              <div key={goal._id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{goal.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {isCouple && <TypeBadge type={goal.type} />}
                      {isCouple && goal.type === 'personal' && <span className="text-[11px] text-stone-500">{memberName(goal.ownerId)}</span>}
                      {goal.status === 'completed' && <Badge tone="brand">Completed</Badge>}
                    </div>
                  </div>
                  <IconButton title="Archive goal" danger onClick={() => askArchiveGoal(goal)}><Archive className="size-3.5" /></IconButton>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <Money value={goal.allocatedTotal} className="font-semibold" />
                  {goal.targetAmount > 0 && <span className="text-xs text-stone-500">of <Money value={goal.targetAmount} /></span>}
                </div>
                {goal.targetAmount > 0 && <ProgressBar value={Math.round(pct)} showValue={false} style={{ height: 6 }} className="mt-1.5" />}
                <div className="mt-3 flex gap-2">
                  {goal.status === 'active' && !(goal.targetAmount > 0 && goal.allocatedTotal >= goal.targetAmount) && <Button size="sm" onClick={() => openAllocate(goal)} icon={<Plus className="size-3" />}>Allocate</Button>}
                  {goal.status === 'active' && goal.targetAmount > 0 && goal.allocatedTotal >= goal.targetAmount && (
                    <Button size="sm" variant="ghost" onClick={() => run(() => api.put(`/goals/${goal._id}`, { status: 'completed' }), 'Goal completed')}>Mark completed</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-5 shrink-0 text-sm font-semibold text-stone-800">Allocations in {monthLabel(month)}</h2>
      <TableCard>
        <DataTable value={monthAllocs} dataKey="_id" size="small" {...paging} emptyMessage={allocs.loading && !allocs.data ? <TableSkeleton rows={3} cols={isCouple ? 4 : 3} /> : <p className="px-3 py-6 text-center text-xs text-stone-500">Nothing allocated this month.</p>}>
          <Column header="Date" body={(x: Allocation) => <span className="num text-stone-600">{dateLabel(x.date)}</span>} />
          <Column header="Goal" body={(x: Allocation) => <div>{goals.data?.find((y) => y._id === x.goalId)?.name}{x.note && <div className="text-[11px] text-stone-500">{x.note}</div>}</div>} />
          {isCouple && <Column header="From" body={(x: Allocation) => <span className="text-stone-600">{memberName(x.userId)}</span>} />}
          <Column header="Amount" align="right" body={(x: Allocation) => <Money value={x.amount} className="font-medium" />} />
          <Column align="right" style={{ width: '3rem' }} body={(x: Allocation) => <IconButton title="Archive allocation" danger onClick={() => askArchiveAlloc(x)}><Archive className="size-3.5" /></IconButton>} />
        </DataTable>
      </TableCard>

      <Modal open={creating} onClose={() => setCreating(false)} title="New goal">
        <form onSubmit={createGoal} className="space-y-3">
          <Field label="Name"><TextInput value={g.name} onChange={(v) => setG({ ...g, name: v })} required maxLength={80} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target (optional)"><NumberInput value={g.targetAmount} onChange={(v) => setG({ ...g, targetAmount: v })} min={0} /></Field>
            {isCouple && <Field label="Type"><Tabs<Kind> value={g.type} onChange={(v) => setG({ ...g, type: v })} items={[{ value: 'common', label: 'Common' }, { value: 'personal', label: 'Personal' }]} full /></Field>}
          </div>
          {isCouple && g.type === 'personal' && <Field label="Owner"><MemberSelect value={g.ownerId} onChange={(v) => setG({ ...g, ownerId: v })} /></Field>}
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><Button onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Create goal</Button></div>
        </form>
      </Modal>
      <Modal open={!!allocating} onClose={() => setAllocating(null)} title={`Allocate to ${allocating?.name ?? ''}`}>
        <form onSubmit={allocate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {isCouple && (
              <Field label="From">
                {allocating?.type === 'personal' ? <TextInput value={memberName(a.userId)} onChange={() => undefined} disabled /> : <MemberSelect value={a.userId} onChange={(v) => setA({ ...a, userId: v })} />}
              </Field>
            )}
            <Field label="Amount" className={isCouple ? '' : 'col-span-2'} hint={remaining !== null ? 'Up to ' + money(remaining) + ' left to reach the target' : undefined}>
              <NumberInput value={a.amount} onChange={(v) => setA({ ...a, amount: v })} min={0.01} max={remaining ?? undefined} required autoFocus />
            </Field>
          </div>
          <Field label="Date"><DateInput value={a.date} onChange={(v) => setA({ ...a, date: v })} required /></Field>
          <Field label="Note"><TextInput value={a.note} onChange={(v) => setA({ ...a, note: v })} maxLength={200} /></Field>
          <p className="text-[11px] text-stone-500">This earmarks part of your cash left; it doesn’t change any bank balance. The goal is marked completed when it reaches its target.</p>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><Button onClick={() => setAllocating(null)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Allocate</Button></div>
        </form>
      </Modal>
    </Page>
  );
}
