import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CreditCard, Landmark, PiggyBank, RefreshCw, Users, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import type { BalanceAccount, Balances } from '../lib/types';
import { compact, monthLabel, monthShort, moneyIn } from '../lib/format';
import { C, CATEGORY_COLORS } from '../lib/chartColors';
import { Badge, BlockSkeleton, Button, Empty, ErrorNote, Money, Page, PageHeader, StatSkeleton, TableCard, Tabs, cx, usePaging } from '../components/ui';

type Saving = Balances['savings'][number];
type View = 'accounts' | 'savings' | 'trend';

const TINTS = [
  { card: 'to-brand-50 border-brand-100', icon: 'text-brand-600 border-brand-200' },
  { card: 'to-violet-50 border-violet-100', icon: 'text-violet-500 border-violet-200' },
  { card: 'to-rose-50 border-rose-100', icon: 'text-rose-500 border-rose-200' },
  { card: 'to-amber-50 border-amber-100', icon: 'text-amber-500 border-amber-200' },
];

function Tile({ tint, icon, label, value, currency, sub }: { tint: number; icon: React.ReactNode; label: string; value: number; currency: string; sub?: React.ReactNode }) {
  const t = TINTS[tint % TINTS.length];
  return (
    <div className={cx('flex min-w-0 flex-col rounded-2xl border bg-linear-to-br from-white p-4 shadow-[0_1px_2px_rgba(22,25,37,0.04)]', t.card)}>
      <div className="flex items-center gap-2.5">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white', t.icon)}>{icon}</span>
        <span className="truncate text-sm font-medium text-stone-700">{label}</span>
      </div>
      <div className={cx('num mt-3 truncate text-2xl font-semibold tracking-tight', value < 0 ? 'text-rose-700' : 'text-stone-900')}>
        <span className="mr-1 text-sm font-medium text-stone-400">{currency}</span>{moneyIn(value, currency)}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid #e6e8ef', boxShadow: '0 8px 24px rgba(22,25,37,.08)' };
const axisProps = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;

export default function BalancesPage() {
  const { month } = useMonth();
  const { workspace, memberName, isCouple } = useAuth();
  const { label } = useLookups();
  const { data, error, loading } = useApi<Balances>(`/balances?month=${month}`);
  const [view, setView] = useState<View>('accounts');
  const [picked, setPicked] = useState<string | null>(null);
  const members = workspace?.members ?? [];
  const base = data?.base ?? workspace?.currency ?? 'AED';
  // Each currency is shown on its own (UAE and Indian accounts are never added together).
  const currencies = data?.byCurrency.map((c) => c.currency) ?? [];
  const cur = picked && currencies.includes(picked) ? picked : currencies[0] ?? base;
  const own = data?.byCurrency.find((c) => c.currency === cur);
  const accounts = (data?.accounts ?? []).filter((a) => a.currency === cur);
  const accountPaging = usePaging([month, cur]);
  const savingsPaging = usePaging(month);
  const fmt = (v: number) => `${cur} ${moneyIn(v, cur)}`;
  const prevTotals = own && own.trend.length > 1 ? own.trend[own.trend.length - 2] : undefined;
  // Income and spending are in the base currency, so savings belong to its tab.
  const showSavings = cur === base;
  const activeView: View = view === 'savings' && !showSavings ? 'accounts' : view;
  const totals = own?.totals ?? { household: 0, joint: 0, members: {} as Record<string, number> };

  const series = [
    { key: 'household', name: isCouple ? 'Household' : 'Total', color: C.income },
    ...(isCouple ? members.map((m, i) => ({ key: m.userId, name: m.displayName, color: CATEGORY_COLORS[[1, 3][i] ?? 4] })) : []),
    ...(isCouple ? [{ key: 'joint', name: 'Common', color: CATEGORY_COLORS[2] }] : []),
  ];
  const trend = (own?.trend ?? []).map((t) => ({ label: monthShort(t.month), month: t.month, household: t.household, joint: t.joint, ...t.members }));

  const savingsHeader = (
    <ColumnGroup>
      <Row>
        <Column header="Month" rowSpan={2} />
        {members.map((m) => <Column key={m.userId} header={m.displayName} colSpan={3} alignHeader="center" />)}
        {isCouple && <Column header="Household" colSpan={2} alignHeader="center" />}
        {!isCouple && <Column header="Running total" rowSpan={2} align="right" />}
      </Row>
      <Row>
        {members.flatMap((m) => [
          <Column key={`${m.userId}-i`} header="Income" align="right" />,
          <Column key={`${m.userId}-s`} header="Spent" align="right" />,
          <Column key={`${m.userId}-v`} header="Saved" align="right" />,
        ])}
        {isCouple && <Column header="Saved" align="right" />}
        {isCouple && <Column header="Running total" align="right" />}
      </Row>
    </ColumnGroup>
  );
  const savings = [...(data?.savings ?? [])].reverse(); // newest first
  const savedTone = (v: number) => (v < 0 ? 'text-rose-700' : 'text-emerald-700');

  return (
    <Page fill>
      <PageHeader
        title="Balances"
        subtitle={`Bank balances at the end of ${monthLabel(month)} — your recorded balance, plus the income, expenses and transfers linked to each account`}
        actions={
          <>
            {currencies.length > 1 && (
              <Tabs value={cur} onChange={setPicked} items={currencies.map((c) => ({ value: c, label: c === 'AED' ? 'AED · UAE' : c === 'INR' ? 'INR · India' : c, count: data!.accounts.filter((a) => a.currency === c).length }))} />
            )}
            <Link to="/accounts"><Button icon={<RefreshCw className="size-3.5" />}>Record actual balances</Button></Link>
          </>
        }
      />
      <ErrorNote message={error} />

      {loading && !data && (
        <div className="space-y-4">
          <StatSkeleton count={isCouple ? 4 : 2} className="sm:grid-cols-2 xl:grid-cols-4" />
          <BlockSkeleton className="h-64" />
          <BlockSkeleton className="h-72" />
        </div>
      )}

      {data && data.accounts.length === 0 && (
        <div className="card">
          <Empty icon={<Landmark className="size-8" />} title="No accounts yet">
            Add your bank accounts on the <Link to="/accounts" className="font-medium text-brand-700 underline">Accounts</Link> page with their opening balance.
            Then pick the account when you record income (“Received into”) or an expense (“Paid from”), and the balances here update on their own.
          </Empty>
        </div>
      )}

      {data && data.accounts.length > 0 && (
        <div className={cx('flex min-h-0 flex-1 flex-col gap-4 transition-opacity', loading && 'opacity-60')}>
          {showSavings && (data.unlinked.expenses.count > 0 || data.unlinked.income.count > 0) && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                Not linked to an account in {monthLabel(month)}:{' '}
                {data.unlinked.expenses.count > 0 && <>{data.unlinked.expenses.count} expense{data.unlinked.expenses.count > 1 ? 's' : ''} (<Money value={data.unlinked.expenses.amount} />)</>}
                {data.unlinked.expenses.count > 0 && data.unlinked.income.count > 0 && ' and '}
                {data.unlinked.income.count > 0 && <>{data.unlinked.income.count} income (<Money value={data.unlinked.income.amount} />)</>}
                . They are left out of the balances below — edit them and choose “Paid from” / “Received into”.
              </div>
            </div>
          )}

          <div className={cx('grid gap-4 sm:grid-cols-2', isCouple && 'xl:grid-cols-4')}>
            <Tile
              tint={0} icon={<Wallet className="size-4" />} label={isCouple ? 'Household balance' : 'Total balance'} value={totals.household} currency={cur}
              sub={prevTotals && <>Last month <span className="num">{moneyIn(prevTotals.household, cur)}</span></>}
            />
            {isCouple && members.map((m, i) => (
              <Tile
                key={m.userId} tint={i + 1} icon={<PiggyBank className="size-4" />} label={`${m.displayName}’s accounts`} value={totals.members[m.userId] ?? 0} currency={cur}
                sub={prevTotals && <>Last month <span className="num">{moneyIn(prevTotals.members[m.userId] ?? 0, cur)}</span></>}
              />
            ))}
            {isCouple && (
              <Tile
                tint={3} icon={<Users className="size-4" />} label="Common accounts" value={totals.joint} currency={cur}
                sub={prevTotals && <>Last month <span className="num">{moneyIn(prevTotals.joint, cur)}</span></>}
              />
            )}
          </div>

          <TableCard>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-3.5">
              <Tabs<View> value={activeView} onChange={setView} items={[
                { value: 'accounts', label: 'Accounts', count: accounts.length },
                ...(showSavings ? [{ value: 'savings' as View, label: 'Savings each month' }] : []),
                { value: 'trend', label: 'Balance trend' },
              ]} />
              <span className="text-[11px] text-stone-500">
                {activeView === 'accounts' && <>End of {monthLabel(month)} · calculated = last recorded balance + money in − money out</>}
                {activeView === 'savings' && <>Saved = income received − own expenses{isCouple ? ' − half of common expenses' : ''}</>}
                {activeView === 'trend' && <>Last 12 months, in {cur}</>}
              </span>
            </div>
            {activeView === 'accounts' && (
            <DataTable value={accounts} dataKey="id" size="small" tableStyle={{ minWidth: '52rem' }} {...accountPaging}>
              <Column header="Account" body={(a: BalanceAccount) => (
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><CreditCard className="size-4" /></span>
                  <div className="min-w-0">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-stone-500">{label('bank', a.bank)} · {label('accountType', a.accountType)} · {a.currency}</div>
                  </div>
                </div>
              )} />
              {isCouple && <Column header="Owner" body={(a: BalanceAccount) => a.type === 'common' ? <Badge tone="violet">Common</Badge> : <span className="text-xs text-stone-600">{memberName(a.ownerId)}</span>} />}
              <Column header="Start of month" align="right" body={(a: BalanceAccount) => <span className="num text-stone-500">{moneyIn(a.opening, a.currency)}</span>} />
              <Column header="Money in" align="right" body={(a: BalanceAccount) => a.moneyIn ? <span className="num text-emerald-700">+{moneyIn(a.moneyIn, a.currency)}</span> : <span className="text-stone-300">—</span>} />
              <Column header="Money out" align="right" body={(a: BalanceAccount) => a.moneyOut ? <span className="num text-rose-700">−{moneyIn(a.moneyOut, a.currency)}</span> : <span className="text-stone-300">—</span>} />
              <Column header="End of month" align="right" body={(a: BalanceAccount) => (
                <div>
                  <span className={cx('num font-semibold', a.closing < 0 && 'text-rose-700')}>{moneyIn(a.closing, a.currency)}</span>
                  <div className="text-[10px] text-stone-400">{a.group === 'liability' ? 'owed · ' : ''}{a.recorded ? 'recorded' : 'calculated'}</div>
                </div>
              )} />
              <Column
                header="Not explained" align="right"
                headerTooltip="Recorded balance minus what the linked income, expenses and transfers explain — usually spending that wasn’t entered."
                body={(a: BalanceAccount) => a.untracked === null || Math.abs(a.untracked) < 0.005
                  ? <span className="text-stone-300">—</span>
                  : <span className={cx('num text-xs', a.untracked < 0 ? 'text-rose-700' : 'text-emerald-700')}>{a.untracked > 0 ? '+' : '−'}{moneyIn(Math.abs(a.untracked), a.currency)}</span>}
              />
            </DataTable>
            )}

            {activeView === 'trend' && (
            <div className="min-h-56 flex-1 px-4 pb-4">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={compact} width={52} />
                  <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} labelFormatter={(_l, p) => (p?.[0] ? monthLabel(p[0].payload.month) : '')} contentStyle={tooltipStyle} cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} />
                  {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
                  {series.map((s) => (
                    <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}

            {activeView === 'savings' && (
            <DataTable
              value={savings} dataKey="month" size="small" headerColumnGroup={savingsHeader} tableStyle={{ minWidth: isCouple ? '60rem' : '32rem' }} {...savingsPaging}
              emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">No months to show yet.</p>}
            >
              <Column body={(s: Saving) => <span className="font-medium">{monthLabel(s.month, 'short')}</span>} />
              {members.flatMap((m) => [
                <Column key={`${m.userId}-i`} align="right" body={(s: Saving) => <Money value={s.members.find((x) => x.userId === m.userId)?.income ?? 0} className="text-stone-600" />} />,
                <Column key={`${m.userId}-s`} align="right" body={(s: Saving) => <Money value={s.members.find((x) => x.userId === m.userId)?.spent ?? 0} className="text-stone-600" />} />,
                <Column key={`${m.userId}-v`} align="right" body={(s: Saving) => {
                  const v = s.members.find((x) => x.userId === m.userId)?.saved ?? 0;
                  return <span className={cx('num font-semibold', savedTone(v))}>{moneyIn(v, base)}</span>;
                }} />,
              ])}
              {isCouple && <Column align="right" body={(s: Saving) => <span className={cx('num font-semibold', savedTone(s.saved))}>{moneyIn(s.saved, base)}</span>} />}
              <Column align="right" body={(s: Saving) => <span className={cx('num', s.cumulative < 0 ? 'text-rose-700' : 'text-stone-700')}>{moneyIn(s.cumulative, base)}</span>} />
            </DataTable>
            )}
          </TableCard>
        </div>
      )}
    </Page>
  );
}
