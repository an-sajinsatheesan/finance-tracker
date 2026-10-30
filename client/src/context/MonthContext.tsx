import { createContext, useContext, useState, type ReactNode } from 'react';
import { thisMonth } from '../lib/format';

const KEY = 'ft.month';
interface MonthState { month: string; setMonth: (m: string) => void }
const Ctx = createContext<MonthState | null>(null);

/** The selected calendar month drives every screen and calculation. */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonthState] = useState<string>(() => {
    try { return sessionStorage.getItem(KEY) || thisMonth(); } catch { return thisMonth(); }
  });
  const setMonth = (m: string) => {
    setMonthState(m);
    try { sessionStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ month, setMonth }}>{children}</Ctx.Provider>;
}

export function useMonth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMonth outside MonthProvider');
  return v;
}
