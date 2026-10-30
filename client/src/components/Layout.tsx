import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Receipt, Wallet, CalendarClock, Target, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MonthPicker } from './MonthPicker';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/income', label: 'Income', icon: Wallet },
  { to: '/commitments', label: 'Commitments', icon: CalendarClock },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const { user, workspace, logout } = useAuth();
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-stone-200 px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-brand-700 text-xs font-bold text-white">AED</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{workspace?.name}</div>
            <div className="text-[11px] text-stone-500">Household finance</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm', isActive ? 'bg-stone-100 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-50')
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-2">
          <div className="flex items-center justify-between rounded-md px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.displayName}</div>
              <div className="text-[11px] text-stone-500">@{user?.username}</div>
            </div>
            <button onClick={logout} className="rounded p-1.5 text-stone-500 hover:bg-stone-100" title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-stone-200 bg-stone-50/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex size-7 items-center justify-center rounded-md bg-brand-700 text-[10px] font-bold text-white">AED</div>
            <span className="text-sm font-semibold">{user?.displayName}</span>
          </div>
          <div className="hidden text-xs text-stone-500 md:block">Signed in as {user?.displayName}</div>
          <div className="flex items-center gap-1">
            <MonthPicker />
            <button onClick={logout} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-stone-200 bg-white md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px]', isActive ? 'text-brand-700' : 'text-stone-500')}
          >
            <n.icon className="size-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
