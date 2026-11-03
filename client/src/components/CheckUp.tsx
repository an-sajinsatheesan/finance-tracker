import { AlertTriangle, CheckCircle2, Info, Lightbulb, TrendingDown } from 'lucide-react';
import type { CheckUp as Result, Level } from '../lib/insights';
import { money } from '../lib/format';
import { cx } from './ui';

const ICON: Record<Level, { icon: typeof Info; cls: string }> = {
  good: { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
  watch: { icon: TrendingDown, cls: 'text-amber-600 bg-amber-50' },
  alert: { icon: AlertTriangle, cls: 'text-rose-600 bg-rose-50' },
  info: { icon: Info, cls: 'text-sky-600 bg-sky-50' },
};

/** 50/30/20 bar: essentials, wants and savings as shares of income, with the rule's targets marked. */
function SplitBar({ r }: { r: Result }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const needs = clamp(r.split.needs);
  const wants = clamp(Math.min(r.split.wants, 100 - needs));
  const savings = clamp(Math.min(r.split.savings, 100 - needs - wants));
  const parts = [
    { label: 'Essentials', value: r.split.needs, target: '≤ 50%', width: needs, color: 'bg-amber-400', ok: r.split.needs <= 50 },
    { label: 'Wants', value: r.split.wants, target: '≤ 30%', width: wants, color: 'bg-violet-400', ok: r.split.wants <= 30 },
    { label: 'Savings', value: r.split.savings, target: '≥ 20%', width: savings, color: 'bg-emerald-500', ok: r.split.savings >= 20 },
  ];
  return (
    <div>
      <div className="relative flex h-3 overflow-hidden rounded-full bg-stone-100">
        {parts.map((x) => <div key={x.label} className={x.color} style={{ width: `${x.width}%` }} title={`${x.label} ${Math.round(x.value)}%`} />)}
        <span className="absolute inset-y-0 left-1/2 w-px bg-stone-700/60" title="50% target for essentials" />
        <span className="absolute inset-y-0 left-[80%] w-px bg-stone-700/60" title="80%: essentials + wants" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        {parts.map((x) => (
          <div key={x.label}>
            <div className="flex items-center gap-1.5 text-stone-600"><span className={cx('size-2 rounded-full', x.color)} />{x.label}</div>
            <div className={cx('num text-sm font-semibold', x.ok ? 'text-stone-900' : 'text-rose-700')}>{Math.round(x.value)}% <span className="text-[11px] font-normal text-stone-400">target {x.target}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Money check-up card: rules of thumb a financial planner commonly starts from, applied to
 * the month's income and spending. Not personal financial advice.
 */
export function CheckUpCard({ title, subtitle, result, className }: { title: string; subtitle?: string; result: Result; className?: string }) {
  return (
    <section className={cx('card min-w-0 p-4', className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Lightbulb className="size-4 text-amber-500" />{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>}
        </div>
        {result.income > 0 && (
          <div className="text-right text-[11px] text-stone-500">
            Income <span className="num font-medium text-stone-800">{money(result.income)}</span><br />
            Spent <span className="num font-medium text-stone-800">{money(result.spent)}</span>
          </div>
        )}
      </div>
      {result.income > 0 && <SplitBar r={result} />}
      <ul className="mt-3 space-y-2">
        {result.insights.map((i) => {
          const s = ICON[i.level];
          return (
            <li key={i.key} className="flex gap-2.5">
              <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', s.cls)}><s.icon className="size-3.5" /></span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-stone-800">{i.title}</div>
                <div className="text-[11px] leading-4 text-stone-500">{i.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-stone-100 pt-2 text-[10px] text-stone-400">General rules of thumb (50/30/20, 20% savings, rent ≤ 30%, debt ≤ 36%, 3–6 months emergency fund). Not personal financial advice.</p>
    </section>
  );
}
