import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, Pencil, Plus, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Income } from '../lib/types';
import { dateLabel, monthLabel, todayStr } from '../lib/format';
import { Badge, Button, Empty, ErrorNote, Field, Modal, Money, PageHeader, Spinner, cx } from '../components/ui';

const STATUS_TONE = { expected: 'amber', partial: 'sky', received: 'brand', archived: 'stone' } as const;

function IncomeForm({ initial, month, onSaved, onCancel }: { initial?: Income; month: string; onSaved: () => void; onCancel: () => void }) {
  const { workspace, user } = useAuth();
  const [f, setF] = useState({
    userId: initial?.userId ?? user!.id,
    source: initial?.source ?? '',
    expectedAmount: initial ? String(initial.expectedAmount) : '',
    receivedAmount: initial ? String(initial.receivedAmount) : '0',
    expectedDate: initial?.expectedDate ?? '',
    receivedDate: initial?.receivedDate ?? '',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...f, expectedAmount: Number(f.expectedAmount), receivedAmount: Number(f.receivedAmount || 0) };
    try {
      if (initial) await api.put(`/income/${initial._id}`, body);
      else await api.post('/income', { ...body, month });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Person">
          <select className="input" value={f.userId} onChange={(e) => set('userId', e.target.value)}>
            {workspace?.members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </Field>
        <Field label="Source"><input className="input" value={f.source} onChange={(e) => set('source', e.target.value)} required maxLength={80} placeholder="Salary, bonus…" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expected amount"><input className="input num text-right" type="number" min={0} step="0.01" value={f.expectedAmount} onChange={(e) => set('expectedAmount', e.target.value)} required /></Field>
        <Field label="Expected date"><input className="input" type="date" value={f.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received amount"><input className="input num text-right" type="number" min={0} step="0.01" value={f.receivedAmount} onChange={(e) => set('receivedAmount', e.target.value)} /></Field>
        <Field label="Received date"><input className="input" type="date" value={f.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} /></Field>
      <p className="text-[11px] text-stone-500">Status is set automatically: expected → partial → received.</p>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add income'}</Button>
      </div>
    </form>
  );
}

export default function IncomePage() {
  const { month } = useMonth();
  const { workspace, memberName } = useAuth();
  const { data, error, loading, reload } = useApi<Income[]>(`/income?month=${month}`);
  const [editing, setEditing] = useState<Income | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const rows = (data ?? []).filter((i) => showArchived || i.status !== 'archived');
  const live = rows.filter((i) => i.status !== 'archived');

  async function act(path: string, body?: unknown) {
    setActionError(null);
    try { await (body ? api.put(path, body) : api.post(path)); reload(); } catch (e) { setActionError(errorText(e)); }
  }
  const markReceived = (i: Income) => {
    const today = todayStr();
    act(`/income/${i._id}`, { receivedAmount: i.expectedAmount, receivedDate: today.startsWith(month) ? today : i.expectedDate || `${month}-01` });
  };

  return (
    <div>
      <PageHeader
        title="Income"
        subtitle={`${monthLabel(month)} · expected vs received`}
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add income</Button>}
      />
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {workspace?.members.map((m) => {
          const mine = live.filter((i) => i.userId === m.userId);
          const exp = mine.reduce((a, i) => a + i.expectedAmount, 0);
          const rec = mine.reduce((a, i) => a + i.receivedAmount, 0);
          return (
            <div key={m.userId} className="card px-3.5 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{m.displayName}</div>
              <div className="mt-1 text-base font-semibold"><Money value={rec} /></div>
              <div className="text-[11px] text-stone-500">received of <Money value={exp} /></div>
            </div>
          );
        })}
      </div>
      <div className="mb-2 flex justify-end">
        <label className="flex items-center gap-1.5 text-xs text-stone-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      <ErrorNote message={error || actionError} />
      <div className="card overflow-hidden">
        {loading && !data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<Wallet className="size-8" />} title="No income for this month">
            {workspace && month < workspace.startMonth ? 'This month is before the workspace start month.' : 'Expected income is created automatically for the current and next month.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-stone-200 bg-stone-50/60">
                <tr>
                  <th className="th">Person</th><th className="th">Source</th><th className="th text-right">Expected</th><th className="th text-right">Received</th>
                  <th className="th">Expected date</th><th className="th">Received date</th><th className="th">Status</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((i) => (
                  <tr key={i._id} className={cx(i.status === 'archived' && 'text-stone-400')}>
                    <td className="td font-medium">{memberName(i.userId)}</td>
                    <td className="td">{i.source}{i.notes && <div className="text-[11px] text-stone-500">{i.notes}</div>}</td>
                    <td className="td text-right"><Money value={i.expectedAmount} className="text-stone-600" /></td>
                    <td className="td text-right font-medium"><Money value={i.receivedAmount} /></td>
                    <td className="td num text-stone-600">{dateLabel(i.expectedDate)}</td>
                    <td className="td num text-stone-600">{dateLabel(i.receivedDate)}</td>
                    <td className="td"><Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge></td>
                    <td className="td whitespace-nowrap text-right">
                      {i.status !== 'received' && i.status !== 'archived' && (
                        <Button size="sm" onClick={() => markReceived(i)}><CheckCircle2 className="size-3.5" /> Received</Button>
                      )}
                      {i.status !== 'archived' && <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Edit" onClick={() => setEditing(i)}><Pencil className="size-3.5" /></button>}
                      <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title={i.status === 'archived' ? 'Restore' : 'Archive'} onClick={() => act(`/income/${i._id}/${i.status === 'archived' ? 'unarchive' : 'archive'}`)}>
                        {i.status === 'archived' ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50/60">
                <tr>
                  <td className="td text-xs font-medium text-stone-600" colSpan={2}>Household</td>
                  <td className="td text-right font-semibold"><Money value={live.reduce((a, i) => a + i.expectedAmount, 0)} /></td>
                  <td className="td text-right font-semibold"><Money value={live.reduce((a, i) => a + i.receivedAmount, 0)} /></td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add income' : 'Edit income'}>
        {editing && <IncomeForm initial={editing === 'new' ? undefined : editing} month={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      </Modal>
    </div>
  );
}
