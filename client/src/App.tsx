import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout, ShellSkeleton } from './components/Layout';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import IncomePage from './pages/Income';
import Commitments from './pages/Commitments';
import CommonBills from './pages/CommonBills';
import Contracts from './pages/Contracts';
import Reports from './pages/Reports';
import Goals from './pages/Goals';
import Accounts from './pages/Accounts';
import WealthPage from './pages/Wealth';
import BalancesPage from './pages/Balances';
import SettingsPage from './pages/Settings';

export default function App() {
  const { user, workspace, loading } = useAuth();
  if (loading) return <ShellSkeleton />;
  if (!user || !workspace) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/register" element={<Login initialMode="register" />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (!workspace.setupCompleted) {
    return (
      <Routes>
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="expenses/new" element={<Expenses openNew />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="commitments" element={<Commitments />} />
        <Route path="bills" element={<CommonBills />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="reports" element={<Reports />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="wealth" element={<WealthPage />} />
        <Route path="balances" element={<BalancesPage />} />
        <Route path="goals" element={<Goals />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
