import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, ArrowLeftRight, Wallet, ReceiptText, ClipboardCheck, FileText, BarChart3, Target, Settings, LogOut, CreditCard, Coins, Bell, Clock3, Users, Landmark, Menu, House, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import type { Reminder } from '../lib/types';
import { dateLabel, daysLabel } from '../lib/format';
import { MonthPicker } from './MonthPicker';
import { BlockSkeleton, Logo, Money, Skeleton, StatSkeleton, cx } from './ui';

const NAV_GROUPS = [
  {
    title: 'General',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
      { to: '/expenses', label: 'Expenses', icon: ArrowLeftRight },
      { to: '/income', label: 'Income', icon: Wallet },
      { to: '/commitments', label: 'Commitments', icon: ReceiptText },
      { to: '/bills', label: 'Common bills', icon: ClipboardCheck },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/accounts', label: 'Accounts', icon: CreditCard },
      { to: '/balances', label: 'Balances', icon: Landmark },
      { to: '/wealth', label: 'Wealth', icon: Coins },
      { to: '/contracts', label: 'Contracts', icon: FileText },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/goals', label: 'Goals', icon: Target },
    ],
  },
  {
    title: 'Other',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

const initials = (name?: string) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

function Avatar({ name, className }: { name?: string; className?: string }) {
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-violet-500 font-semibold text-white', className)} title={name}>
      {initials(name)}
    </div>
  );
}

/** Live clock for the header (updates every 30 s), in Dubai time like the app's months, not the device's time zone. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  return (
    <div className="hidden items-center gap-1.5 whitespace-nowrap text-xs font-medium text-stone-600 xl:flex">
      <Clock3 className="size-4 text-stone-500" />
      <span className="num">{time}</span>
      <span className="text-stone-300">|</span>
      <span>{date}</span>
    </div>
  );
}

/** Bill reminders: unpaid commitments that are overdue or due within their reminder window. */
function ReminderBell() {
  const location = useLocation();
  const { data, reload } = useApi<Reminder[]>('/reminders');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { reload(); setOpen(false); }, [location.pathname, reload]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const items = data ?? [];
  const overdue = items.some((r) => r.status === 'overdue');
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative flex size-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50" aria-label={`${items.length} bill reminders`} title="Bill reminders">
        <Bell className="size-[18px]" />
        {items.length > 0 && (
          <span className={cx('absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white', overdue ? 'bg-rose-600' : 'bg-amber-500')}>
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
          <div className="border-b border-stone-200 px-4 py-2.5 text-sm font-semibold">Bills due</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-stone-500">Nothing due in the next few days.</p>
          ) : (
            <ul className="scroll-thin max-h-80 divide-y divide-stone-100 overflow-y-auto">
              {items.map((r) => (
                <li key={`${r.id}-${r.month}`} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className={cx('text-[11px]', r.status === 'overdue' ? 'text-rose-700' : 'text-stone-500')}>
                      {r.status === 'overdue' ? 'Overdue · ' : 'Due '}{dateLabel(r.dueDate)} ({daysLabel(r.daysUntil)})
                    </div>
                  </div>
                  <Money value={r.myShare} className="text-xs font-semibold" />
                </li>
              ))}
            </ul>
          )}
          <Link to="/commitments" className="block border-t border-stone-200 px-4 py-2.5 text-center text-xs font-semibold text-brand-700 hover:bg-stone-50">Open commitments</Link>
        </div>
      )}
    </div>
  );
}

/** Whole-app placeholder while the session is restored. */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden" role="status" aria-label="Loading">
      <aside className="hidden w-64 shrink-0 flex-col gap-2 border-r border-stone-200 bg-white px-6 pt-7 md:flex">
        <div className="mb-6 flex items-center gap-2.5"><Skeleton className="size-9 rounded-xl" /><Skeleton className="h-4 w-28" /></div>
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 rounded-xl" />)}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-56 rounded-xl" /></div>
        <StatSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <BlockSkeleton />
          <BlockSkeleton />
        </div>
      </div>
    </div>
  );
}

const COLLAPSED_KEY = 'sidebar-collapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
};

/** Logo, grouped navigation and workspace card; `collapsed` shows icons only. */
function SidebarContent({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const { workspace, logout } = useAuth();
  const item = (active: boolean) =>
    cx('flex items-center gap-3 rounded-xl py-2.5 text-[15px] transition-colors', collapsed ? 'justify-center px-0' : 'px-3',
      active ? 'bg-brand-50 font-semibold text-brand-800' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900');
  return (
    <>
      <div className={cx('flex items-center gap-2.5 pb-6 pt-7', collapsed ? 'justify-center px-0' : 'px-6')}>
        <Logo />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-tight">{workspace?.name}</div>
            <div className="text-[11px] text-stone-500">{workspace?.mode === 'personal' ? 'Personal finance' : 'Household finance'}</div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close menu"><X className="size-4" /></button>
        )}
      </div>
      <nav className={cx('flex-1', collapsed ? 'px-3' : 'px-4')}>
        {NAV_GROUPS.map((g, i) => (
          <div key={g.title} className={cx(i > 0 && 'mt-3 border-t border-stone-200 pt-3')}>
            {!collapsed && <div className="px-3 pb-1.5 text-xs font-medium text-stone-500">{g.title}</div>}
            <div className="space-y-0.5">
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} title={collapsed ? n.label : undefined} className={({ isActive }) => item(isActive)}>
                  <n.icon className="size-[18px] shrink-0" />
                  {!collapsed && n.label}
                </NavLink>
              ))}
              {g.title === 'Other' && (
                <button onClick={logout} title={collapsed ? 'Logout' : undefined} className={cx(item(false), 'w-full')}>
                  <LogOut className="size-[18px] shrink-0" />
                  {!collapsed && 'Logout'}
                </button>
              )}
            </div>
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="p-4">
          <div className="rounded-2xl border border-brand-200 bg-linear-to-br from-brand-50 to-white p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
              <Users className="size-4" />
              {workspace?.mode === 'personal' ? 'Personal workspace' : 'Shared workspace'}
            </div>
            <div className="mt-1 truncate text-[11px] text-stone-600">{workspace?.members.map((m) => m.displayName).join(' & ')}</div>
          </div>
        </div>
      )}
    </>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawer]);

  // Hamburger: collapses the sidebar on desktop, opens it as a drawer on phones.
  function toggleMenu() {
    if (!window.matchMedia('(min-width: 768px)').matches) { setDrawer((o) => !o); return; }
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* per-browser preference only */ }
      return !c;
    });
  }
  const current = NAV.find((n) => ('end' in n && n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  return (
    // Fixed shell: sidebar and header never move and the body never scrolls; each page scrolls its own area (see Page).
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className={cx('scroll-thin hidden shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-white transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="scroll-thin absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl" role="dialog" aria-label="Menu">
            <SidebarContent onClose={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2.5 md:border-0 md:bg-transparent md:px-6 md:pb-3 md:pt-5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button onClick={toggleMenu} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50" aria-label="Toggle menu" title="Menu">
              <Menu className="size-[18px]" />
            </button>
            <Link to="/" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-white hover:text-brand-700" aria-label="Home" title="Home">
              <House className="size-[18px]" />
            </Link>
            {current && current.to !== '/' && (
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <ChevronRight className="size-4 shrink-0 text-stone-300" />
                <span className="truncate font-semibold text-stone-800">{current.label}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Clock />
            <MonthPicker />
            <ReminderBell />
            <Avatar name={user?.displayName} className="hidden size-10 text-sm md:flex" />
            <button onClick={logout} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav (scrolls sideways when it does not fit) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-stone-200 bg-white md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={'end' in n ? n.end : undefined}
            className={({ isActive }) => cx('flex min-w-[4.5rem] flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', isActive ? 'font-semibold text-brand-700' : 'text-stone-500')}
          >
            <n.icon className="size-[18px]" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
