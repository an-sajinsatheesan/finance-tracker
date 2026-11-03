import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb, TrendingDown } from 'lucide-react';
import type { CheckUp as Result, Insight, Level } from '../lib/insights';
import { money } from '../lib/format';
import { cx } from './ui';

const ICON: Record<Level, { icon: typeof Info; cls: string }> = {
  good: { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
  watch: { icon: TrendingDown, cls: 'text-amber-600 bg-amber-50' },
  alert: { icon: AlertTriangle, cls: 'text-rose-600 bg-rose-50' },
  info: { icon: Info, cls: 'text-sky-600 bg-sky-50' },
};

function InsightRow({ i }: { i: Insight }) {
  const s = ICON[i.level];
  return (
    <li className="flex gap-2.5">
      <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', s.cls)}><s.icon className="size-3.5" /></span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-stone-800">{i.title}</div>
        <div className="text-[11px] leading-4 text-stone-500">{i.detail}</div>
      </div>
    </li>
  );
}

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
export function CheckUpCard({ title, subtitle, result, className, compact }: {
  title: string; subtitle?: string; result: Result; className?: string;
  /** One summary row; the full list opens on demand (dashboard). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (compact) {
    const count = (l: Level) => result.insights.filter((i) => i.level === l).length;
    const flagged = result.insights.filter((i) => i.level === 'alert' || i.level === 'watch');
    return (
      <section className={cx('card min-w-0 text-xs', className)}>
        <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Lightbulb className="size-4 text-amber-500" />{title}</span>
          {result.income > 0 && (
            <span className="flex min-w-48 flex-1 items-center gap-2">
              <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                <span className="bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, result.split.needs))}%` }} />
                <span className="bg-violet-400" style={{ width: `${Math.max(0, Math.min(100 - result.split.needs, result.split.wants))}%` }} />
                <span className="bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100 - result.split.needs - result.split.wants, result.split.savings))}%` }} />
              </span>
              <span className="num shrink-0 text-[11px] text-stone-500">{Math.round(result.split.needs)} / {Math.round(result.split.wants)} / {Math.round(result.split.savings)}</span>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-2 text-[11px]">
            {count('good') > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{count('good')} on track</span>}
            {count('watch') > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{count('watch')} to watch</span>}
            {count('alert') > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">{count('alert')} needs attention</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium text-brand-700">
            {open ? 'Hide' : 'Details'} <ChevronDown className={cx('size-3.5 transition-transform', open && 'rotate-180')} />
          </span>
          {!open && flagged.length > 0 && (
            <span className="w-full truncate text-[11px] text-stone-500">{flagged.map((i) => i.title).join(' · ')}</span>
          )}
        </button>
        {open && (
          <div className="border-t border-stone-100 px-4 py-3">
            {result.income > 0 && <SplitBar r={result} />}
            <ul className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
              {result.insights.map((i) => <InsightRow key={i.key} i={i} />)}
            </ul>
            <p className="mt-3 text-[10px] text-stone-400">General rules of thumb (50/30/20, 20% savings, rent ≤ 30%, debt ≤ 36%, 3–6 months emergency fund). Not personal financial advice.</p>
          </div>
        )}
      </section>
    );
  }
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
        {result.insights.map((i) => <InsightRow key={i.key} i={i} />)}
      </ul>
      <p className="mt-3 border-t border-stone-100 pt-2 text-[10px] text-stone-400">General rules of thumb (50/30/20, 20% savings, rent ≤ 30%, debt ≤ 36%, 3–6 months emergency fund). Not personal financial advice.</p>
    </section>
  );
}
