/**
 * Shared UI built on PrimeReact. Pages use these wrappers instead of raw
 * PrimeReact components so sizes, colours and value formats stay consistent:
 * dates are 'YYYY-MM-DD' strings, months 'YYYY-MM', amounts number | null.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataTablePageEvent } from 'primereact/datatable';
import { Button as PButton, type ButtonProps } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { Password } from 'primereact/password';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'primereact/toast';
import { confirmDialog } from 'primereact/confirmdialog';
import { AlertCircle, Wallet } from 'lucide-react';
import { money } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------------- Buttons ----------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', loading, className, children, icon, ...rest }:
  Omit<ButtonProps, 'size' | 'icon'> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  const look: Record<Variant, Partial<ButtonProps>> = {
    primary: {},
    secondary: { outlined: true, severity: 'secondary' },
    ghost: { text: true, severity: 'secondary' },
    danger: { outlined: true, severity: 'danger' },
  };
  return (
    <PButton
      type="button"
      {...look[variant]}
      {...rest}
      size={size === 'sm' ? 'small' : undefined}
      loading={loading}
      className={cx('inline-flex items-center justify-center', size === 'sm' && 'p-button-sm', className)}
    >
      {!loading && icon}
      {children}
    </PButton>
  );
}

/** Small icon-only action (edit, delete …) used in table rows. */
export function IconButton({ title, onClick, children, danger, disabled }: { title: string; onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cx('rounded p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-40', danger ? 'hover:text-rose-600' : 'hover:text-stone-700')}
    >
      {children}
    </button>
  );
}

// ---------------- Display ----------------

/** App mark (lucide icon on the brand tile). */
export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = { sm: 'size-7 rounded-lg', md: 'size-9 rounded-xl', lg: 'size-10 rounded-xl' }[size];
  return (
    <div className={cx('flex shrink-0 items-center justify-center bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30', box, className)}>
      <Wallet className={size === 'sm' ? 'size-4' : 'size-5'} />
    </div>
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

type Tone = 'stone' | 'brand' | 'amber' | 'rose' | 'sky' | 'violet';
const TONE: Record<Tone, string> = {
  stone: '!bg-stone-100 !text-stone-600',
  brand: '!bg-brand-50 !text-brand-800',
  amber: '!bg-amber-50 !text-amber-800',
  rose: '!bg-rose-50 !text-rose-700',
  sky: '!bg-sky-50 !text-sky-800',
  violet: '!bg-violet-50 !text-violet-800',
};
export function Badge({ tone = 'stone', children }: { tone?: Tone; children: ReactNode }) {
  return <Tag className={TONE[tone]}>{children}</Tag>;
}

export const TypeBadge = ({ type }: { type: 'personal' | 'common' }) =>
  type === 'common' ? <Badge tone="violet">Common</Badge> : <Badge tone="sky">Personal</Badge>;

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Message severity="error" text={message} className="w-full justify-start" />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Page body. The app shell never scrolls; each page owns its scroll area.
 * `fill` pages size to the screen so their table scrolls inside itself
 * (see TableCard); if the screen is too short they fall back to scrolling.
 */
export function Page({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={cx('scroll-thin min-h-0 flex-1 overflow-y-auto', fill && 'flex flex-col')}>
      <div className={cx('mx-auto w-full max-w-384 px-4 pb-24 pt-1 md:px-6 md:pb-6', fill && 'flex min-h-0 flex-1 flex-col')}>
        {children}
      </div>
    </div>
  );
}

/**
 * Pagination props for a DataTable (spread them onto it). Goes back to the first
 * page whenever `resetOn` changes (month, filters, tab), so a page never points past the end.
 */
export function usePaging(resetOn: unknown, rows = 10) {
  const [state, setState] = useState({ first: 0, rows });
  const key = JSON.stringify(resetOn);
  useEffect(() => setState((s) => ({ ...s, first: 0 })), [key]);
  return {
    paginator: true,
    alwaysShowPaginator: true,
    first: state.first,
    rows: state.rows,
    rowsPerPageOptions: [...new Set([rows, 10, 25, 50, 100])].sort((a, b) => a - b),
    onPage: (e: DataTablePageEvent) => setState({ first: e.first, rows: e.rows }),
    paginatorTemplate: 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport',
    currentPageReportTemplate: '{first}–{last} of {totalRecords}',
  };
}

/** Card that holds a DataTable on a `fill` page: grows to the remaining height, the rows scroll, the header stays. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card table-fill flex min-h-64 flex-1 flex-col overflow-hidden', className)}>{children}</div>;
}

/** Segmented control (PrimeReact SelectButton). Never allows an empty selection. */
export function Tabs<T extends string>({ value, onChange, items, full }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; full?: boolean }) {
  return (
    <SelectButton
      value={value}
      onChange={(e) => e.value !== null && e.value !== undefined && onChange(e.value as T)}
      options={items}
      optionValue="value"
      allowEmpty={false}
      className={full ? 'segmented-full' : undefined}
      itemTemplate={(i: { label: string; count?: number }) => (
        <span>{i.label}{i.count !== undefined && <span className="ml-1 opacity-60">{i.count}</span>}</span>
      )}
    />
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
  return <div className="flex justify-center py-10"><ProgressSpinner style={{ width: 28, height: 28 }} strokeWidth="5" /></div>;
}

// ---------------- Skeletons ----------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

const ROW_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3'];
/** Placeholder rows; used as a DataTable's emptyMessage while its first load is in flight, so the headers stay put. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-stone-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-3.5 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className={c === 0 ? 'flex-2' : 'flex-1'}>
              <Skeleton className={cx('h-3', ROW_WIDTHS[(r + c) % ROW_WIDTHS.length])} />
              {c === 0 && <Skeleton className="mt-1.5 h-2.5 w-1/3" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Stat-tile placeholders. */
export function StatSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cx('grid gap-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card px-4 py-4">
          <div className="flex items-center gap-2"><Skeleton className="size-8 rounded-lg" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="mt-4 h-6 w-36" />
          <Skeleton className="mt-3 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A card-sized block with a title bar, for charts and panels. */
export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('card flex flex-col p-4', className)} role="status" aria-label="Loading">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="mt-4 min-h-24 flex-1 rounded-xl" />
    </div>
  );
}

// ---------------- Dialog ----------------

const DIALOG_WIDTH = { md: '28rem', lg: '42rem', xl: '72rem' } as const;
export function Modal({ open, onClose, title, children, footer, wide, size }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; size?: keyof typeof DIALOG_WIDTH }) {
  const w = DIALOG_WIDTH[size ?? (wide ? 'lg' : 'md')];
  return (
    <Dialog
      visible={open}
      onHide={onClose}
      header={title}
      footer={footer ? <div className="flex justify-end gap-2">{footer}</div> : undefined}
      style={{ width: w }}
      breakpoints={{ '1280px': size === 'xl' ? '94vw' : w, '640px': '100vw' }}
      modal
      dismissableMask
      draggable={false}
      blockScroll
    >
      {open && children}
    </Dialog>
  );
}

// ---------------- Form controls ----------------

/** Label + control. A <div>, not a <label>, so clicks never jump to another control. */
export function Field({ label, children, hint, className, error, required, htmlFor }: {
  label: string; children: ReactNode; hint?: ReactNode; className?: string; error?: string | null; required?: boolean; htmlFor?: string;
}) {
  return (
    <div className={cx('block min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}{required && <span className="ml-0.5 text-rose-600" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error
        ? <span role="alert" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="size-3 shrink-0" />{error}</span>
        : hint && <span className="mt-1 block text-[11px] text-stone-500">{hint}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, className, invalid, ...rest }:
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return <InputText {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={cx('w-full', invalid && 'p-invalid', className)} />;
}

export function PasswordInput({ value, onChange, autoComplete, required, minLength, autoFocus, invalid, onBlur, id, placeholder }: {
  value: string; onChange: (v: string) => void; autoComplete?: string; required?: boolean; minLength?: number; autoFocus?: boolean;
  invalid?: boolean; onBlur?: () => void; id?: string; placeholder?: string;
}) {
  return (
    <Password
      inputId={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      feedback={false}
      toggleMask
      required={required}
      autoFocus={autoFocus}
      placeholder={placeholder}
      invalid={invalid}
      inputClassName={cx('w-full', invalid && 'p-invalid')}
      className="w-full"
      pt={{ input: { autoComplete, minLength, 'aria-invalid': invalid || undefined } as never }}
    />
  );
}

/** Amount input. Returns null when empty. */
export function NumberInput({ value, onChange, min, max, decimals = 2, placeholder, required, disabled, autoFocus, ariaLabel, className, title }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; decimals?: number;
  placeholder?: string; required?: boolean; disabled?: boolean; autoFocus?: boolean; ariaLabel?: string; className?: string; title?: string;
}) {
  return (
    <InputNumber
      value={value}
      onValueChange={(e) => onChange(e.value ?? null)}
      mode="decimal"
      minFractionDigits={decimals ? Math.min(decimals, 2) : 0}
      maxFractionDigits={decimals}
      min={min}
      max={max}
      useGrouping
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      tooltip={title}
      className={cx('w-full', decimals ? 'text-right' : '', className)}
      inputClassName="w-full"
    />
  );
}

export interface Option { label: string; value: string; disabled?: boolean }
export function Select({ value, onChange, options, placeholder, disabled, filter, className, ariaLabel, showClear, invalid, id }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean;
  filter?: boolean; className?: string; ariaLabel?: string; showClear?: boolean; invalid?: boolean; id?: string;
}) {
  return (
    <Dropdown
      value={value || null}
      onChange={(e) => onChange((e.value as string | null) ?? '')}
      options={options}
      optionLabel="label"
      optionValue="value"
      optionDisabled="disabled"
      placeholder={placeholder}
      disabled={disabled}
      filter={filter ?? options.length > 8}
      showClear={showClear}
      aria-label={ariaLabel}
      inputId={id}
      invalid={invalid}
      className={cx('w-full', invalid && 'p-invalid', className)}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (s?: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
const fromDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date picker on 'YYYY-MM-DD' strings. */
export function DateInput({ value, onChange, min, max, required, disabled }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; required?: boolean; disabled?: boolean;
}) {
  return (
    <Calendar
      value={toDate(value)}
      onChange={(e) => e.value instanceof Date && onChange(fromDate(e.value))}
      dateFormat="dd M yy"
      minDate={toDate(min) ?? undefined}
      maxDate={toDate(max) ?? undefined}
      required={required}
      disabled={disabled}
      showIcon
      readOnlyInput
      className="w-full"
    />
  );
}

/** Month picker on 'YYYY-MM' strings. Empty string = no month (when clearable). */
export function MonthInput({ value, onChange, min, max, clearable, placeholder, required }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; clearable?: boolean; placeholder?: string; required?: boolean;
}) {
  return (
    <Calendar
      value={toDate(value)}
      onChange={(e) => (e.value instanceof Date ? onChange(fromDate(e.value).slice(0, 7)) : clearable && onChange(''))}
      view="month"
      dateFormat="M yy"
      minDate={toDate(min) ?? undefined}
      maxDate={max ? new Date(Number(max.slice(0, 4)), Number(max.slice(5, 7)), 0) : undefined}
      showButtonBar={clearable}
      placeholder={placeholder}
      required={required}
      showIcon
      readOnlyInput
      className="w-full"
    />
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  const id = useRef(`chk-${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-stone-600">
      <Checkbox inputId={id} checked={checked} onChange={(e) => onChange(!!e.checked)} />
      <label htmlFor={id} className="cursor-pointer select-none">{label}</label>
    </span>
  );
}

// ---------------- Toast & confirm ----------------

interface ToastApi { success: (text: string, title?: string) => void; error: (text: string, title?: string) => void; info: (text: string, title?: string) => void }
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Toast>(null);
  const show = useCallback((severity: 'success' | 'error' | 'info', summary: string, detail: string) => {
    ref.current?.show({ severity, summary, detail, life: severity === 'error' ? 6000 : 3000 });
  }, []);
  const api = useMemo<ToastApi>(() => ({
    success: (t, title = 'Saved') => show('success', title, t),
    error: (t, title = 'Something went wrong') => show('error', title, t),
    info: (t, title = 'Note') => show('info', title, t),
  }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      <Toast ref={ref} position="top-right" />
      {children}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}

/** Confirmation before any delete/archive. `onAccept` may be async. */
export function confirmAction(opts: { header: string; message: ReactNode; acceptLabel?: string; danger?: boolean; onAccept: () => unknown }) {
  confirmDialog({
    header: opts.header,
    message: <div className="max-w-sm text-sm text-stone-600">{opts.message}</div>,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: opts.acceptLabel ?? 'Delete',
    rejectLabel: 'Cancel',
    acceptClassName: opts.danger === false ? undefined : 'p-button-danger',
    rejectClassName: 'p-button-text p-button-secondary',
    defaultFocus: 'reject',
    accept: () => { void opts.onAccept(); },
  });
}
