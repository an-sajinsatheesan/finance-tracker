import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorText } from '../lib/api';
import { Button, ErrorNote, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">AED</div>
          <div>
            <h1 className="text-base font-semibold">Household Finance</h1>
            <p className="text-xs text-stone-500">Shared workspace for two</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-3 p-5">
          <Field label="Username">
            <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorNote message={error} />
          <Button variant="primary" className="w-full" loading={busy} type="submit">
            <Lock className="size-3.5" /> Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
