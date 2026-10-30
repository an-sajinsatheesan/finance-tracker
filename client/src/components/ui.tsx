import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { money } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 border-brand-700',
    secondary: 'bg-white text-stone-700 hover:bg-stone-50 border-stone-300',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 border-transparent',
    danger: 'bg-white text-rose-700 hover:bg-rose-50 border-rose-200',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        styles[variant], className,
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  const neg = value < 0;
  return (
    <span className={cx('num whitespace-nowrap', neg && 'text-rose-700', className)}>
      {signed && value > 0 ? '+' : ''}{money(value)}
    </span>
  );
}

export function Badge({ tone = 'stone', children }: { tone?: 'stone' | 'brand' | 'amber' | 'rose' | 'sky' | 'violet'; children: ReactNode }) {
  const t = {
    stone: 'bg-stone-100 text-stone-600',
    brand: 'bg-brand-50 text-brand-800',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-800',
    violet: 'bg-violet-50 text-violet-800',
  }[tone];
  return <span className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', t)}>{children}</span>;
}

export const TypeBadge = ({ type }: { type: 'personal' | 'common' }) =>
  type === 'common' ? <Badge tone="violet">Common</Badge> : <Badge tone="sky">Personal</Badge>;

export function Modal({ open, onClose, title, children, footer, wide }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/30 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-stone-500">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
      <AlertCircle className="mt-px size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex rounded-md border border-stone-200 bg-stone-100 p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            'rounded px-3 py-1 text-xs font-medium transition-colors',
            value === i.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800',
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="ml-1 text-stone-400">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      {icon && <div className="mb-2 text-stone-300">{icon}</div>}
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {children && <div className="mt-1 text-xs text-stone-500">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-10 text-stone-400"><Loader2 className="size-5 animate-spin" /></div>;
}
