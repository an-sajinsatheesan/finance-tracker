const nf = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });

export const money = (n: number | undefined | null) => nf.format(n ?? 0);
export const money0 = (n: number | undefined | null) => nf0.format(n ?? 0);
export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 10000) return `${nf0.format(n / 1000)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return nf0.format(n);
};

export function monthLabel(m: string, style: 'long' | 'short' = 'long') {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: style, year: 'numeric', timeZone: 'UTC' });
}
export const monthShort = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
};
export function dateLabel(d?: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/** Today (YYYY-MM-DD) in Dubai time, matching the server's month boundaries. */
export const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const thisMonth = () => todayStr().slice(0, 7);

export function addMonths(m: string, delta: number) {
  const [y, mo] = m.split('-').map(Number);
  const i = y * 12 + mo - 1 + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export const categoryLabel = (c: string, custom?: string) => (c === 'Custom' && custom ? custom : c);
