import {
  CalendarClock, Car, Coins, CreditCard, Fuel, GraduationCap, HeartHandshake, House, Landmark, Plane, Repeat, ShieldCheck,
  ShoppingBag, ShoppingCart, Smartphone, Stethoscope, Tag, UtensilsCrossed, Wifi, Zap, type LucideIcon,
} from 'lucide-react';
import { cx } from './ui';

type Look = { icon: LucideIcon; tone: string };

/** Built-in category codes (server LOOKUP_SEED). */
const BY_CODE: Record<string, Look> = {
  Rent: { icon: House, tone: 'bg-brand-50 text-brand-600' },
  'DEWA/Utilities': { icon: Zap, tone: 'bg-amber-50 text-amber-600' },
  Internet: { icon: Wifi, tone: 'bg-sky-50 text-sky-600' },
  Mobile: { icon: Smartphone, tone: 'bg-cyan-50 text-cyan-700' },
  Grocery: { icon: ShoppingCart, tone: 'bg-emerald-50 text-emerald-600' },
  'Home Loan': { icon: Landmark, tone: 'bg-indigo-50 text-indigo-600' },
  EMI: { icon: CalendarClock, tone: 'bg-violet-50 text-violet-600' },
  'Car Loan': { icon: Car, tone: 'bg-slate-100 text-slate-600' },
  'Credit Card': { icon: CreditCard, tone: 'bg-rose-50 text-rose-600' },
  Chitti: { icon: Coins, tone: 'bg-yellow-50 text-yellow-700' },
  'Family Support': { icon: HeartHandshake, tone: 'bg-pink-50 text-pink-600' },
  Travel: { icon: Plane, tone: 'bg-sky-50 text-sky-600' },
  Fuel: { icon: Fuel, tone: 'bg-orange-50 text-orange-600' },
  Dining: { icon: UtensilsCrossed, tone: 'bg-orange-50 text-orange-600' },
  Shopping: { icon: ShoppingBag, tone: 'bg-fuchsia-50 text-fuchsia-600' },
  Medical: { icon: Stethoscope, tone: 'bg-red-50 text-red-600' },
  Education: { icon: GraduationCap, tone: 'bg-blue-50 text-blue-600' },
  Insurance: { icon: ShieldCheck, tone: 'bg-teal-50 text-teal-600' },
  Subscription: { icon: Repeat, tone: 'bg-purple-50 text-purple-600' },
};

/** Workspace-added and custom categories: guess from the name, else a plain tag. */
const BY_WORD: [RegExp, string][] = [
  [/rent|house|home|apartment|flat/i, 'Rent'], [/electric|water|dewa|utilit|gas/i, 'DEWA/Utilities'], [/internet|wifi|broadband/i, 'Internet'],
  [/mobile|phone/i, 'Mobile'], [/grocer|supermarket|food/i, 'Grocery'], [/loan|emi/i, 'EMI'], [/car|taxi|uber|transport/i, 'Car Loan'],
  [/card/i, 'Credit Card'], [/family|parent|support/i, 'Family Support'], [/travel|flight|trip|holiday/i, 'Travel'],
  [/fuel|petrol/i, 'Fuel'], [/dining|restaurant|cafe|coffee|eat/i, 'Dining'], [/shop|cloth|amazon/i, 'Shopping'],
  [/medic|health|doctor|pharma|hospital/i, 'Medical'], [/school|educat|course|tuition/i, 'Education'], [/insur/i, 'Insurance'],
  [/subscri|netflix|spotify|prime/i, 'Subscription'], [/gold|chit|saving|invest/i, 'Chitti'],
];
const FALLBACK: Look = { icon: Tag, tone: 'bg-stone-100 text-stone-500' };

function lookFor(category: string, custom?: string) {
  if (category !== 'Custom' && BY_CODE[category]) return BY_CODE[category];
  const name = category === 'Custom' ? custom ?? '' : category;
  const hit = BY_WORD.find(([re]) => re.test(name));
  return hit ? BY_CODE[hit[1]] : FALLBACK;
}

/** Tinted icon tile for a category (code, or 'Custom' + its custom name). */
export function CategoryIcon({ category, custom, size = 'md', className }: { category: string; custom?: string; size?: 'sm' | 'md'; className?: string }) {
  const { icon: Icon, tone } = lookFor(category, custom);
  return (
    <span className={cx('flex shrink-0 items-center justify-center', size === 'sm' ? 'size-6 rounded-md' : 'size-8 rounded-lg', tone, className)} aria-hidden>
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />
    </span>
  );
}
