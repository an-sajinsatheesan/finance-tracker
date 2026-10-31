import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CreditCard, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { AccountGroup, Wealth } from '../lib/types';
import { addMonths, compact, monthLabel, monthShort, moneyIn } from '../lib/format';
import { C } from '../lib/chartColors';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { BlockSkeleton, Button, Empty, ErrorNote, NumberInput, Page, PageHeader, StatSkeleton, Tabs, cx, useToast } from '../components/ui';
import { GROUP_LABEL } from './Accounts';

const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid #e6e8ef', boxShadow: '0 4px 12px rgba(0,0,0,.06)' };
const axisProps = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;
const GROUP_ORDER: AccountGroup[] = ['cash', 'deposit', 'investment', 'liability'];

function Change({ value, currency }: { value: number; currency: string }) {
  if (Math.abs(value) < 0.005) return <span className="text-[11px] text-stone-500">no change vs last month</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cx('inline-flex items-center gap-1 text-[11px]', up ? 'text-brand-700' : 'text-rose-700')}>
      <Icon className="size-3" /> <span className="num">{up ? '+' : '−'}{moneyIn(Math.abs(value), currency)}</span> vs last month
    </span>
  );
}

function NetTile({ title, currency, net, previous, change, sub }: { title: string; currency: string; net: number; previous: number; change: number; sub?: React.ReactNode }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs font-medium text-stone-500">{title}</div>
      <div className={cx('num mt-1 text-xl font-semibold tracking-tight', net < 0 && 'text-rose-700')}>
        <span className="mr-1 text-xs font-medium text-stone-400">{currency}</span>{moneyIn(net, currency)}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500">
        <span>Previous <span className="num">{moneyIn(previous, currency)}</span></span>
        <Change value={change} currency={currency} />
      </div>
      {sub && <div className="mt-1 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

/** "1 AED = x INR" editor; the rate converts every currency into the base for the combined figure. */
function RateEditor({ base, currencies, fx, onSaved }: { base: string; currencies: string[]; fx: Record<string, number>; onSaved: () => void }) {
  const { refreshWorkspace } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(currencies.map((c) => [c, fx[c] ?? null])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = currencies.some((c) => (values[c] ?? null) !== (fx[c] ?? null));
  async function save() {
    setBusy(true); setError(null);
    try {
      const rates = Object.fromEntries(Object.entries(values).filter(([, v]) => !!v && v > 0));
      await api.put('/workspace', { fxRates: rates });
      await refreshWorkspace();
      toast.success('Exchange rate saved');
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  if (!currencies.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
      {currencies.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          1 {base} =
          <span className="w-28"><NumberInput value={values[c] ?? null} onChange={(v) => setValues({ ...values, [c]: v })} min={0} decimals={4} ariaLabel={`${c} per ${base}`} /></span>
          {c}
        </span>
      ))}
      {dirty && <Button size="sm" variant="primary" loading={busy} onClick={save}>Save rate</Button>}
      <ErrorNote message={error} />
    </div>
  );
}

interface BreakdownRow { key: string; label: string; kind: 'group' | 'gain' | 'net'; group?: AccountGroup; cells: Record<string, { previous: number; current: number }> }

/** Previous vs current month per account group, one column pair per currency. */
function BreakdownTable({ data, month }: { data: Wealth; month: string }) {
  const rows: BreakdownRow[] = GROUP_ORDER
    .map((g) => ({
      key: g, label: GROUP_LABEL[g], kind: 'group' as const, group: g,
      cells: Object.fromEntries(data.byCurrency.map((c) => {
        const x = c.groups.find((y) => y.group === g)!;
        return [c.currency, { previous: x.previous, current: x.current }];
      })),
    }))
    .filter((r) => Object.values(r.cells).some((x) => x.current || x.previous));
  const hasInvestments = data.byCurrency.some((c) => c.investments.value > 0);
  if (hasInvestments) rows.push({ key: 'gain', label: 'Investment gain', kind: 'gain', cells: {} });
  rows.push({
    key: 'net', label: 'Net', kind: 'net',
    cells: Object.fromEntries(data.byCurrency.map((c) => [c.currency, { previous: c.previousNet, current: c.net }])),
  });

  const header = (
    <ColumnGroup>
      <Row>
        <Column header="Type" rowSpan={2} />
        {data.byCurrency.map((c) => <Column key={c.currency} header={c.currency} colSpan={2} alignHeader="center" />)}
      </Row>
      <Row>
        {data.byCurrency.flatMap((c) => [
          <Column key={`${c.currency}-p`} header={monthLabel(addMonths(month, -1), 'short')} alignHeader="right" />,
          <Column key={`${c.currency}-c`} header={monthLabel(month, 'short')} alignHeader="right" />,
        ])}
      </Row>
    </ColumnGroup>
  );

  const cell = (r: BreakdownRow, cur: string, which: 'previous' | 'current') => {
    if (r.kind === 'gain') {
      if (which === 'previous') return null;
      const inv = data.byCurrency.find((c) => c.currency === cur)!.investments;
      return inv.value > 0 ? (
        <span className="text-xs text-stone-500">
          invested <span className="num">{moneyIn(inv.invested, cur)}</span>{' '}
          <span className={cx('num font-medium', inv.gain < 0 ? 'text-rose-700' : 'text-brand-700')}>{inv.gain >= 0 ? '+' : ''}{moneyIn(inv.gain, cur)}</span>
        </span>
      ) : <span className="text-stone-300">—</span>;
    }
    const v = r.cells[cur]?.[which] ?? 0;
    const debt = r.group === 'liability' && v > 0;
    return (
      <span className={cx('num', which === 'previous' ? 'text-stone-500' : 'font-medium', (debt || (r.kind === 'net' && v < 0)) && 'text-rose-700', r.kind === 'net' && 'font-semibold')}>
        {debt ? '−' : ''}{moneyIn(v, cur)}
      </span>
    );
  };

  return (
    <div className="overflow-hidden rounded-md border border-stone-200">
      <DataTable value={rows} dataKey="key" size="small" headerColumnGroup={header} tableStyle={{ minWidth: '36rem' }}
        rowClassName={(r: BreakdownRow) => (r.kind === 'net' ? 'font-semibold bg-stone-50' : '')}>
        <Column body={(r: BreakdownRow) => <span className={r.kind === 'gain' ? 'text-xs text-stone-500' : ''}>{r.label}</span>} />
        {data.byCurrency.flatMap((c) => [
          <Column key={`${c.currency}-p`} align="right" body={(r: BreakdownRow) => cell(r, c.currency, 'previous')} />,
          <Column key={`${c.currency}-c`} align="right" body={(r: BreakdownRow) => cell(r, c.currency, 'current')} />,
        ])}
      </DataTable>
    </div>
  );
}

export default function WealthPage() {
  const { month } = useMonth();
  const { user, workspace, isCouple } = useAuth();
  const [scope, setScope] = useState('all');
  const { data, error, loading, reload } = useApi<Wealth>(`/wealth?month=${month}&scope=${scope}`);

  const scopes = useMemo(() => {
    const ms = workspace!.members;
    return [
      { value: 'all', label: 'Household' },
      ...ms.map((m) => ({ value: m.userId, label: m.userId === user!.id ? `${m.displayName} (me)` : m.displayName })),
      { value: 'common', label: 'Joint' },
    ];
  }, [workspace, user]);

  const base = data?.base ?? 'AED';
  const foreign = (data?.byCurrency ?? []).map((c) => c.currency).filter((c) => c !== base);
  const rateCurrencies = [...new Set([...foreign, ...Object.keys(workspace?.fxRates ?? {})])];
  const trend = (data?.trend ?? []).map((t) => ({ ...t, label: monthShort(t.month) }));
  const hasTransfers = trend.some((t) => t.transferredOut > 0);
  const fmtBase = (v: number) => `${base} ${moneyIn(v, base)}`;

  return (
    <Page>
      <PageHeader
        title="Wealth"
        subtitle={`Net worth at the end of ${monthLabel(month)} compared with ${monthLabel(addMonths(month, -1))}`}
        actions={isCouple && <Tabs value={scope} onChange={setScope} items={scopes} />}
      />
      <ErrorNote message={error} />
      {loading && !data && (
        <div className="space-y-4">
          <StatSkeleton count={3} className="sm:grid-cols-2 lg:grid-cols-3" />
          <BlockSkeleton className="h-56" />
          <div className="grid gap-4 lg:grid-cols-2"><BlockSkeleton className="h-72" /><BlockSkeleton className="h-72" /></div>
        </div>
      )}
      {data && data.accounts.length === 0 && (
        <div className="card">
          <Empty icon={<CreditCard className="size-8" />} title="No accounts yet">
            Add your bank accounts, deposits, SIPs, stocks and loans on the <Link to="/accounts" className="font-medium text-brand-700 underline">Accounts</Link> page, then update their balances each month.
          </Empty>
        </div>
      )}
      {data && data.accounts.length > 0 && (
        <div className={cx('space-y-4', loading && 'opacity-60')}>
          {(data.missingRates.length > 0 || data.staleAccounts.length > 0) && (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {data.missingRates.length > 0 && <div>Set the exchange rate for {data.missingRates.join(', ')} below — it’s left out of the combined total until then.</div>}
              {data.staleAccounts.length > 0 && <div>{data.staleAccounts.length} account{data.staleAccounts.length > 1 ? 's were' : ' was'} not updated for {monthLabel(month)}; their last balance is carried forward. <Link to="/accounts" className="font-medium underline">Update balances</Link></div>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NetTile
              title={`Total net worth (in ${base})`} currency={base} net={data.combined.net} previous={data.combined.previousNet} change={data.combined.change}
              sub={<>Assets <span className="num">{moneyIn(data.combined.assets, base)}</span> · Loans <span className="num">{moneyIn(data.combined.liabilities, base)}</span></>}
            />
            {data.byCurrency.map((c) => (
              <NetTile
                key={c.currency} title={`${c.currency} net worth${c.currency === 'INR' ? ' (India)' : c.currency === 'AED' ? ' (UAE)' : ''}`}
                currency={c.currency} net={c.net} previous={c.previousNet} change={c.change}
                sub={c.currency !== base ? <>≈ <span className="num">{base} {moneyIn(c.netInBase, base)}</span></> : undefined}
              />
            ))}
          </div>

          <div className="card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-stone-800">Exchange rate</h2>
              <RateEditor key={JSON.stringify(data.fx)} base={base} currencies={rateCurrencies} fx={data.fx} onSaved={reload} />
            </div>
          </div>

          <section className="card min-w-0 p-4">
            <h2 className="mb-2 text-sm font-semibold text-stone-800">Where the money is</h2>
            <BreakdownTable data={data} month={month} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card min-w-0 p-4">
              <h2 className="mb-2 text-sm font-semibold text-stone-800">Net worth · last 12 months ({base})</h2>
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={compact} width={48} />
                    <Tooltip formatter={(v: number) => [fmtBase(v), 'Net worth']} labelFormatter={(_l, p) => (p?.[0] ? monthLabel(p[0].payload.month) : '')} contentStyle={tooltipStyle} cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} />
                    <Line dataKey="net" name="Net worth" stroke={C.income} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: C.income }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card min-w-0 p-4">
              <h2 className="mb-2 text-sm font-semibold text-stone-800">Sent abroad each month ({base}, cross-currency transfers)</h2>
              {hasTransfers ? (
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" {...axisProps} />
                      <YAxis {...axisProps} tickFormatter={compact} width={48} />
                      <Tooltip formatter={(v: number) => [fmtBase(v), 'Transferred']} labelFormatter={(_l, p) => (p?.[0] ? monthLabel(p[0].payload.month) : '')} contentStyle={tooltipStyle} cursor={{ fill: '#f7f8fb' }} />
                      <Bar dataKey="transferredOut" name="Transferred" fill={C.common} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-xs text-stone-500">No AED ↔ INR transfers recorded in the last 12 months.</p>
              )}
              {data.transferSummary.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-stone-100 pt-2 text-xs text-stone-600">
                  {data.transferSummary.map((t) => (
                    <li key={`${t.from}-${t.to}`}>
                      {monthLabel(month, 'short')}: {t.count} transfer{t.count > 1 ? 's' : ''} <span className="inline-flex items-center gap-0.5">{t.from} <ArrowRight className="inline size-3 text-stone-400" aria-label="to" /> {t.to}</span> — sent <span className="num font-medium">{moneyIn(t.amount, t.from)}</span>,
                      received <span className="num font-medium">{moneyIn(t.toAmount, t.to)}</span>
                      {t.from !== t.to && t.rate && <> (avg rate <span className="num">{t.rate}</span>)</>}
                      {t.fee > 0 && <>, fees <span className="num">{moneyIn(t.fee, t.from)}</span></>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </Page>
  );
}
