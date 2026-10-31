import { Calendar } from 'primereact/calendar';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonth } from '../context/MonthContext';
import { addMonths, thisMonth } from '../lib/format';
import { Button } from './ui';

export function MonthPicker() {
  const { month, setMonth } = useMonth();
  const isCurrent = month === thisMonth();
  const [y, m] = month.split('-').map(Number);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-0.5">
      <button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </button>
      <Calendar
        value={new Date(y, m - 1, 1)}
        onChange={(e) => e.value instanceof Date && setMonth(`${e.value.getFullYear()}-${String(e.value.getMonth() + 1).padStart(2, '0')}`)}
        view="month"
        dateFormat="MM yy"
        readOnlyInput
        aria-label="Select month"
        inputClassName="!w-32 !border-0 !shadow-none text-center !font-semibold cursor-pointer"
      />
      <button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
        <ChevronRight className="size-4" />
      </button>
      {!isCurrent && <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => setMonth(thisMonth())}>Today</Button>}
    </div>
  );
}
