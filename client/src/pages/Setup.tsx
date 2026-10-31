import { useEffect, useMemo, useState } from 'react';
import { Steps } from 'primereact/steps';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Check, Mail, Pencil, Plus, Trash2, LogOut, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { api, errorText } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Commitment, IncomeSource, InviteResult, Member } from '../lib/types';
import { addMonths, categoryLabel, monthLabel, thisMonth } from '../lib/format';
import {
  Badge, Button, ErrorNote, Field, IconButton, Modal, Money, MonthInput, NumberInput, Select, TextInput, TypeBadge, confirmAction, useToast,
} from '../components/ui';
import { CommitmentForm, LookupSelect, PAY_TIMING_OPTIONS } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';

const STEPS = ['Workspace', 'Income', 'Commitments', 'Review'];

function share(amount: number, n: number, i: number) {
  const fils = Math.round(amount * 100);
  const base = Math.floor(fils / n);
  return (base + (i < fils - base * n ? 1 : 0)) / 100;
}

/** Shown once after registration: whether the partner invitation went out. */
function InviteNotice() {
  const [invite, setInvite] = useState<InviteResult | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('ft.invite') ?? 'null'); } catch { return null; }
  });
  if (!invite) return null;
  const dismiss = () => { try { sessionStorage.removeItem('ft.invite'); } catch { /* ignore */ } setInvite(null); };
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <Mail className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div>{invite.sent ? <>Invitation sent to <b>{invite.email}</b>. They can join any time; you can carry on with the setup.</> : <>Email isn’t configured on the server — share this invitation link with <b>{invite.email}</b>:</>}</div>
        {!invite.sent && <TextInput value={invite.url} onChange={() => undefined} readOnly onFocus={(e) => e.target.select()} className="text-xs" />}
        <div className="text-violet-700">You can resend it later from Settings → Members.</div>
      </div>
      <button className="rounded p-0.5 text-violet-500 hover:bg-violet-100 hover:text-violet-800" onClick={dismiss} aria-label="Dismiss"><X className="size-3.5" /></button>
    </div>
  );
}

type SourceRow = IncomeSource & { _j: number };

export default function Setup() {
  const { workspace, refreshWorkspace, logout, isCouple } = useAuth();
  const toast = useToast();
  const { setMonth } = useMonth();
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
  const updateSource = (i: number, j: number, patch: Partial<IncomeSource>) =>
    setMembers((ms) => ms.map((m, k) => (k !== i ? m : { ...m, incomeSources: m.incomeSources.map((s, l) => (l === j ? { ...s, ...patch } : s)) })));

  async function saveWorkspace() {
    await api.put('/workspace', {
      name,
      members: members.map((m) => ({
        userId: m.userId, displayName: m.displayName, relationship: m.relationship,
        incomeSources: m.incomeSources.map((s) => ({ ...s, amount: Number(s.amount || 0), expectedDay: Number(s.expectedDay || 1) })),
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
      setMonth(startMonth); // open the app on the first budget month (may be next month)
      toast.success('Your workspace is ready', 'Setup complete');
      await refreshWorkspace();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const askRemoveCommitment = (c: Commitment) => confirmAction({
    header: `Remove “${c.title}”?`,
    message: 'It is removed from your plan. You can add it again any time.',
    acceptLabel: 'Remove',
    onAccept: async () => {
      try { await api.post(`/commitments/${c.id}/archive`); toast.success(`${c.title} removed`); commitments.reload(); } catch (e) { toast.error(errorText(e)); }
    },
  });

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
    <div className="h-dvh overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Set up your workspace</h1>
            <p className="text-xs text-stone-500">Four quick steps. Everything can be changed later.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} icon={<LogOut className="size-3.5" />}>Sign out</Button>
        </div>
        <InviteNotice />

        <Steps model={STEPS.map((label) => ({ label }))} activeIndex={step} readOnly className="mb-6" />

        <div className="card p-5">
          {step === 0 && (
            <div className="space-y-4">
              <Field label="Workspace name"><TextInput value={name} onChange={setName} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {members.map((m, i) => (
                  <div key={m.userId} className="space-y-3 rounded-md border border-stone-200 p-3">
                    {m.status === 'invited' && <Badge tone="amber">Invitation pending{m.email ? ` · ${m.email}` : ''}</Badge>}
                    <Field label="Display name"><TextInput value={m.displayName} onChange={(v) => updateMember(i, { displayName: v })} /></Field>
                    <Field label="Relationship"><LookupSelect type="relationship" value={m.relationship} onChange={(v) => updateMember(i, { relationship: v })} showClear /></Field>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500">Monthly income each person expects. A month's expected income is created from these, and you mark it as received on the Income screen.</p>
              <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">Salary credited on the last working day and spent the following month? Set <b>Paid</b> to <b>End of previous month</b>: e.g. the salary received on 28 Oct then counts as November’s income. Use pay day <b>31</b> for “last day of the month”.</p>
              {members.map((m, i) => (
                <div key={m.userId} className="overflow-hidden rounded-md border border-stone-200">
                  <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
                    <span className="text-sm font-medium">{m.displayName}</span>
                    <Money className="text-sm font-semibold" value={m.incomeSources.filter((s) => s.active).reduce((a, s) => a + Number(s.amount || 0), 0)} />
                  </div>
                  <DataTable value={m.incomeSources.map((s, j) => ({ ...s, _j: j }))} size="small" emptyMessage={<p className="py-3 text-center text-xs text-stone-500">No income source yet.</p>}>
                    <Column header="Source" body={(s: SourceRow) => <LookupSelect type="incomeSource" value={s.source} onChange={(v) => updateSource(i, s._j, { source: v })} />} />
                    <Column header="AED / month" style={{ width: '10rem' }} body={(s: SourceRow) => <NumberInput value={Number(s.amount) || null} onChange={(v) => updateSource(i, s._j, { amount: v ?? 0 })} min={0} ariaLabel="Amount" />} />
                    <Column header="Pay day" style={{ width: '6rem' }} body={(s: SourceRow) => <NumberInput value={Number(s.expectedDay) || null} onChange={(v) => updateSource(i, s._j, { expectedDay: v ?? 1 })} min={1} max={31} decimals={0} ariaLabel="Pay day" />} />
                    <Column header="Paid" style={{ width: '12rem' }} body={(s: SourceRow) => <Select value={s.paidPreviousMonth ? 'previous' : 'same'} options={PAY_TIMING_OPTIONS} onChange={(v) => updateSource(i, s._j, { paidPreviousMonth: v === 'previous' })} ariaLabel="When it is paid" />} />
                    <Column style={{ width: '3rem' }} body={(s: SourceRow) => (
                      <IconButton title="Remove source" danger onClick={() => confirmAction({
                        header: 'Remove income source?', message: 'It won’t be used to create monthly income.', acceptLabel: 'Remove',
                        onAccept: () => updateMember(i, { incomeSources: m.incomeSources.filter((_, k) => k !== s._j) }),
                      })}><Trash2 className="size-3.5" /></IconButton>
                    )} />
                  </DataTable>
                  <div className="px-2 py-1.5">
                    <Button size="sm" variant="ghost" onClick={() => updateMember(i, { incomeSources: [...m.incomeSources, { source: 'Salary', amount: 0, expectedDay: 28, paidPreviousMonth: false, active: true }] })} icon={<Plus className="size-3.5" />}>
                      Add income source
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500">Planned monthly payments (rent, EMIs, bills). They repeat every month automatically.{isCouple && ' Common ones are split 50/50.'} These are plans, not recorded expenses.</p>
                <Button size="sm" variant="primary" onClick={() => setEditing('new')} icon={<Plus className="size-3.5" />}>Add</Button>
              </div>
              <div className="overflow-hidden rounded-md border border-stone-200">
                <DataTable value={commitments.data ?? []} dataKey="id" size="small" loading={commitments.loading && !commitments.data} emptyMessage={<p className="py-4 text-center text-xs text-stone-500">No commitments yet.</p>}>
                  <Column header="Commitment" body={(c: Commitment) => <div className="flex items-center gap-3"><CategoryIcon category={c.category} custom={c.customCategory} /><div><div className="font-medium">{c.title}</div><div className="text-[11px] text-stone-500">{categoryLabel(c.category, c.customCategory)} · due day {c.dueDay}</div></div></div>} />
                  {isCouple && <Column header="Type" body={(c: Commitment) => <div className="flex items-center gap-1.5"><TypeBadge type={c.type} />{c.type === 'personal' && <span className="text-xs text-stone-500">{members.find((m) => m.userId === c.ownerId)?.displayName}</span>}</div>} />}
                  <Column header="Amount" align="right" body={(c: Commitment) => <Money value={c.amount} />} />
                  <Column align="right" style={{ width: '5rem' }} body={(c: Commitment) => (
                    <div className="whitespace-nowrap">
                      <IconButton title="Edit" onClick={() => setEditing(c)}><Pencil className="size-3.5" /></IconButton>
                      <IconButton title="Remove" danger onClick={() => askRemoveCommitment(c)}><Trash2 className="size-3.5" /></IconButton>
                    </div>
                  )} />
                </DataTable>
              </div>
              <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New commitment' : 'Edit commitment'}>
                {editing && (
                  <CommitmentForm initial={editing === 'new' ? undefined : editing} defaultMonth={startMonth} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); commitments.reload(); }} />
                )}
              </Modal>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Field label="First month to track" className="max-w-xs" hint="The first month you budget. Income and commitments are planned from this month onwards.">
                <MonthInput value={startMonth} onChange={setStartMonth} max={addMonths(thisMonth(), 1)} />
              </Field>
              {startMonth > thisMonth() && (
                <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  You’re starting with {monthLabel(startMonth)}. Salary set to “End of previous month” can be marked received now, at the end of {monthLabel(thisMonth())}. Expenses for {monthLabel(startMonth)} can be added from the 1st.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {review.map((r) => (
                  <div key={r.m.userId} className="rounded-md border border-stone-200 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="font-medium">{r.m.displayName}</span><Badge>{monthLabel(startMonth)}</Badge></div>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between"><dt className="text-stone-500">Expected income</dt><dd><Money value={r.income} /></dd></div>
                      <div className="flex justify-between"><dt className="text-stone-500">Personal commitments</dt><dd><Money value={-r.personal} /></dd></div>
                      {isCouple && <div className="flex justify-between"><dt className="text-stone-500">Share of common</dt><dd><Money value={-r.common} /></dd></div>}
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
              {step < 3
                ? <Button variant="primary" loading={busy} onClick={next}>Continue</Button>
                : <Button variant="primary" loading={busy} onClick={finish} icon={<Check className="size-3.5" />}>Confirm & start</Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
