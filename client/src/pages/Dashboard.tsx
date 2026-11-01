import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRightLeft, CheckCircle2, ChevronDown, Coins, Plus, ReceiptText, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import type { Cards, Summary } from '../lib/types';
import { addMonths, compact, money, monthLabel, monthShort, thisMonth } from '../lib/format';
import { C, CATEGORY_COLORS, OTHER_COLOR } from '../lib/chartColors';
import { BlockSkeleton, Button, ErrorNote, Money, Page, PageHeader, Skeleton, StatSkeleton, Tabs, TypeBadge, cx, usePaging } from '../components/ui';
import { PayCommitmentModal, WhoPaid, payLabel } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';

type Member = Summary['cards']['members'][number];
type Budget = Summary['budgetVsActual'][number];

/**
 * Explains the settle-up line: each common expense is split (50/50 unless its
 * commitment sets another split), so whoever paid more than their part is owed the
 * difference. Also lists support: partners paying each other's personal bills.
 */
function Settlement({ members, support, name }: { members: Member[]; support: Cards['support']; name: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const owed = members.find((m) => m.balance > 0.004);
  const owes = members.find((m) => m.balance < -0.004);
  return (
    <div className="card text-xs text-stone-600">
      <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ArrowRightLeft className="size-3.5 shrink-0 text-brand-600" />
        <span className="flex-1">
          {owed && owes
            ? <><b>{name(owes.userId)}</b> owes <b>{name(owed.userId)}</b> AED <span className="num font-semibold">{money(owed.balance)}</span> for common expenses this month.</>
            : 'Common expenses are settled — each of you paid exactly your part.'}
          {support.map((x) => (
            <span key={`${x.from}>${x.to}`} className="ml-1 text-emerald-700"> · <b>{name(x.from)}</b> supported <b>{name(x.to)}</b> AED <span className="num font-semibold">{money(x.amount)}</span></span>
          ))}
        </span>
        <span className="flex items-center gap-0.5 font-medium text-brand-700">Why? <ChevronDown className={cx('size-3.5 transition-transform', open && 'rotate-180')} /></span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-stone-100 px-4 py-3">
          <p>Every common expense (and common commitment marked paid) is split 50/50, or by the split set on its commitment (custom amounts or by salary). The settle-up compares what each person <i>paid</i> with their <i>part</i>:</p>
          <div className="max-w-md overflow-hidden rounded-xl border border-stone-200">
            <DataTable value={members} dataKey="userId" size="small">
              <Column header="" body={(m: Member) => <span className="font-medium text-stone-800">{name(m.userId)}</span>} />
              <Column header="Paid" align="right" body={(m: Member) => <Money value={m.commonPaid} />} />
              <Column header="Their part" align="right" body={(m: Member) => <Money value={m.commonShare} />} />
              <Column header="Difference" align="right" body={(m: Member) => <Money value={m.balance} signed />} />
            </DataTable>
          </div>
          {owed && owes && (
            <p>
              {name(owed.userId)} paid <Money value={owed.balance} /> more than their part, so {name(owes.userId)} owes that amount.
              Usually this happens because one person paid a big shared bill (like rent). Check “Paid by” on the
              common expenses if it looks wrong — when you mark a commitment paid you can choose who paid it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Tint = 'blue' | 'pink' | 'purple' | 'amber';
const TINT: Record<Tint, { card: string; icon: string }> = {
  blue: { card: 'to-brand-50 border-brand-100', icon: 'text-brand-600 border-brand-200' },
  pink: { card: 'to-rose-50 border-rose-100', icon: 'text-rose-500 border-rose-200' },
  purple: { card: 'to-violet-50 border-violet-100', icon: 'text-violet-500 border-violet-200' },
  amber: { card: 'to-amber-50 border-amber-100', icon: 'text-amber-500 border-amber-200' },
};

/** Headline figure in a tinted card (top row). */
function HeroStat({ tint, icon, label, value, footer, aside }: {
  tint: Tint; icon: React.ReactNode; label: string; value: number; footer?: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col rounded-2xl border bg-linear-to-br from-white p-4 shadow-[0_1px_2px_rgba(22,25,37,0.04)]', TINT[tint].card)}>
      <div className="flex items-center gap-2.5">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white', TINT[tint].icon)}>{icon}</span>
        <span className="truncate text-sm font-medium text-stone-700">{label}</span>
      </div>
      <div className="mt-3 flex flex-1 items-center justify-between gap-2">
        <div className={cx('num truncate text-2xl font-semibold tracking-tight', value < 0 ? 'text-rose-700' : 'text-stone-900')}>
          <span className="mr-1 text-sm font-medium text-stone-400">AED</span>{money(value)}
        </div>
        {aside}
      </div>
      {footer && <div className="mt-2 text-[11px] text-stone-500">{footer}</div>}
    </div>
  );
}

/** Secondary figure, several sit side by side in one card. */
function MiniStat({ label, value, sub }: { label: string; value: number; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="truncate text-xs font-medium text-stone-500">{label}</div>
      <div className={cx('num mt-0.5 truncate text-base font-semibold', value < 0 ? 'text-rose-700' : 'text-stone-900')}>{money(value)}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

/** "6% more than last month"; `goodWhenUp` decides whether a rise is green or red. */
function Delta({ current, previous, goodWhenUp }: { current: number; previous?: number; goodWhenUp: boolean }) {
  if (previous === undefined || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cx('inline-flex items-center gap-1 font-medium', up === goodWhenUp ? 'text-emerald-600' : 'text-rose-600')}>
      <Icon className="size-3.5" />{Math.abs(pct).toFixed(0)}% {up ? 'more' : 'less'} than last month
    </span>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 22;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative size-14 shrink-0" title={`${Math.round(pct)}% of cash left`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#fdeec8" strokeWidth="7" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f59e0b" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(Math.min(100, pct) / 100) * len} ${len}`} />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-stone-700">{Math.round(pct)}%</span>
    </div>
  );
}

function ChartCard({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cx('card flex min-w-0 flex-col p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid #e6e8ef', boxShadow: '0 8px 24px rgba(22,25,37,.08)' };
const axisProps = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;
const fmtTip = (v: number) => `AED ${money(v)}`;

/** Where this month's money went: the six biggest categories plus "Other". */
function TopCategories({ rows }: { rows: Budget[] }) {
  const slices = useMemo(() => {
    const spent = rows.filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual);
    const top = spent.slice(0, CATEGORY_COLORS.length).map((r, i) => ({ name: r.category, value: r.actual, color: CATEGORY_COLORS[i] }));
    const rest = spent.slice(CATEGORY_COLORS.length).reduce((a, r) => a + r.actual, 0);
    return rest > 0 ? [...top, { name: 'Other', value: rest, color: OTHER_COLOR }] : top;
  }, [rows]);
  if (slices.length === 0) return <p className="flex flex-1 items-center justify-center py-6 text-xs text-stone-500">No spending recorded this month.</p>;
  return (
    <div className="flex min-h-0 flex-1 items-center gap-4">
      <div className="size-36 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={3} cornerRadius={4} stroke="none" isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip formatter={fmtTip} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="scroll-thin min-w-0 flex-1 space-y-2 overflow-y-auto">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: s.color }} />
            {s.name === 'Other' ? <span className="size-6 shrink-0" /> : <CategoryIcon category={s.name} size="sm" />}
            <span className="min-w-0 flex-1 truncate text-stone-700">{s.name}</span>
            <span className="num font-medium text-stone-900">{money(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <StatSkeleton count={4} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" />
      <div className="card grid grid-cols-2 gap-4 p-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i}><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-4 w-28" /></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <BlockSkeleton className="h-72" /><BlockSkeleton className="h-72" /><BlockSkeleton className="h-72 lg:col-span-2 xl:col-span-1" />
      </div>
      <div className="grid gap-4 lg:min-h-64 lg:flex-1 lg:grid-cols-5">
        <BlockSkeleton className="min-h-64 lg:col-span-3" /><BlockSkeleton className="min-h-64 lg:col-span-2" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, workspace, memberName, isCouple } = useAuth();
  const { month } = useMonth();
  const [scope, setScope] = useState<string>(user!.id);
  const { data, error, loading, reload } = useApi<Summary>(`/summary?month=${month}&scope=${scope}`);
  const [paying, setPaying] = useState<Summary['commitmentsDue'][number] | null>(null);
  const budgetPaging = usePaging([month, scope]);

  const scopes = useMemo(() => {
    const ms = workspace!.members;
    const mine = ms.find((m) => m.userId === user!.id)!;
    const others = ms.filter((m) => m.userId !== user!.id);
    return [
      { value: mine.userId, label: `${mine.displayName} (me)` },
      ...others.map((m) => ({ value: m.userId, label: m.displayName })),
      { value: 'common', label: 'Common' },
    ];
  }, [workspace, user]);

  const isCommon = scope === 'common';
  const c = data?.cards;
  const future = month > thisMonth();
  const early = month === addMonths(thisMonth(), 1); // next month's bills can be paid early
  const trend = data?.trend ?? [];
  const at = trend.findIndex((t) => t.month === month);
  const prev = at > 0 ? trend[at - 1] : undefined;
  const goalPct = c && c.cashLeft > 0 ? (c.allocatedToGoals / c.cashLeft) * 100 : 0;

  return (
    <Page fill>
      <PageHeader
        title={`Hi, ${user!.displayName.split(/\s+/)[0]} 👋`}
        subtitle={`${isCommon ? 'Common view' : isCouple && scope !== user!.id ? `${memberName(scope)}'s view` : 'Your view'} · ${monthLabel(month)} · ${isCommon ? 'household income and shared expenses' : isCouple ? 'personal view including their 50% of common expenses' : 'income, spending and commitments'}`}
        actions={
          <>
            {isCouple && <Tabs value={scope} onChange={setScope} items={scopes} />}
            {future ? <Button variant="primary" disabled title="This month has not started yet" icon={<Plus className="size-3.5" />}>Expense</Button> : <Link to="/expenses/new"><Button variant="primary" icon={<Plus className="size-3.5" />}>Expense</Button></Link>}
          </>
        }
      />
      <ErrorNote message={error} />
      {loading && !data && <DashboardSkeleton />}
      {c && data && (
        <div className={cx('flex flex-1 flex-col gap-4 transition-opacity', loading && 'opacity-60')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroStat tint="blue" icon={<Wallet className="size-4" />} label="Cash left" value={c.cashLeft} footer="Received income − recorded outflow" />
            <HeroStat
              tint="pink" icon={<ReceiptText className="size-4" />} label="Total outflow" value={c.totalOutflow}
              footer={prev && prev.outflow > 0 ? <Delta current={c.totalOutflow} previous={prev.outflow} goodWhenUp={false} /> : 'Spending recorded this month'}
            />
            <HeroStat
              tint="purple" icon={<Coins className="size-4" />} label="Income received" value={c.incomeReceived}
              footer={<>of <span className="num">{money(c.incomeExpected)}</span> expected{c.incomePending > 0 && <> · <span className="num">{money(c.incomePending)}</span> pending</>}</>}
              aside={trend.length > 1 && (
                <div className="h-10 w-24 shrink-0" title="Income received · last 6 months">
                  <ResponsiveContainer>
                    <LineChart data={trend} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                      <Line dataKey="incomeReceived" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            />
            <HeroStat
              tint="amber" icon={<Target className="size-4" />} label="Allocated to goals" value={c.allocatedToGoals}
              footer="Share of cash left set aside for goals"
              aside={<Ring pct={goalPct} />}
            />
          </div>

          <div className="card grid grid-cols-2 divide-stone-100 lg:grid-cols-4 lg:divide-x">
            <MiniStat label={isCommon ? 'Personal expenses (both)' : 'Personal expenses'} value={c.personalExpenses} />
            {isCouple
              ? <MiniStat label={isCommon ? 'Common expenses' : 'My share of common'} value={c.commonShare} sub={isCommon ? c.members.map((m) => `${memberName(m.userId)} ${money(m.commonShare)}`).join(' · ') : <>of <span className="num">{money(c.commonTotal)}</span> total common</>} />
              : <MiniStat label="Income pending" value={c.incomePending} sub={<>of <span className="num">{money(c.incomeExpected)}</span> expected</>} />}
            <MiniStat label="Planned commitments" value={c.plannedCommitments} sub={<>Planned balance <span className={cx('num', c.plannedBalance < 0 && 'text-rose-700')}>{money(c.plannedBalance)}</span></>} />
            <MiniStat label="Not yet allocated" value={c.notYetAllocated} sub="Cash left − goal allocations" />
          </div>

          {isCouple && <Settlement members={c.members} support={c.support ?? []} name={memberName} />}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Income vs spending · last 6 months">
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={trend.map((t) => ({ ...t, label: monthShort(t.month) }))} barGap={3} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={compact} width={44} />
                    <Tooltip formatter={fmtTip} contentStyle={tooltipStyle} cursor={{ fill: '#f7f8fb' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="incomeReceived" name="Income received" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={14} background={{ fill: C.track, radius: 4 }} />
                    <Bar dataKey="outflow" name="Outflow" fill={C.outflow} radius={[4, 4, 0, 0]} maxBarSize={14} background={{ fill: C.track, radius: 4 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title={`Daily spending · ${monthLabel(month)}`}>
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={data.daily} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis {...axisProps} tickFormatter={compact} width={44} />
                    <Tooltip formatter={fmtTip} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} cursor={{ fill: '#f7f8fb' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {!isCommon && <Bar dataKey="personal" name="Personal" stackId="d" fill={C.personal} maxBarSize={12} />}
                    <Bar dataKey="common" name={isCommon ? 'Common' : 'Share of common'} stackId="d" fill={C.common} radius={[3, 3, 0, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Top categories" className="lg:col-span-2 xl:col-span-1">
              <TopCategories rows={data.budgetVsActual} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:min-h-64 lg:flex-1 lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)]">
            <section className="card table-fill flex min-h-0 min-w-0 flex-col overflow-hidden lg:col-span-3">
              <h2 className="shrink-0 px-4 pb-2 pt-4 text-sm font-semibold text-stone-800">Budget vs actual</h2>
              {data.budgetVsActual.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">No commitments or expenses this month.</p>
              ) : (
                <DataTable value={data.budgetVsActual} dataKey="category" size="small" {...budgetPaging}>
                  <Column header="Category" body={(r: Budget) => <span className="flex items-center gap-2.5"><CategoryIcon category={r.category} size="sm" />{r.category}</span>} />
                  <Column header="Planned" align="right" body={(r: Budget) => <Money value={r.planned} className="text-stone-500" />} />
                  <Column header="Actual" align="right" body={(r: Budget) => <Money value={r.actual} />} />
                  <Column header="" headerClassName="hidden sm:table-cell" bodyClassName="hidden sm:table-cell" style={{ width: '30%' }} body={(r: Budget) => {
                    const pct = r.planned > 0 ? Math.min(100, (r.actual / r.planned) * 100) : r.actual > 0 ? 100 : 0;
                    return (
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100" title={`${Math.round(pct)}% used`}>
                        <div className={cx('h-full rounded-full', r.actual > r.planned + 0.004 ? 'bg-rose-500' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
                      </div>
                    );
                  }} />
                  <Column header="Left" align="right" body={(r: Budget) => <Money value={r.planned - r.actual} className={r.actual > r.planned + 0.004 ? 'text-rose-700' : 'text-stone-600'} />} />
                </DataTable>
              )}
            </section>

            <section className="card flex min-h-0 min-w-0 flex-col lg:col-span-2">
              <h2 className="shrink-0 px-4 pb-2 pt-4 text-sm font-semibold text-stone-800">Commitments this month</h2>
              {data.commitmentsDue.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">No commitments this month.</p>
              ) : (
                <ul className="scroll-thin min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto px-4 pb-2">
                  {data.commitmentsDue.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      {d.paid
                        ? <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-4" /></span>
                        : <CategoryIcon category={d.category} className="size-9! rounded-full!" />}
                      <div className="min-w-0 flex-1">
                        <div className={cx('truncate font-medium', d.paid && 'text-stone-500')}>{d.title}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                          {isCouple && <TypeBadge type={d.type} />} Due day {d.dueDay}
                          {(d.payment.paidAmount > 0 || !!d.payment.sent?.length || (isCouple && d.type === 'common')) && <WhoPaid c={d} compact />}
                        </div>
                      </div>
                      <div className="text-right">
                        <Money value={d.myShare} className="font-semibold" />
                        {d.type === 'common' && !isCommon && <div className="num text-[11px] text-stone-400">of {money(d.amount)}</div>}
                      </div>
                      {!d.paid && (!future || early) && (
                        <Button size="sm" onClick={() => setPaying(d)} title="Record the payment as an expense">
                          {payLabel(d, user!.id, isCouple, future)}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      <PayCommitmentModal target={paying} month={month} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); }} />
    </Page>
  );
}
