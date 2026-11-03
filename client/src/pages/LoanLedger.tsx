import { useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { AlertTriangle, Archive, CheckCircle2, Landmark, Pencil, Percent, Plus, Receipt, TrendingDown, Wallet, X } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { WealthAccount } from '../lib/types';
import { moneyIn, todayStr } from '../lib/format';
import {
  Badge, Button, DateInput, ErrorNote, Field, IconButton, Modal, NumberInput, Select, StatRail, TableCard, TextInput, confirmAction, cx, usePaging, useToast,
} from '../components/ui';
import { FormFooter } from '../components/forms';

type Kind = 'disbursement' | 'charge' | 'interest' | 'repayment' | 'prepayment' | 'rate' | 'adjustment';
interface Entry {
  id: string; date: string; kind: Kind; details: string; ref: string; amount: number; rate: number | null;
  statementBalance: number | null; notes: string; balance: number; matches: boolean | null;
}
interface Summary {
  outstanding: number; borrowed: number; charges: number; interest: number; interestLastYear: number; repaid: number; prepaid: number;
  principalRepaid: number; rate: number | null; lastPayment: number | null; lastDate: string | null; firstDate: string | null; mismatches: number;
}
type Draft = { key: number; date: string; kind: Kind; amount: number | null; rate: number | null; statementBalance: number | null; details: string; notes: string };

export const KIND_LABEL: Record<Kind, string> = {
  disbursement: 'Disbursement', charge: 'Charge', interest: 'Interest', repayment: 'Repayment (EMI)', prepayment: 'Prepayment',
  rate: 'Rate change', adjustment: 'Adjustment',
};
const KIND_TONE: Record<Kind, 'stone' | 'brand' | 'amber' | 'rose' | 'sky' | 'violet'> = {
  disbursement: 'violet', charge: 'amber', interest: 'rose', repayment: 'brand', prepayment: 'brand', rate: 'sky', adjustment: 'stone',
};
const KINDS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ label: KIND_LABEL[k], value: k }));
/** + adds to the amount owed, − reduces it (as the server works it out). */
const signed = (e: { kind: Kind; amount: number }) => (e.kind === 'rate' ? 0 : e.kind === 'adjustment' ? e.amount : ['repayment', 'prepayment'].includes(e.kind) ? -Math.abs(e.amount) : Math.abs(e.amount));
const fullDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Inputs for one statement line (new rows and the edit dialog share them). */
function LineFields({ d, onChange, currency }: { d: Omit<Draft, 'key'>; onChange: (p: Partial<Draft>) => void; currency: string }) {
  return (
    <>
      <Field label="Date"><DateInput value={d.date} onChange={(v) => onChange({ date: v })} required /></Field>
      <Field label="Type"><Select value={d.kind} options={KINDS} onChange={(v) => onChange({ kind: (v || 'repayment') as Kind })} /></Field>
      {d.kind === 'rate'
        ? <Field label="New rate (%)"><NumberInput value={d.rate} onChange={(v) => onChange({ rate: v })} min={0.01} max={100} decimals={3} required /></Field>
        : <Field label={`Amount (${currency})`} hint={d.kind === 'adjustment' ? '+ owes more, − owes less' : undefined}><NumberInput value={d.amount} onChange={(v) => onChange({ amount: v })} min={d.kind === 'adjustment' ? -100_000_000 : 0.01} required /></Field>}
      <Field label="Statement balance" hint="Optional, to check"><NumberInput value={d.statementBalance} onChange={(v) => onChange({ statementBalance: v })} /></Field>
      <Field label="Details"><TextInput value={d.details} onChange={(v) => onChange({ details: v })} maxLength={200} placeholder="e.g. Loan repayment, part period interest" /></Field>
    </>
  );
}

function EditEntry({ accountId, entry, currency, onClose, onSaved }: { accountId: string; entry: Entry; currency: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ date: entry.date, kind: entry.kind, amount: entry.amount || null, rate: entry.rate, statementBalance: entry.statementBalance, details: entry.details, notes: entry.notes });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/loans/${accountId}/entries/${entry.id}`, { ...d, amount: d.amount ?? 0 });
      toast.success('Row updated');
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3"><LineFields d={d} onChange={(p) => setD({ ...d, ...p })} currency={currency} /></div>
      <Field label="Notes"><TextInput value={d.notes} onChange={(v) => setD({ ...d, notes: v })} maxLength={300} /></Field>
      <ErrorNote message={error} />
      <FormFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
      </FormFooter>
    </form>
  );
}

/**
 * A loan's statement: summary cards, every line with the running balance (checked against the
 * statement's own balance), and rows you add each month (as many as needed, saved together).
 */
export function LoanLedger({ account, onChanged }: { account: WealthAccount; onChanged: () => void }) {
  const toast = useToast();
  const cur = account.currency;
  const { data, error, loading, reload } = useApi<{ entries: Entry[]; summary: Summary }>(`/loans/${account.id}`);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [seq, setSeq] = useState(1);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const paging = usePaging([account.id]);
  const s = data?.summary;
  const rows = [...(data?.entries ?? [])].reverse(); // newest first
  const m = (v: number) => moneyIn(v, cur);
  const done = () => { reload(); onChanged(); };

  const addDraft = () => {
    const last = drafts[drafts.length - 1];
    setDrafts([...drafts, { key: seq, date: last?.date ?? todayStr(), kind: last?.kind ?? 'repayment', amount: last?.amount ?? s?.lastPayment ?? null, rate: null, statementBalance: null, details: '', notes: '' }]);
    setSeq(seq + 1);
  };
  const upd = (key: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((x) => (x.key === key ? { ...x, ...p } : x)));
  async function saveDrafts(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await api.post(`/loans/${account.id}/entries`, { entries: drafts.map(({ key: _k, ...d }) => ({ ...d, amount: d.amount ?? 0 })) });
      toast.success(`${drafts.length} row${drafts.length > 1 ? 's' : ''} saved`);
      setDrafts([]);
      done();
    } catch (err) { setSaveError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      {s && (
        <StatRail items={[
          { label: 'Outstanding', value: s.outstanding, currency: cur, tone: 'text-rose-700', icon: <Landmark className="size-3.5" />, sub: s.lastDate ? `as of ${fullDate(s.lastDate)}` : 'No rows yet' },
          { label: 'Borrowed', value: s.borrowed, currency: cur, icon: <Wallet className="size-3.5" />, sub: s.firstDate ? `since ${fullDate(s.firstDate)}${s.charges ? ` · charges ${m(s.charges)}` : ''}` : '—' },
          { label: 'Interest paid', value: s.interest, currency: cur, tone: 'text-amber-700', icon: <Percent className="size-3.5" />, sub: `last 12 months ${m(s.interestLastYear)}${s.rate ? ` · now ${s.rate}%` : ''}` },
          { label: 'Repaid', value: s.repaid, currency: cur, tone: 'text-emerald-700', icon: <TrendingDown className="size-3.5" />, sub: `principal ${m(s.principalRepaid)}${s.prepaid ? ` · prepaid ${m(s.prepaid)}` : ''}${s.lastPayment ? ` · last EMI ${m(s.lastPayment)}` : ''}` },
        ]} />
      )}
      {s && s.mismatches > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {s.mismatches} row{s.mismatches > 1 ? 's' : ''} where the running balance differs from the statement’s balance. A line is probably missing there: add it, or an adjustment.
        </div>
      )}

      <TableCard>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Receipt className="size-4 text-brand-600" />{account.name} · statement</h2>
          <Button size="sm" variant="primary" onClick={addDraft} icon={<Plus className="size-3.5" />}>Add row</Button>
        </div>

        {drafts.length > 0 && (
          <form onSubmit={saveDrafts} className="mx-4 mb-3 space-y-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
            <div className="text-xs font-medium text-stone-700">New rows</div>
            {drafts.map((d) => (
              <div key={d.key} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-white p-2 sm:grid-cols-3 lg:grid-cols-[9rem_10rem_9rem_9rem_1fr_2rem]">
                <LineFields d={d} onChange={(p) => upd(d.key, p)} currency={cur} />
                <IconButton title="Remove this row" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}><X className="size-3.5" /></IconButton>
              </div>
            ))}
            <ErrorNote message={saveError} />
            <div className="flex justify-between gap-2">
              <Button size="sm" onClick={addDraft} icon={<Plus className="size-3.5" />}>Another row</Button>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setDrafts([])}>Cancel</Button>
                <Button size="sm" type="submit" variant="primary" loading={busy}>Save {drafts.length} row{drafts.length > 1 ? 's' : ''}</Button>
              </div>
            </div>
          </form>
        )}

        <DataTable
          value={rows} dataKey="id" size="small" {...paging} tableStyle={{ minWidth: '56rem' }}
          emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">{loading ? 'Loading…' : 'No statement rows yet. Add the disbursement, interest and repayments from your loan statement.'}</p>}
        >
          <Column header="Date" body={(e: Entry) => <span className="num text-stone-600">{fullDate(e.date)}</span>} style={{ width: '7.5rem' }} />
          <Column header="Type" body={(e: Entry) => <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>} />
          <Column header="Details" body={(e: Entry) => (
            <div className="max-w-xs">
              <div className="truncate text-xs text-stone-700" title={e.details}>{e.details || '—'}</div>
              {e.notes && <div className="truncate text-[11px] text-stone-400">{e.notes}</div>}
            </div>
          )} />
          <Column header="Added (+)" align="right" body={(e: Entry) => signed(e) > 0 ? <span className="num text-rose-700">+{m(signed(e))}</span> : <span className="text-stone-300">—</span>} />
          <Column header="Paid (−)" align="right" body={(e: Entry) => signed(e) < 0 ? <span className="num text-emerald-700">−{m(-signed(e))}</span> : e.kind === 'rate' ? <span className="text-xs text-sky-700">{e.rate}%</span> : <span className="text-stone-300">—</span>} />
          <Column header="Outstanding" align="right" body={(e: Entry) => (
            <div className="whitespace-nowrap">
              <span className="num font-semibold">{m(e.balance)}</span>
              {e.matches === true && <CheckCircle2 className="ml-1 inline size-3 text-emerald-600" aria-label="Matches the statement" />}
              {e.matches === false && <span className="ml-1 text-[11px] text-amber-700" title={`Statement says ${m(e.statementBalance ?? 0)}`}>≠ {m(e.statementBalance ?? 0)}</span>}
            </div>
          )} />
          <Column header="Rate" align="right" body={(e: Entry) => <span className="num text-xs text-stone-500">{e.rate ? `${e.rate}%` : '—'}</span>} />
          <Column align="right" style={{ width: '5.5rem' }} body={(e: Entry) => (
            <div className="whitespace-nowrap">
              <IconButton title="Edit" onClick={() => setEditing(e)}><Pencil className="size-3.5" /></IconButton>
              <IconButton title="Remove" danger onClick={() => confirmAction({
                header: 'Remove this row?', message: `${KIND_LABEL[e.kind]} on ${fullDate(e.date)} is removed from the statement.`, acceptLabel: 'Remove',
                onAccept: () => api.post(`/loans/${account.id}/entries/${e.id}/archive`).then(() => { toast.success('Row removed'); done(); }, (err) => toast.error(errorText(err))),
              })}><Archive className="size-3.5" /></IconButton>
            </div>
          )} />
        </DataTable>
      </TableCard>
      <p className={cx('text-[11px] text-stone-500')}>
        Interest, charges and disbursements add to what you owe; EMIs and prepayments reduce it. The loan’s monthly balance in Loans & cards and Wealth follows this statement.
      </p>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit row">
        {editing && <EditEntry accountId={account.id} entry={editing} currency={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done(); }} />}
      </Modal>
    </div>
  );
}
