import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Message } from 'primereact/message';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorText } from '../lib/api';
import { Button, Field, PasswordInput, Spinner, TextInput } from '../components/ui';
import { AuthShell } from './Login';

interface InviteInfo { email: string; workspaceName: string; invitedBy: string; displayName: string }
type F = 'name' | 'password' | 'confirm';

/** Public page behind the emailed link: the partner sets a password and joins the workspace. */
export default function AcceptInvite() {
  const { token = '' } = useParams();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InviteInfo>(`/invitations/${token}`)
      .then((i) => { setInfo(i); setName(i.displayName); })
      .catch((e) => setLoadError(errorText(e)));
  }, [token]);

  const errors: Partial<Record<F, string>> = {
    name: !name.trim() ? 'Enter your name' : undefined,
    password: !password ? 'Create a password' : password.length < 8 ? 'Use at least 8 characters' : undefined,
    confirm: !confirm ? 'Re-enter your password' : confirm !== password ? 'Passwords don’t match' : undefined,
  };
  const show = (k: F) => ((touched[k] || submitted) ? errors[k] : undefined);
  const blur = (k: F) => () => setTouched((t) => ({ ...t, [k]: true }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setAlert(null);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await acceptInvite(token, password, name.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setAlert(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 lg:border-0 lg:p-0 lg:shadow-none">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Heart className="size-5" /></div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">You’re invited</h2>
            <p className="text-sm text-stone-500">Join a shared household workspace</p>
          </div>
        </div>
        {!info && !loadError && <Spinner />}
        {loadError && (
          <div className="space-y-4">
            <Message severity="error" text={loadError} className="w-full justify-start" />
            <Link to="/" className="text-sm font-medium text-brand-700 hover:underline">Go to sign in</Link>
          </div>
        )}
        {info && (
          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm text-stone-600">
              <b>{info.invitedBy}</b> invited you to <b>{info.workspaceName}</b>. Choose a password to finish.
            </p>
            {alert && <Message severity="error" text={alert} className="w-full justify-start" />}
            <Field label="Email address"><TextInput value={info.email} onChange={() => undefined} disabled /></Field>
            <Field label="Your name" htmlFor="inv-name" required error={show('name')}>
              <TextInput id="inv-name" value={name} onChange={setName} onBlur={blur('name')} invalid={!!show('name')} maxLength={50} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Password" htmlFor="inv-pass" required error={show('password')} hint="At least 8 characters">
                <PasswordInput id="inv-pass" value={password} onChange={setPassword} onBlur={blur('password')} invalid={!!show('password')} autoComplete="new-password" autoFocus />
              </Field>
              <Field label="Confirm password" htmlFor="inv-confirm" required error={show('confirm')}>
                <PasswordInput id="inv-confirm" value={confirm} onChange={setConfirm} onBlur={blur('confirm')} invalid={!!show('confirm')} autoComplete="new-password" />
              </Field>
            </div>
            <Button variant="primary" className="w-full !py-2.5" type="submit" loading={busy}>Join workspace</Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
