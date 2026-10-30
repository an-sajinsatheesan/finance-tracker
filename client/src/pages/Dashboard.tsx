import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRightLeft, CheckCircle2, Circle, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Summary } from '../lib/types';
import { compact, money, monthLabel, monthShort } from '../lib/format';
import { C } from '../lib/chartColors';
import { Button, ErrorNote, Money, PageHeader, Spinner, Tabs, TypeBadge, cx } from '../components/ui';

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: React.ReactNode; tone?: 'pos' | 'neg' | 'muted' }) {
  return (
    <div className="card px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={cx('num mt-1 text-lg font-semibold tracking-tight', tone === 'neg' || value < 0 ? 'text-rose-700' : tone === 'pos' ? 'text-brand-800' : 'text-stone-900')}>
        <span className="mr-1 text-xs font-medium text-stone-400">AED</span>{money(value)}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cx('card min-w-0 p-3.5', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-stone-700">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const tooltipStyle = { fontSize: 12, borderRadius: 6, border: '1px solid #e7e5e4', boxShadow: '0 4px 12px rgba(0,0,0,.06)' };
const axisProps = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;
const fmtTip = (v: number) => `AED ${money(v)}`;

export default function Dashboard() {
  const { user, workspace, memberName } = useAuth();
  const { month } = useMonth();
  const [scope, setScope] = useState<string>(user!.id);
  const { data, error, loading, reload } = useApi<Summary>(`/summary?month=${month}&scope=${scope}`);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

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

  async function pay(id: string) {
    setPaying(id);
    setPayError(null);
    try {
      await api.post(`/commitments/${id}/pay`, { month });
      reload();
    } catch (e) {
      setPayError(errorText(e));
    } finally {
      setPaying(null);
    }
  }

  const settlement = useMemo(() => {
    if (!c) return null;
    const owed = c.members.find((m) => m.balance > 0.004);
    const owes = c.members.find((m) => m.balance < -0.004);
    if (!owed || !owes) return 'Common expenses are settled.';
    return `${memberName(owes.userId)} owes ${memberName(owed.userId)} AED ${money(owed.balance)} for common expenses.`;
  }, [c, memberName]);

  return (
    <div>
      <PageHeader
        title={isCommon ? 'Common dashboard' : `${memberName(scope)}'s dashboard`}
        subtitle={`${monthLabel(month)} · ${isCommon ? 'household income and shared expenses' : 'personal view including their 50% of common expenses'}`}
        actions={
          <>
            <Tabs value={scope} onChange={setScope} items={scopes} />
            <Link to="/expenses/new"><Button variant="primary"><Plus className="size-3.5" /> Expense</Button></Link>
          </>
        }
      />
      <ErrorNote message={error} />
      {loading && !data && <Spinner />}
      {c && data && (
        <div className={cx('space-y-4', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Income received" value={c.incomeReceived} sub={<>of <span className="num">{money(c.incomeExpected)}</span> expected{c.incomePending > 0 && <> · <span className="num">{money(c.incomePending)}</span> pending</>}</>} />
            <Stat label="Cash left" value={c.cashLeft} tone="pos" sub="Received income − recorded outflow" />
            <Stat label={isCommon ? 'Personal expenses (both)' : 'Personal expenses'} value={c.personalExpenses} />
            <Stat label={isCommon ? 'Common expenses' : 'My share of common'} value={c.commonShare} sub={isCommon ? <>{c.members.map((m) => `${memberName(m.userId)} ${money(m.commonShare)}`).join(' · ')}</> : <>of <span className="num">{money(c.commonTotal)}</span> total common</>} />
            <Stat label="Total outflow" value={c.totalOutflow} />
            <Stat label="Allocated to goals" value={c.allocatedToGoals} />
            <Stat label="Not yet allocated" value={c.notYetAllocated} tone={c.notYetAllocated < 0 ? 'neg' : 'muted'} sub="Cash left − goal allocations" />
            <Stat label="Planned commitments" value={c.plannedCommitments} sub={<>Planned balance <span className={cx('num', c.plannedBalance < 0 && 'text-rose-700')}>{money(c.plannedBalance)}</span></>} />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
            <ArrowRightLeft className="size-3.5 text-stone-400" /> {settlement}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Income vs spending · last 6 months">
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={data.trend.map((t) => ({ ...t, label: monthShort(t.month) }))} barGap={2} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={compact} width={44} />
                    <Tooltip formatter={fmtTip} contentStyle={tooltipStyle} cursor={{ fill: '#f5f5f4' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="incomeReceived" name="Income received" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="outflow" name="Outflow" fill={C.outflow} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title={`Daily spending · ${monthLabel(month)}`}>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={data.daily} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis {...axisProps} tickFormatter={compact} width={44} />
                    <Tooltip formatter={fmtTip} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} cursor={{ fill: '#f5f5f4' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {!isCommon && <Bar dataKey="personal" name="Personal" stackId="d" fill={C.personal} maxBarSize={14} />}
                    <Bar dataKey="common" name={isCommon ? 'Common' : 'Share of common'} stackId="d" fill={C.common} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <ChartCard title="Budget vs actual" className="lg:col-span-3">
              {data.budgetVsActual.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">No commitments or expenses this month.</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="border-b border-stone-200">
                    <tr><th className="th pl-0">Category</th><th className="th text-right">Planned</th><th className="th text-right">Actual</th><th className="th hidden w-1/3 sm:table-cell" /><th className="th pr-0 text-right">Left</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.budgetVsActual.map((r) => {
                      const pct = r.planned > 0 ? Math.min(100, (r.actual / r.planned) * 100) : r.actual > 0 ? 100 : 0;
                      const over = r.actual > r.planned + 0.004;
                      return (
                        <tr key={r.category}>
                          <td className="td pl-0">{r.category}</td>
                          <td className="td text-right"><Money value={r.planned} className="text-stone-500" /></td>
                          <td className="td text-right"><Money value={r.actual} /></td>
                          <td className="td hidden sm:table-cell">
                            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100" title={`${Math.round(pct)}% used`}>
                              <div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className={cx('td pr-0 text-right', over ? 'text-rose-700' : 'text-stone-600')}><Money value={r.planned - r.actual} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </ChartCard>

            <ChartCard title="Commitments this month" className="lg:col-span-2">
              <ErrorNote message={payError} />
              {data.commitmentsDue.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">No commitments this month.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {data.commitmentsDue.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 py-1.5">
                      {d.paid ? <CheckCircle2 className="size-4 shrink-0 text-brand-600" /> : <Circle className="size-4 shrink-0 text-stone-300" />}
                      <div className="min-w-0 flex-1">
                        <div className={cx('truncate', d.paid && 'text-stone-500')}>{d.title}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-500"><TypeBadge type={d.type} /> day {d.dueDay}</div>
                      </div>
                      <div className="text-right">
                        <Money value={d.myShare} className="font-medium" />
                        {d.type === 'common' && !isCommon && <div className="num text-[11px] text-stone-400">of {money(d.amount)}</div>}
                      </div>
                      {!d.paid && (
                        <Button size="sm" loading={paying === d.id} onClick={() => pay(d.id)} title="Record the payment as an expense">Mark paid</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
