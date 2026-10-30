import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useMonth } from '../context/MonthContext';
import { addMonths, monthLabel, thisMonth } from '../lib/format';

export function MonthPicker() {
  const { month, setMonth } = useMonth();
  const isCurrent = month === thisMonth();
  return (
    <div className="flex items-center gap-1">
      <button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </button>
      <label className="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 text-sm font-medium hover:bg-stone-50">
        <CalendarDays className="size-3.5 text-stone-500" />
        <span className="min-w-[7.5rem] text-center">{monthLabel(month)}</span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Select month"
        />
      </label>
      <button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
        <ChevronRight className="size-4" />
      </button>
      {!isCurrent && (
        <button className="ml-1 hidden rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 sm:block" onClick={() => setMonth(thisMonth())}>
          Today
        </button>
      )}
    </div>
  );
}
