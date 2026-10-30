import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorText } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Commitment, Member } from '../lib/types';
import { categoryLabel, monthLabel, thisMonth } from '../lib/format';
import { Badge, Button, ErrorNote, Field, Modal, Money, TypeBadge, cx } from '../components/ui';
import { CommitmentForm } from '../components/forms';

const STEPS = ['Workspace', 'Income', 'Commitments', 'Review'];

function share(amount: number, n: number, i: number) {
  const fils = Math.round(amount * 100);
  const base = Math.floor(fils / n);
  return (base + (i < fils - base * n ? 1 : 0)) / 100;
}

export default function Setup() {
  const { workspace, refreshWorkspace, logout } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(workspace?.name ?? '');
  const [members, setMembers] = useState<Member[]>(workspace?.members ?? []);
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commitments = useApi<Commitment[]>('/commitments');
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);

  useEffect(() => {
    if (workspace) { setName(workspace.name); setMembers(workspace.members); }
  }, [workspace]);

  const updateMember = (i: number, patch: Partial<Member>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  async function saveWorkspace() {
    await api.put('/workspace', {
      name,
      members: members.map((m) => ({
        userId: m.userId, displayName: m.displayName, relationship: m.relationship,
        incomeSources: m.incomeSources.map((s) => ({ ...s, amount: Number(s.amount), expectedDay: Number(s.expectedDay) })),
      })),
    });
  }

  async function next() {
    setError(null);
    setBusy(true);
    try {
      if (step <= 1) await saveWorkspace();
      setStep((s) => s + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await saveWorkspace();
      await api.post('/workspace/setup/complete', { startMonth });
      await refreshWorkspace();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const active = (commitments.data ?? []).filter((c) => !c.endMonth || c.endMonth >= startMonth);
  const review = useMemo(() => {
    const n = members.length;
    return members.map((m, i) => {
      const income = m.incomeSources.filter((s) => s.active).reduce((a, s) => a + Number(s.amount || 0), 0);
      const personal = active.filter((c) => c.type === 'personal' && c.ownerId === m.userId && c.startMonth <= startMonth).reduce((a, c) => a + c.amount, 0);
      const common = active.filter((c) => c.type === 'common' && c.startMonth <= startMonth).reduce((a, c) => a + share(c.amount, n, i), 0);
      return { m, income, personal, common, balance: income - personal - common };
    });
  }, [members, active, startMonth]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Set up your workspace</h1>
          <p className="text-xs text-stone-500">Four quick steps. Everything can be changed later.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}><LogOut className="size-3.5" /> Sign out</Button>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              i < step ? 'bg-brand-700 text-white' : i === step ? 'border-2 border-brand-700 text-brand-700' : 'border border-stone-300 text-stone-400')}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cx('hidden text-xs sm:block', i === step ? 'font-medium' : 'text-stone-500')}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="card p-5">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Workspace name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((m, i) => (
                <div key={m.userId} className="space-y-3 rounded-md border border-stone-200 p-3">
                  <Field label="Display name"><input className="input" value={m.displayName} onChange={(e) => updateMember(i, { displayName: e.target.value })} /></Field>
                  <Field label="Relationship"><input className="input" value={m.relationship} onChange={(e) => updateMember(i, { relationship: e.target.value })} /></Field>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-stone-500">Monthly income each person expects. A month's expected income is created from these, and you mark it as received on the Income screen.</p>
            {members.map((m, i) => (
              <div key={m.userId} className="rounded-md border border-stone-200">
                <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
                  <span className="text-sm font-medium">{m.displayName}</span>
                  <Money className="text-sm font-semibold" value={m.incomeSources.filter((s) => s.active).reduce((a, s) => a + Number(s.amount || 0), 0)} />
                </div>
                <div className="space-y-2 p-3">
                  {m.incomeSources.map((s, j) => (
                    <div key={j} className="grid grid-cols-[1fr_7rem_4.5rem_auto] items-end gap-2">
                      <Field label={j === 0 ? 'Source' : ''}><input className="input" value={s.source} onChange={(e) => updateMember(i, { incomeSources: m.incomeSources.map((x, k) => (k === j ? { ...x, source: e.target.value } : x)) })} /></Field>
                      <Field label={j === 0 ? 'AED / month' : ''}><input className="input num text-right" type="number" min={0} step="0.01" value={s.amount} onChange={(e) => updateMember(i, { incomeSources: m.incomeSources.map((x, k) => (k === j ? { ...x, amount: e.target.value as unknown as number } : x)) })} /></Field>
                      <Field label={j === 0 ? 'Pay day' : ''}><input className="input num" type="number" min={1} max={31} value={s.expectedDay} onChange={(e) => updateMember(i, { incomeSources: m.incomeSources.map((x, k) => (k === j ? { ...x, expectedDay: e.target.value as unknown as number } : x)) })} /></Field>
                      <button className="mb-1 rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" title="Remove source" onClick={() => updateMember(i, { incomeSources: m.incomeSources.filter((_, k) => k !== j) })}><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => updateMember(i, { incomeSources: [...m.incomeSources, { source: '', amount: 0, expectedDay: 28, active: true }] })}>
                    <Plus className="size-3.5" /> Add income source
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">Planned monthly payments. Common ones are split 50/50. These are plans, not recorded expenses.</p>
              <Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-stone-200"><tr><th className="th">Commitment</th><th className="th">Type</th><th className="th text-right">Amount</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {(commitments.data ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="td"><div className="font-medium">{c.title}</div><div className="text-[11px] text-stone-500">{categoryLabel(c.category, c.customCategory)} · due day {c.dueDay}</div></td>
                      <td className="td"><div className="flex items-center gap-1.5"><TypeBadge type={c.type} />{c.type === 'personal' && <span className="text-xs text-stone-500">{members.find((m) => m.userId === c.ownerId)?.displayName}</span>}</div></td>
                      <td className="td text-right"><Money value={c.amount} /></td>
                      <td className="td text-right whitespace-nowrap">
                        <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Edit" onClick={() => setEditing(c)}><Pencil className="size-3.5" /></button>
                        <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" title="Remove (archived, not deleted)" onClick={async () => { await api.post(`/commitments/${c.id}/archive`); commitments.reload(); }}><Trash2 className="size-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New commitment' : 'Edit commitment'}>
              {editing && (
                <CommitmentForm
                  initial={editing === 'new' ? undefined : editing}
                  defaultMonth={startMonth}
                  onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); commitments.reload(); }}
                />
              )}
            </Modal>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Field label="First month to track" className="max-w-xs" hint="Expected income is generated from this month onwards.">
              <input className="input" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {review.map((r) => (
                <div key={r.m.userId} className="rounded-md border border-stone-200 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="font-medium">{r.m.displayName}</span><Badge>{monthLabel(startMonth)}</Badge></div>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between"><dt className="text-stone-500">Expected income</dt><dd><Money value={r.income} /></dd></div>
                    <div className="flex justify-between"><dt className="text-stone-500">Personal commitments</dt><dd><Money value={-r.personal} /></dd></div>
                    <div className="flex justify-between"><dt className="text-stone-500">Share of common</dt><dd><Money value={-r.common} /></dd></div>
                    <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold"><dt>Planned balance</dt><dd><Money value={r.balance} /></dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500">Household planned balance: <Money className="font-semibold text-stone-800" value={review.reduce((a, r) => a + r.balance, 0)} /> AED</p>
          </div>
        )}

        <div className="mt-5 space-y-3">
          <ErrorNote message={error} />
          <div className="flex justify-between">
            <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < 3 ? (
              <Button variant="primary" loading={busy} onClick={next}>Continue</Button>
            ) : (
              <Button variant="primary" loading={busy} onClick={finish}><Check className="size-3.5" /> Confirm & start</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
