import { useMemo, useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { AlertTriangle, Archive, CheckCircle2, Landmark, Pencil, Percent, Plus, Receipt, Settings2, TrendingDown, Wallet, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { WealthAccount } from '../lib/types';
import { dateInMonth, monthLabel, moneyIn, thisMonth } from '../lib/format';
import {
  Badge, Button, DateInput, ErrorNote, Field, IconButton, Modal, MonthInput, NumberInput, Select, StatRail, TableCard, TextInput, confirmAction, useToast,
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
/** One month of the statement: interest charged and EMI paid side by side. */
interface MonthRow {
  month: string; lines: Entry[]; interest: number; emi: number; prepaid: number; disbursed: number; charges: number; adjusted: number;
  principal: number; outstanding: number; rate: number | null; rateChanged: boolean; check: boolean | null;
}
type Draft = { key: number; month: string; emiDate: string; emi: number | null; interest: number | null; prepaid: number | null; statementBalance: number | null; notes: string };

const KIND_LABEL: Record<Kind, string> = {
  disbursement: 'Disbursement', charge: 'Charge', interest: 'Interest', repayment: 'EMI', prepayment: 'Prepayment', rate: 'Rate change', adjustment: 'Adjustment',
};
const KINDS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ label: KIND_LABEL[k], value: k }));
const lastDay = (month: string) => dateInMonth(month, 31);

/** Groups statement lines by month; the outstanding is the balance after the month's last line. */
function byMonth(entries: Entry[]): MonthRow[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) map.set(e.date.slice(0, 7), [...(map.get(e.date.slice(0, 7)) ?? []), e]);
  return [...map.entries()].map(([month, lines]) => {
    const sum = (k: Kind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + Math.abs(l.amount), 0);
    const interest = sum('interest'); const emi = sum('repayment'); const prepaid = sum('prepayment');
    const last = lines[lines.length - 1];
    const checks = lines.map((l) => l.matches).filter((x) => x !== null);
    return {
      month, lines, interest, emi, prepaid, disbursed: sum('disbursement'), charges: sum('charge'),
      adjusted: lines.filter((l) => l.kind === 'adjustment').reduce((s, l) => s + l.amount, 0),
      principal: emi + prepaid - interest, outstanding: last.balance, rate: last.rate, rateChanged: lines.some((l) => l.kind === 'rate'),
      check: checks.length ? checks.every(Boolean) : null,
    };
  }).reverse(); // newest month first
}

/** Edit or remove one statement line (from a month's detail dialog). */
function EditLine({ accountId, entry, currency, onClose, onSaved }: { accountId: string; entry: Entry; currency: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ date: entry.date, kind: entry.kind, amount: entry.amount || null, rate: entry.rate, statementBalance: entry.statementBalance, details: entry.details, notes: entry.notes });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/loans/${accountId}/entries/${entry.id}`, { ...d, amount: d.amount ?? 0 });
      toast.success('Line updated');
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><DateInput value={d.date} onChange={(v) => setD({ ...d, date: v })} required /></Field>
        <Field label="Type"><Select value={d.kind} options={KINDS} onChange={(v) => setD({ ...d, kind: (v || 'repayment') as Kind })} /></Field>
        {d.kind === 'rate'
          ? <Field label="New rate (%)"><NumberInput value={d.rate} onChange={(v) => setD({ ...d, rate: v })} min={0.01} max={100} decimals={3} required /></Field>
          : <Field label={`Amount (${currency})`} hint={d.kind === 'adjustment' ? '+ owes more, − owes less' : undefined}><NumberInput value={d.amount} onChange={(v) => setD({ ...d, amount: v })} min={d.kind === 'adjustment' ? -100_000_000 : 0.01} required /></Field>}
        <Field label="Statement balance" hint="Optional, to check"><NumberInput value={d.statementBalance} onChange={(v) => setD({ ...d, statementBalance: v })} /></Field>
      </div>
      <Field label="Details"><TextInput value={d.details} onChange={(v) => setD({ ...d, details: v })} maxLength={200} /></Field>
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
 * A loan's statement, one row per month: interest charged and EMI paid side by side, the
 * principal that went down, other movements, and the outstanding after the month. New months
 * are added as rows (several at once); a month's single lines open from its edit button.
 */
export function LoanLedger({ account, onChanged, onEdit }: { account: WealthAccount; onChanged: () => void; onEdit?: () => void }) {
  const toast = useToast();
  const { memberName } = useAuth();
  const cur = account.currency;
  const { data, error, loading, reload } = useApi<{ entries: Entry[]; summary: Summary }>(`/loans/${account.id}`);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [seq, setSeq] = useState(1);
  const [open, setOpen] = useState<MonthRow | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const s = data?.summary;
  const months = useMemo(() => byMonth(data?.entries ?? []), [data]);
  const m = (v: number) => moneyIn(v, cur);
  const done = () => { reload(); onChanged(); };
  const fullDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

  const nextMonth = (after?: string) => {
    const base = after ?? months[0]?.month ?? thisMonth();
    const [y, mo] = base.split('-').map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  };
  const addDraft = () => {
    const last = drafts[drafts.length - 1];
    const month = nextMonth(last?.month);
    const emiDay = months[0]?.lines.find((l) => l.kind === 'repayment')?.date.slice(8, 10) ?? '07';
    setDrafts([...drafts, {
      key: seq, month, emiDate: dateInMonth(month, Number(emiDay)), emi: last?.emi ?? s?.lastPayment ?? null,
      interest: last?.interest ?? months[0]?.interest ?? null, prepaid: null, statementBalance: null, notes: '',
    }]);
    setSeq(seq + 1);
  };
  const upd = (key: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function saveDrafts(e: FormEvent) {
    e.preventDefault();
    // Each month row becomes its lines: EMI (and prepayment) on the EMI date, interest at month end.
    const entries = drafts.flatMap((d) => {
      const lines: Record<string, unknown>[] = [];
      if (d.emi) lines.push({ date: d.emiDate, kind: 'repayment', amount: d.emi, details: 'EMI', notes: d.notes });
      if (d.prepaid) lines.push({ date: d.emiDate, kind: 'prepayment', amount: d.prepaid, details: 'Prepayment', notes: '' });
      if (d.interest) lines.push({ date: lastDay(d.month), kind: 'interest', amount: d.interest, details: 'Interest', notes: '' });
      if (lines.length && d.statementBalance != null) {
        const latest = lines.reduce((a, b) => (String(b.date) >= String(a.date) ? b : a));
        latest.statementBalance = d.statementBalance;
      }
      return lines;
    });
    if (!entries.length) { setSaveError('Enter the EMI or interest for at least one month'); return; }
    setBusy(true);
    setSaveError(null);
    try {
      await api.post(`/loans/${account.id}/entries`, { entries });
      toast.success(`${drafts.length} month${drafts.length > 1 ? 's' : ''} saved`);
      setDrafts([]);
      done();
    } catch (err) { setSaveError(errorText(err)); } finally { setBusy(false); }
  }

  const other = (r: MonthRow) => [
    r.disbursed && <span key="d" className="text-violet-700">+{m(r.disbursed)} disbursed</span>,
    r.prepaid && <span key="p" className="text-emerald-700">−{m(r.prepaid)} prepaid</span>,
    r.charges && <span key="c" className="text-amber-700">+{m(r.charges)} charges</span>,
    r.adjusted && <span key="a" className="text-stone-500">{r.adjusted > 0 ? '+' : '−'}{m(Math.abs(r.adjusted))} adjusted</span>,
    r.rateChanged && <span key="r" className="text-sky-700">rate → {r.rate}%</span>,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Receipt className="size-4 text-brand-600" />{account.name}
          <Badge>{account.type === 'common' ? 'Common' : memberName(account.ownerId)}</Badge>
          {s?.rate != null && <span className="text-xs font-normal text-stone-500">· {s.rate}% now</span>}
          {onEdit && <IconButton title="Edit the loan account" onClick={onEdit}><Settings2 className="size-3.5" /></IconButton>}
        </div>
        <Button size="sm" variant="primary" onClick={addDraft} icon={<Plus className="size-3.5" />}>Add month</Button>
      </div>
      {s && (
        <StatRail className="mb-0" items={[
          { label: 'Outstanding', value: s.outstanding, currency: cur, tone: 'text-rose-700', icon: <Landmark className="size-3.5" />, sub: s.lastDate ? `as of ${fullDate(s.lastDate)}` : 'No months yet' },
          { label: 'Borrowed', value: s.borrowed, currency: cur, icon: <Wallet className="size-3.5" />, sub: s.firstDate ? `since ${fullDate(s.firstDate)}${s.charges ? ` · charges ${m(s.charges)}` : ''}` : '—' },
          { label: 'Interest paid', value: s.interest, currency: cur, tone: 'text-amber-700', icon: <Percent className="size-3.5" />, sub: `last 12 months ${m(s.interestLastYear)}` },
          { label: 'Principal repaid', value: s.principalRepaid, currency: cur, tone: 'text-emerald-700', icon: <TrendingDown className="size-3.5" />, sub: `paid ${m(s.repaid)}${s.prepaid ? ` · prepaid ${m(s.prepaid)}` : ''}${s.lastPayment ? ` · EMI ${m(s.lastPayment)}` : ''}` },
        ]} />
      )}
      {s && s.mismatches > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {s.mismatches} month{s.mismatches > 1 ? 's' : ''} where the running balance differs from the statement’s balance: open the month to check its lines.
        </div>
      )}

      {drafts.length > 0 && (
        <form onSubmit={saveDrafts} className="card space-y-2 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-stone-700">
            New months
            <button type="button" className="text-[11px] font-normal text-brand-700 underline" onClick={() => setExtra((x) => !x)}>{extra ? 'Hide' : 'Show'} prepayment and statement balance</button>
          </div>
          {drafts.map((d) => (
            <div key={d.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-stone-100 bg-stone-50/60 p-2 sm:grid-cols-4 lg:grid-cols-[8rem_9rem_9rem_9rem_auto]">
              <Field label="Month"><MonthInput value={d.month} onChange={(v) => upd(d.key, { month: v, emiDate: dateInMonth(v, Number(d.emiDate.slice(8, 10)) || 7) })} /></Field>
              <Field label="EMI paid on"><DateInput value={d.emiDate} onChange={(v) => upd(d.key, { emiDate: v })} required /></Field>
              <Field label={`EMI (${cur})`}><NumberInput value={d.emi} onChange={(v) => upd(d.key, { emi: v })} min={0} /></Field>
              <Field label={`Interest (${cur})`}><NumberInput value={d.interest} onChange={(v) => upd(d.key, { interest: v })} min={0} /></Field>
              <div className="flex items-end gap-2">
                {extra && <Field label="Prepayment"><NumberInput value={d.prepaid} onChange={(v) => upd(d.key, { prepaid: v })} min={0} /></Field>}
                {extra && <Field label="Statement balance"><NumberInput value={d.statementBalance} onChange={(v) => upd(d.key, { statementBalance: v })} /></Field>}
                <IconButton title="Remove this month" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}><X className="size-3.5" /></IconButton>
              </div>
            </div>
          ))}
          <ErrorNote message={saveError} />
          <div className="flex justify-between gap-2">
            <Button size="sm" onClick={addDraft} icon={<Plus className="size-3.5" />}>Another month</Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDrafts([])}>Cancel</Button>
              <Button size="sm" type="submit" variant="primary" loading={busy}>Save {drafts.length} month{drafts.length > 1 ? 's' : ''}</Button>
            </div>
          </div>
        </form>
      )}

      <TableCard>
        <DataTable
          value={months} dataKey="month" size="small" scrollable scrollHeight="60vh" virtualScrollerOptions={{ itemSize: 46 }}
          tableStyle={{ minWidth: '60rem' }}
          emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">{loading ? 'Loading…' : 'No months yet. Add each month’s EMI and interest from your loan statement.'}</p>}
        >
          <Column header="Month" body={(r: MonthRow) => <span className="font-medium">{monthLabel(r.month, 'short')}</span>} style={{ width: '7rem' }} />
          <Column header="Interest (+)" align="right" body={(r: MonthRow) => r.interest ? <span className="num text-amber-700">+{m(r.interest)}</span> : <span className="text-stone-300">—</span>} />
          <Column header="EMI paid (−)" align="right" body={(r: MonthRow) => r.emi ? <span className="num text-emerald-700">−{m(r.emi)}</span> : <span className="text-stone-300">—</span>} />
          <Column header="Principal down" align="right" headerTooltip="EMI and prepayments minus the interest charged" body={(r: MonthRow) => (
            r.emi || r.prepaid ? <span className={r.principal >= 0 ? 'num font-medium text-emerald-700' : 'num text-rose-600'}>{r.principal >= 0 ? '' : '−'}{m(Math.abs(r.principal))}</span> : <span className="text-stone-300">—</span>
          )} />
          <Column header="Other" body={(r: MonthRow) => <span className="flex flex-wrap gap-x-2 text-[11px]">{other(r).length ? other(r) : <span className="text-stone-300">—</span>}</span>} />
          <Column header="Outstanding" align="right" body={(r: MonthRow) => (
            <span className="whitespace-nowrap">
              <span className="num font-semibold text-stone-900">{m(r.outstanding)}</span>
              {r.check === true && <CheckCircle2 className="ml-1 inline size-3 text-emerald-600" aria-label="Matches the statement" />}
              {r.check === false && <AlertTriangle className="ml-1 inline size-3 text-amber-600" aria-label="Differs from the statement" />}
            </span>
          )} />
          <Column header="Rate" align="right" body={(r: MonthRow) => <span className="num text-xs text-stone-500">{r.rate ? `${r.rate}%` : '—'}</span>} style={{ width: '5rem' }} />
          <Column align="right" style={{ width: '3.5rem' }} body={(r: MonthRow) => <IconButton title="Lines of this month" onClick={() => setOpen(r)}><Pencil className="size-3.5" /></IconButton>} />
        </DataTable>
      </TableCard>
      <p className="text-[11px] text-stone-500">Interest adds to what you owe; the EMI and prepayments reduce it. “Principal down” is what the month’s payments took off after the interest. The loan’s monthly balance in Wealth and Balances follows this statement.</p>

      <Modal open={!!open && !editing} onClose={() => setOpen(null)} title={open ? `${account.name} · ${monthLabel(open.month)}` : ''}>
        {open && (
          <div className="space-y-2">
            {(data?.entries ?? []).filter((l) => l.date.startsWith(open.month)).map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-stone-100 px-3 py-2 text-xs">
                <span className="w-20 text-stone-500">{fullDate(l.date)}</span>
                <Badge>{KIND_LABEL[l.kind]}</Badge>
                <span className="min-w-0 flex-1 truncate text-stone-600" title={l.details}>{l.details || '—'}</span>
                <span className="num font-medium">{l.kind === 'rate' ? `${l.rate}%` : m(l.amount)}</span>
                <IconButton title="Edit" onClick={() => setEditing(l)}><Pencil className="size-3.5" /></IconButton>
                <IconButton title="Remove" danger onClick={() => confirmAction({
                  header: 'Remove this line?', message: `${KIND_LABEL[l.kind]} on ${fullDate(l.date)} is removed from the statement.`, acceptLabel: 'Remove',
                  onAccept: () => api.post(`/loans/${account.id}/entries/${l.id}/archive`).then(() => { toast.success('Line removed'); setOpen(null); done(); }, (err) => toast.error(errorText(err))),
                })}><Archive className="size-3.5" /></IconButton>
              </div>
            ))}
            <p className="text-[11px] text-stone-400">Statement lines are dated: EMI and prepayments on the day paid, interest at month end.</p>
          </div>
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit line">
        {editing && <EditLine accountId={account.id} entry={editing} currency={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setOpen(null); done(); }} />}
      </Modal>
    </div>
  );
}
