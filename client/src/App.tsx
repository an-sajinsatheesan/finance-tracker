import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import IncomePage from './pages/Income';
import Commitments from './pages/Commitments';
import Goals from './pages/Goals';
import SettingsPage from './pages/Settings';

export default function App() {
  const { user, workspace, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user || !workspace) {
    return (
      <Routes>
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
        <Route path="goals" element={<Goals />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
