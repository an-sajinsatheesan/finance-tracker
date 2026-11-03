import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BarChart3, Calculator, Check, CheckCircle2, Eye, Landmark, Percent, Plus, Receipt, Settings2, Table2, Trash2, TrendingDown, Wallet, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { WealthAccount } from '../lib/types';
import { compact, dateInMonth, monthLabel, monthShort, moneyIn, thisMonth } from '../lib/format';
import { emiFor, monthInterest, schedule } from '../lib/loanMath';
import { C } from '../lib/chartColors';
import { Badge, Button, ErrorNote, Field, IconButton, Modal, NumberInput, StatRail, TableCard, Tabs, confirmAction, cx, useToast } from '../components/ui';

type Kind = 'disbursement' | 'charge' | 'interest' | 'repayment' | 'prepayment' | 'rate' | 'adjustment';
interface Entry {
  id: string; date: string; kind: Kind; details: string; ref: string; amount: number; rate: number | null;
  statementBalance: number | null; notes: string; balance: number; matches: boolean | null;
}
interface Summary {
  outstanding: number; borrowed: number; charges: number; interest: number; interestLastYear: number; repaid: number; prepaid: number;
  principalRepaid: number; rate: number | null; lastPayment: number | null; lastDate: string | null; firstDate: string | null; mismatches: number;
}
/** One month of the statement (or the new month being entered, `draft`). */
interface MonthRow {
  month: string; lines: Entry[]; interest: number; emi: number; prepaid: number; disbursed: number; charges: number; adjusted: number;
  principal: number; outstanding: number; rate: number | null; rateChanged: boolean; check: boolean | null; draft?: boolean;
}

const KIND_LABEL: Record<Kind, string> = {
  disbursement: 'Disbursement', charge: 'Charge', interest: 'Interest', repayment: 'EMI', prepayment: 'Prepayment', rate: 'Rate change', adjustment: 'Adjustment',
};
const nextMonthOf = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const fullDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

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

/** EMI calculator: time and interest left at an EMI and rate, a prepayment what-if, and the schedule. */
function EmiCalculator({ s, startMonth, currency }: { s: Summary; startMonth: string; currency: string }) {
  const [p, setP] = useState<number | null>(s.outstanding);
  const [rate, setRate] = useState<number | null>(s.rate ?? 8.5);
  const [emi, setEmi] = useState<number | null>(s.lastPayment ?? null);
  const [extra, setExtra] = useState<number | null>(null);
  const [tenure, setTenure] = useState<number | null>(null);
  const m = (v: number) => moneyIn(v, currency);
  const base = useMemo(() => (p && rate && emi ? schedule(p, rate, emi, startMonth) : []), [p, rate, emi, startMonth]);
  const withPre = useMemo(() => (p && rate && emi && extra ? schedule(Math.max(0, p - extra), rate, emi, startMonth) : []), [p, rate, emi, extra, startMonth]);
  const interestOf = (rows: typeof base) => rows.reduce((a, r) => a + r.interest, 0);
  const tooLow = !!(p && rate && emi && base.length === 0);
  const years = (n: number) => `${Math.floor(n / 12)}y ${n % 12}m`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Outstanding (${currency})`}><NumberInput value={p} onChange={setP} min={0} /></Field>
        <Field label="Rate (%)"><NumberInput value={rate} onChange={setRate} min={0} max={40} decimals={3} /></Field>
        <Field label={`EMI (${currency})`}><NumberInput value={emi} onChange={setEmi} min={0} /></Field>
        <Field label="One-time prepayment"><NumberInput value={extra} onChange={setExtra} min={0} /></Field>
      </div>
      {tooLow && <ErrorNote message="This EMI doesn’t cover the monthly interest, so the loan never closes." />}
      {base.length > 0 && (
        <StatRail className="mb-0" items={[
          { label: 'Months left', value: base.length, text: `${base.length} months`, icon: <Landmark className="size-3.5" />, sub: `${years(base.length)} · clears ${monthLabel(base[base.length - 1].month, 'short')}` },
          { label: 'Interest still to pay', value: interestOf(base), currency, tone: 'text-amber-700', icon: <Percent className="size-3.5" />, sub: `total to pay ${m(interestOf(base) + (p ?? 0))}` },
          ...(withPre.length ? [
            { label: 'With the prepayment', value: base.length - withPre.length, text: `${base.length - withPre.length} months sooner`, tone: 'text-emerald-700', icon: <TrendingDown className="size-3.5" />, sub: `clears ${monthLabel(withPre[withPre.length - 1].month, 'short')}` },
            { label: 'Interest saved', value: interestOf(base) - interestOf(withPre), currency, tone: 'text-emerald-700', icon: <Wallet className="size-3.5" />, sub: `by prepaying ${m(extra ?? 0)}` },
          ] : []),
        ]} />
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600">
        <span className="mb-2">EMI to clear it in</span>
        <span className="w-24"><NumberInput value={tenure} onChange={setTenure} min={1} max={600} decimals={0} ariaLabel="Months" /></span>
        <span className="mb-2">months:</span>
        <b className="num mb-2 text-sm text-stone-900">{p && rate && tenure ? m(emiFor(p, rate, tenure)) : '—'}</b>
        {p && rate && tenure && emi ? <button type="button" className="mb-2 text-brand-700 underline" onClick={() => setEmi(emiFor(p, rate, tenure))}>use this EMI</button> : null}
      </div>
      {base.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <DataTable value={withPre.length ? withPre : base} dataKey="n" size="small" scrollable scrollHeight="45vh" virtualScrollerOptions={{ itemSize: 36 }}>
            <Column header="#" body={(r) => <span className="text-stone-400">{r.n}</span>} style={{ width: '3rem' }} />
            <Column header="Month" body={(r) => monthLabel(r.month, 'short')} />
            <Column header="EMI" align="right" body={(r) => <span className="num">{m(r.emi)}</span>} />
            <Column header="Interest" align="right" body={(r) => <span className="num text-amber-700">{m(r.interest)}</span>} />
            <Column header="Principal" align="right" body={(r) => <span className="num text-emerald-700">{m(r.principal)}</span>} />
            <Column header="Outstanding" align="right" body={(r) => <span className="num font-medium">{m(r.outstanding)}</span>} />
          </DataTable>
        </div>
      )}
      <p className="text-[11px] text-stone-400">An estimate with monthly interest at rate ÷ 12; the bank charges daily, so its figures differ slightly. {withPre.length ? 'Schedule shown with the prepayment.' : ''}</p>
    </div>
  );
}

/**
 * A loan's statement, one row per month: interest charged, EMI paid, the principal that went
 * down and the outstanding after it. A new month is a row in the table: enter the EMI and the
 * rate, the interest and the rest are worked out. Saved months are kept as the bank shows them.
 */
export function LoanLedger({ account, onChanged, onEdit }: { account: WealthAccount; onChanged: () => void; onEdit?: () => void }) {
  const toast = useToast();
  const { memberName } = useAuth();
  const cur = account.currency;
  const { data, error, loading, reload } = useApi<{ entries: Entry[]; summary: Summary }>(`/loans/${account.id}`);
  const [view, setView] = useState<'table' | 'graph'>('table');
  const [calc, setCalc] = useState(false);
  const [open, setOpen] = useState<MonthRow | null>(null);
  const [draft, setDraft] = useState<{ month: string; emiDay: number; emi: number | null; rate: number | null; interest: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const s = data?.summary;
  const months = useMemo(() => byMonth(data?.entries ?? []), [data]);
  const latest = months[0];
  const m = (v: number) => moneyIn(v, cur);
  const done = () => { reload(); onChanged(); };

  // The new month, worked out live from the last month's outstanding.
  const prevOut = latest?.outstanding ?? 0;
  const autoInterest = draft && draft.rate ? monthInterest(prevOut, draft.rate, draft.month, draft.emiDay, draft.emi ?? 0) : 0;
  const draftRow: MonthRow | null = draft && {
    month: draft.month, lines: [], interest: draft.interest ?? autoInterest, emi: draft.emi ?? 0, prepaid: 0, disbursed: 0, charges: 0, adjusted: 0,
    principal: (draft.emi ?? 0) - (draft.interest ?? autoInterest), outstanding: prevOut - (draft.emi ?? 0) + (draft.interest ?? autoInterest),
    rate: draft.rate, rateChanged: !!draft.rate && draft.rate !== s?.rate, check: null, draft: true,
  };

  const startDraft = () => {
    const month = latest ? nextMonthOf(latest.month) : thisMonth();
    const emiDay = Number(latest?.lines.find((l) => l.kind === 'repayment')?.date.slice(8, 10) ?? 7);
    setDraft({ month, emiDay, emi: s?.lastPayment ?? null, rate: s?.rate ?? null, interest: null });
    setView('table');
  };

  async function saveDraft() {
    if (!draft || !draftRow) return;
    if (!draft.emi && !draftRow.interest) { toast.error('Enter the EMI paid'); return; }
    const entries: Record<string, unknown>[] = [];
    if (draft.rate && s?.rate && draft.rate !== s.rate) entries.push({ date: `${draft.month}-01`, kind: 'rate', rate: draft.rate, details: `Rate changed ${s.rate}% to ${draft.rate}%`, notes: '' });
    if (draft.emi) entries.push({ date: dateInMonth(draft.month, draft.emiDay), kind: 'repayment', amount: draft.emi, details: 'EMI', notes: '' });
    if (draftRow.interest) entries.push({ date: dateInMonth(draft.month, 31), kind: 'interest', amount: draftRow.interest, details: draft.interest == null ? 'Interest (worked out)' : 'Interest', notes: '' });
    setBusy(true);
    try {
      await api.post(`/loans/${account.id}/entries`, { entries });
      toast.success(`${monthLabel(draft.month)} added`);
      setDraft(null);
      done();
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  }

  const removeLatest = (r: MonthRow) => confirmAction({
    header: `Remove ${monthLabel(r.month)}?`, message: 'Its lines are removed so the month can be entered again.', acceptLabel: 'Remove month',
    onAccept: async () => {
      try {
        for (const l of r.lines) await api.post(`/loans/${account.id}/entries/${l.id}/archive`);
        toast.success(`${monthLabel(r.month)} removed`);
        setOpen(null);
        done();
      } catch (err) { toast.error(errorText(err)); }
    },
  });

  const other = (r: MonthRow) => [
    r.disbursed && <span key="d" className="text-violet-700">+{m(r.disbursed)} disbursed</span>,
    r.prepaid && <span key="p" className="text-emerald-700">−{m(r.prepaid)} prepaid</span>,
    r.charges && <span key="c" className="text-amber-700">+{m(r.charges)} charges</span>,
    r.adjusted && <span key="a" className="text-stone-500">{r.adjusted > 0 ? '+' : '−'}{m(Math.abs(r.adjusted))} adjusted</span>,
    r.rateChanged && <span key="r" className="text-sky-700">rate → {r.rate}%</span>,
  ].filter(Boolean);
  const rows = draftRow ? [draftRow, ...months] : months;
  const chart = [...months].reverse().map((r) => ({ label: monthShort(r.month), month: r.month, interest: r.interest, principal: Math.max(0, r.principal), outstanding: r.outstanding }));
  const inputCls = 'w-28';

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
        <div className="flex items-center gap-2">
          <Tabs<'table' | 'graph'> value={view} onChange={setView} items={[{ value: 'table', label: 'Table' }, { value: 'graph', label: 'Graph' }]} />
          <Button size="sm" onClick={() => setCalc(true)} disabled={!s} icon={<Calculator className="size-3.5" />}>EMI calculator</Button>
          <Button size="sm" variant="primary" onClick={startDraft} disabled={!!draft} icon={<Plus className="size-3.5" />}>Add month</Button>
        </div>
      </div>
      {s && (
        <StatRail className="mb-0" items={[
          { label: 'Outstanding', value: draftRow ? draftRow.outstanding : s.outstanding, currency: cur, tone: 'text-rose-700', icon: <Landmark className="size-3.5" />, sub: draftRow ? `after ${monthLabel(draftRow.month, 'short')} (not saved)` : s.lastDate ? `as of ${fullDate(s.lastDate)}` : 'No months yet' },
          { label: 'Borrowed', value: s.borrowed, currency: cur, icon: <Wallet className="size-3.5" />, sub: s.firstDate ? `since ${fullDate(s.firstDate)}${s.charges ? ` · charges ${m(s.charges)}` : ''}` : '—' },
          { label: 'Interest paid', value: s.interest, currency: cur, tone: 'text-amber-700', icon: <Percent className="size-3.5" />, sub: `last 12 months ${m(s.interestLastYear)}` },
          { label: 'Principal repaid', value: s.principalRepaid, currency: cur, tone: 'text-emerald-700', icon: <TrendingDown className="size-3.5" />, sub: `${s.borrowed ? `${Math.round((s.principalRepaid / s.borrowed) * 100)}% of the loan · ` : ''}EMI ${m(s.lastPayment ?? 0)}` },
        ]} />
      )}
      {s && s.mismatches > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {s.mismatches} month{s.mismatches > 1 ? 's' : ''} where the running balance differs from the statement’s balance.
        </div>
      )}

      {view === 'graph' ? (
        <TableCard>
          <div className="h-80 px-2 pb-3 pt-4">
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis yAxisId="m" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} tickFormatter={compact} width={48} />
                <YAxis yAxisId="o" orientation="right" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
                <Tooltip formatter={(v: number, n: string) => [m(v), n]} labelFormatter={(_l, p) => (p?.[0] ? monthLabel(p[0].payload.month) : '')} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e6e8ef' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="m" dataKey="interest" name="Interest" stackId="p" fill="#f59e0b" maxBarSize={14} />
                <Bar yAxisId="m" dataKey="principal" name="Principal down" stackId="p" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Line yAxisId="o" dataKey="outstanding" name="Outstanding" stroke="#e11d48" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TableCard>
      ) : (
        <TableCard>
          <DataTable
            value={rows} dataKey="month" size="small" scrollable scrollHeight="60vh" virtualScrollerOptions={{ itemSize: 48 }}
            tableStyle={{ minWidth: '62rem' }} rowClassName={(r: MonthRow) => (r.draft ? '!bg-brand-50/60' : '')}
            emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">{loading ? 'Loading…' : 'No months yet. Click Add month.'}</p>}
          >
            <Column header="Month" style={{ width: '9rem' }} body={(r: MonthRow) => r.draft ? (
              <div>
                <div className="font-semibold text-brand-800">{monthLabel(r.month, 'short')}</div>
                <label className="flex items-center gap-1 text-[11px] text-stone-500">EMI on day
                  <input type="number" min={1} max={31} value={draft!.emiDay} onChange={(e) => setDraft({ ...draft!, emiDay: Number(e.target.value) || 1 })} className="w-10 rounded border border-stone-200 px-1 py-0.5 text-[11px]" />
                </label>
              </div>
            ) : <span className="font-medium">{monthLabel(r.month, 'short')}</span>} />
            <Column header="Interest (+)" align="right" body={(r: MonthRow) => r.draft ? (
              <div className={cx('ml-auto', inputCls)} title="Worked out daily from the outstanding, rate and EMI day; change it to match the statement">
                <NumberInput value={draft!.interest ?? autoInterest} onChange={(v) => setDraft({ ...draft!, interest: v })} min={0} ariaLabel="Interest" />
              </div>
            ) : r.interest ? <span className="num text-amber-700">+{m(r.interest)}</span> : <span className="text-stone-300">—</span>} />
            <Column header="EMI paid (−)" align="right" body={(r: MonthRow) => r.draft ? (
              <div className={cx('ml-auto', inputCls)}><NumberInput value={draft!.emi} onChange={(v) => setDraft({ ...draft!, emi: v, interest: null })} min={0} autoFocus ariaLabel="EMI paid" /></div>
            ) : r.emi ? <span className="num text-emerald-700">−{m(r.emi)}</span> : <span className="text-stone-300">—</span>} />
            <Column header="Principal down" align="right" headerTooltip="EMI and prepayments minus the interest charged" body={(r: MonthRow) => (
              r.emi || r.prepaid ? <span className={r.principal >= 0 ? 'num font-medium text-emerald-700' : 'num text-rose-600'}>{r.principal >= 0 ? '' : '−'}{m(Math.abs(r.principal))}</span> : <span className="text-stone-300">—</span>
            )} />
            <Column header="Other" body={(r: MonthRow) => r.draft
              ? <span className="text-[11px] text-stone-500">{r.rateChanged ? <span className="text-sky-700">rate {s?.rate}% → {r.rate}%</span> : 'Interest worked out daily'}</span>
              : <span className="flex flex-wrap gap-x-2 text-[11px]">{other(r).length ? other(r) : <span className="text-stone-300">—</span>}</span>} />
            <Column header="Outstanding" align="right" body={(r: MonthRow) => (
              <span className="whitespace-nowrap">
                <span className={cx('num font-semibold', r.draft ? 'text-brand-800' : 'text-stone-900')}>{m(r.outstanding)}</span>
                {r.check === true && <CheckCircle2 className="ml-1 inline size-3 text-emerald-600" aria-label="Matches the statement" />}
                {r.check === false && <AlertTriangle className="ml-1 inline size-3 text-amber-600" aria-label="Differs from the statement" />}
              </span>
            )} />
            <Column header="Rate" align="right" style={{ width: '6.5rem' }} body={(r: MonthRow) => r.draft ? (
              <div className="ml-auto w-20"><NumberInput value={draft!.rate} onChange={(v) => setDraft({ ...draft!, rate: v, interest: null })} min={0} max={40} decimals={3} ariaLabel="Rate %" /></div>
            ) : <span className="num text-xs text-stone-500">{r.rate ? `${r.rate}%` : '—'}</span>} />
            <Column align="right" style={{ width: '5.5rem' }} body={(r: MonthRow) => r.draft ? (
              <div className="flex justify-end gap-1">
                <IconButton title="Save this month" onClick={saveDraft}>{busy ? <span className="text-[10px]">…</span> : <Check className="size-4 text-emerald-600" />}</IconButton>
                <IconButton title="Cancel" onClick={() => setDraft(null)}><X className="size-4" /></IconButton>
              </div>
            ) : <IconButton title="See this month’s lines" onClick={() => setOpen(r)}><Eye className="size-3.5" /></IconButton>} />
          </DataTable>
        </TableCard>
      )}
      <p className="text-[11px] text-stone-500">
        Interest adds to what you owe; the EMI and prepayments reduce it. For a new month, enter the EMI and the rate: the interest is worked out day by day like the bank does (change it if your statement differs), and the rest follows. Saved months stay as entered.
        <span className="ml-1 inline-flex items-center gap-1"><Table2 className="size-3" /> / <BarChart3 className="size-3" /> switch between table and graph.</span>
      </p>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${account.name} · ${monthLabel(open.month)}` : ''}>
        {open && (
          <div className="space-y-2">
            {open.lines.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-stone-100 px-3 py-2 text-xs">
                <span className="w-24 text-stone-500">{fullDate(l.date)}</span>
                <Badge>{KIND_LABEL[l.kind]}</Badge>
                <span className="min-w-0 flex-1 truncate text-stone-600" title={l.details}>{l.details || '—'}</span>
                <span className="num font-medium">{l.kind === 'rate' ? `${l.rate}%` : m(l.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-stone-400">Saved months can’t be edited. Only the latest month can be removed and entered again.</p>
              {latest && open.month === latest.month && <Button size="sm" variant="danger" onClick={() => removeLatest(open)} icon={<Trash2 className="size-3.5" />}>Remove month</Button>}
            </div>
          </div>
        )}
      </Modal>
      <Modal open={calc} onClose={() => setCalc(false)} title={`EMI calculator · ${account.name}`} size="xl">
        {calc && s && <EmiCalculator s={s} startMonth={latest ? nextMonthOf(latest.month) : thisMonth()} currency={cur} />}
      </Modal>
    </div>
  );
}
