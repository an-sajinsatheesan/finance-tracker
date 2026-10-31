import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Message } from 'primereact/message';
import { BellRing, CheckCircle2, Heart, Landmark, Lock, PieChart, ShieldCheck, User, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError, errorText } from '../lib/api';
import { Button, Field, Logo, PasswordInput, Select, Tabs, TextInput, cx } from '../components/ui';

type Mode = 'login' | 'register';

// Relationship values match the seeded "relationship" lookup codes (the list is not loaded before sign-in).
const RELATIONSHIPS = ['Husband', 'Wife', 'Partner'].map((r) => ({ label: r, value: r }));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Tiny form-state helper: errors are computed from the values and shown for a
 * field once it has been left (blurred) or after the first submit attempt.
 */
function useValidation<K extends string>(validate: () => Partial<Record<K, string>>) {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<K, string>>>({});
  const errors = validate();
  const show = (k: K) => serverErrors[k] ?? ((touched[k] || submitted) ? errors[k] : undefined);
  return {
    errors,
    show,
    blur: (k: K) => () => setTouched((t) => ({ ...t, [k]: true })),
    /** Clears a server error as soon as the user edits that field. */
    edited: (k: K) => serverErrors[k] && setServerErrors((e) => ({ ...e, [k]: undefined })),
    setServerError: (k: K, msg: string) => setServerErrors((e) => ({ ...e, [k]: msg })),
    trySubmit: () => { setSubmitted(true); return Object.values(errors).every((v) => !v); },
  };
}

function FormAlert({ text }: { text: string | null }) {
  if (!text) return null;
  return <Message severity="error" text={text} className="w-full justify-start" />;
}

// ---------------- Sign in ----------------

function SignIn({ onRegister }: { onRegister: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v = useValidation<'email' | 'password'>(() => ({
    email: !email.trim() ? 'Enter your email address' : undefined,
    password: !password ? 'Enter your password' : undefined,
  }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!v.trySubmit()) return;
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setAlert(err instanceof ApiError && err.status === 401 ? 'The email or password is incorrect. Please try again.' : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
        <p className="mt-1 text-sm text-stone-500">Sign in to your household workspace.</p>
      </div>
      <FormAlert text={alert} />
      <Field label="Email address" htmlFor="login-email" error={v.show('email')}>
        <TextInput id="login-email" type="email" value={email} onChange={(x) => { setEmail(x); setAlert(null); }} onBlur={v.blur('email')}
          invalid={!!v.show('email')} autoComplete="username" autoCapitalize="none" placeholder="you@example.com" autoFocus />
      </Field>
      <Field label="Password" htmlFor="login-password" error={v.show('password')}>
        <PasswordInput id="login-password" value={password} onChange={(x) => { setPassword(x); setAlert(null); }} onBlur={v.blur('password')}
          invalid={!!v.show('password')} autoComplete="current-password" placeholder="Your password" />
      </Field>
      <Button variant="primary" className="w-full !py-2.5" loading={busy} type="submit" icon={<Lock className="size-4" />}>Sign in</Button>
      <p className="text-center text-xs text-stone-500">
        New here? <button type="button" className="font-medium text-brand-700 hover:underline" onClick={onRegister}>Create an account</button>
      </p>
    </form>
  );
}

// ---------------- Register ----------------

type RegField = 'displayName' | 'email' | 'password' | 'confirm' | 'partnerName' | 'partnerEmail';

function Register({ onSignIn }: { onSignIn: () => void }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    mode: 'couple' as 'personal' | 'couple',
    displayName: '', email: '', password: '', confirm: '', relationship: 'Husband',
    partnerName: '', partnerEmail: '', partnerRelationship: 'Wife',
  });
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const couple = f.mode === 'couple';
  const v = useValidation<RegField>(() => ({
    displayName: !f.displayName.trim() ? 'Enter your name' : f.displayName.length > 50 ? 'Use 50 characters or fewer' : undefined,
    email: !f.email.trim() ? 'Enter your email address' : !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address, like name@example.com' : undefined,
    password: !f.password ? 'Create a password' : f.password.length < 8 ? 'Use at least 8 characters' : undefined,
    confirm: !f.confirm ? 'Re-enter your password' : f.confirm !== f.password ? 'Passwords don’t match' : undefined,
    partnerName: couple && !f.partnerName.trim() ? 'Enter your partner’s name' : undefined,
    partnerEmail: couple && f.partnerEmail.trim()
      ? !EMAIL_RE.test(f.partnerEmail.trim()) ? 'Enter a valid email address'
        : f.partnerEmail.trim().toLowerCase() === f.email.trim().toLowerCase() ? 'Your partner needs a different email address' : undefined
      : undefined,
  }));
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: val }));
    setAlert(null);
    if (k !== 'mode' && k !== 'relationship' && k !== 'partnerRelationship') v.edited(k as RegField);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!v.trySubmit()) return;
    setBusy(true);
    try {
      const invite = await register({
        mode: f.mode, displayName: f.displayName.trim(), email: f.email.trim(), password: f.password,
        relationship: couple ? f.relationship : 'Self',
        partner: couple ? { displayName: f.partnerName.trim(), email: f.partnerEmail.trim(), relationship: f.partnerRelationship } : null,
      });
      // The invitation result is shown once on the setup screen.
      if (invite) sessionStorage.setItem('ft.invite', JSON.stringify(invite));
      navigate('/', { replace: true });
    } catch (err) {
      const msg = errorText(err);
      // Put "already exists" on the right field instead of a generic banner.
      if (err instanceof ApiError && err.status === 409) {
        if (f.partnerEmail && msg.toLowerCase().includes(f.partnerEmail.trim().toLowerCase())) v.setServerError('partnerEmail', 'This email already has an account');
        else v.setServerError('email', 'An account with this email already exists. Sign in instead.');
      } else {
        setAlert(msg);
      }
      setBusy(false);
    }
  }

  const ModeOption = ({ value, icon: Icon, title, text }: { value: 'personal' | 'couple'; icon: typeof User; title: string; text: string }) => (
    <label
      htmlFor={`mode-${value}`}
      className={cx('flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-brand-300',
        f.mode === value ? 'border-brand-300 bg-linear-to-br from-white to-brand-50 ring-1 ring-brand-300' : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50')}
    >
      {/* Native radio (visually hidden) keeps arrow-key selection; the card shows the state. */}
      <input type="radio" id={`mode-${value}`} name="mode" value={value} checked={f.mode === value} onChange={() => set('mode', value)} className="sr-only" />
      <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white', f.mode === value ? 'border-brand-200 text-brand-600' : 'border-stone-200 text-stone-400')}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-stone-500">{text}</span>
      </span>
      {f.mode === value && <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden />}
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Create your account</h2>
        <p className="mt-1 text-sm text-stone-500">Set up a workspace for yourself, or for you and your partner.</p>
      </div>
      <FormAlert text={alert} />
      <div className="grid grid-cols-2 gap-2">
        <ModeOption value="personal" icon={User} title="Just me" text="Personal finances" />
        <ModeOption value="couple" icon={Heart} title="A couple" text="Costs split 50/50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" htmlFor="reg-name" required error={v.show('displayName')} className={couple ? '' : 'col-span-2'}>
          <TextInput id="reg-name" value={f.displayName} onChange={(x) => set('displayName', x)} onBlur={v.blur('displayName')} invalid={!!v.show('displayName')} maxLength={50} autoComplete="name" placeholder="Your name" />
        </Field>
        {couple && <Field label="You are the" htmlFor="reg-rel"><Select id="reg-rel" value={f.relationship} onChange={(x) => set('relationship', x)} options={RELATIONSHIPS} /></Field>}
      </div>
      <Field label="Email address" htmlFor="reg-email" required error={v.show('email')}>
        <TextInput id="reg-email" type="email" value={f.email} onChange={(x) => set('email', x)} onBlur={v.blur('email')} invalid={!!v.show('email')} autoComplete="email" placeholder="you@example.com" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Password" htmlFor="reg-pass" required error={v.show('password')} hint="At least 8 characters">
          <PasswordInput id="reg-pass" value={f.password} onChange={(x) => set('password', x)} onBlur={v.blur('password')} invalid={!!v.show('password')} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" htmlFor="reg-confirm" required error={v.show('confirm')}>
          <PasswordInput id="reg-confirm" value={f.confirm} onChange={(x) => set('confirm', x)} onBlur={v.blur('confirm')} invalid={!!v.show('confirm')} autoComplete="new-password" />
        </Field>
      </div>
      {couple && (
        <fieldset className="space-y-3 rounded-2xl border border-violet-100 bg-linear-to-br from-white to-violet-50 p-4">
          <legend className="sr-only">Your partner</legend>
          <div className="flex items-center gap-2.5" aria-hidden>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-white text-violet-500"><Heart className="size-4" /></span>
            <span className="text-sm font-semibold text-stone-800">Your partner</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="reg-pname" required error={v.show('partnerName')}>
              <TextInput id="reg-pname" value={f.partnerName} onChange={(x) => set('partnerName', x)} onBlur={v.blur('partnerName')} invalid={!!v.show('partnerName')} maxLength={50} placeholder="Partner’s name" />
            </Field>
            <Field label="Relationship" htmlFor="reg-prel"><Select id="reg-prel" value={f.partnerRelationship} onChange={(x) => set('partnerRelationship', x)} options={RELATIONSHIPS} /></Field>
          </div>
          <Field label="Email (optional)" htmlFor="reg-pemail" error={v.show('partnerEmail')} hint="We’ll email an invitation once your account is created. You can also invite later from Settings.">
            <TextInput id="reg-pemail" type="email" value={f.partnerEmail} onChange={(x) => set('partnerEmail', x)} onBlur={v.blur('partnerEmail')} invalid={!!v.show('partnerEmail')} placeholder="partner@example.com" />
          </Field>
        </fieldset>
      )}
      <Button variant="primary" className="w-full !py-2.5" loading={busy} type="submit" icon={<UserPlus className="size-4" />}>Create account</Button>
      <p className="text-center text-xs text-stone-500">
        Already have an account? <button type="button" className="font-medium text-brand-700 hover:underline" onClick={onSignIn}>Sign in</button>
      </p>
    </form>
  );
}

// ---------------- Page ----------------

type Tint = 'blue' | 'pink' | 'purple' | 'amber';
// Same tints as the dashboard's headline cards.
const TINT: Record<Tint, { card: string; icon: string }> = {
  blue: { card: 'to-brand-50 border-brand-100', icon: 'text-brand-600 border-brand-200' },
  pink: { card: 'to-rose-50 border-rose-100', icon: 'text-rose-500 border-rose-200' },
  purple: { card: 'to-violet-50 border-violet-100', icon: 'text-violet-500 border-violet-200' },
  amber: { card: 'to-amber-50 border-amber-100', icon: 'text-amber-500 border-amber-200' },
};

function Feature({ tint, icon, title, text }: { tint: Tint; icon: ReactNode; title: string; text: string }) {
  return (
    <li className={cx('rounded-2xl border bg-linear-to-br from-white p-4 shadow-[0_1px_2px_rgba(22,25,37,0.04)]', TINT[tint].card)}>
      <div className="flex items-center gap-2.5">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white', TINT[tint].icon)}>{icon}</span>
        <span className="text-sm font-semibold text-stone-800">{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">{text}</p>
    </li>
  );
}

/** Auth layout in the dashboard's style: grey canvas, feature tiles on the left (desktop), form card on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-thin h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 md:px-6 lg:py-8">
        <header className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="text-[15px] font-bold tracking-tight">Household Finance</div>
            <div className="text-[11px] text-stone-500">Budget, bills and wealth</div>
          </div>
        </header>
        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_28rem] lg:gap-16">
          <section className="hidden lg:block">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
              <Users className="size-3.5" /> For one person or a couple
            </span>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
              Your money, together —<br /><span className="text-brand-700">clear every month.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-stone-500">Budget, bills and net worth across AED and INR, in one shared workspace.</p>
            <ul className="mt-8 grid max-w-xl grid-cols-2 gap-3">
              <Feature tint="blue" icon={<PieChart className="size-4" />} title="Budget vs actual" text="Income, expenses and commitments, month by month." />
              <Feature tint="amber" icon={<BellRing className="size-4" />} title="Never miss a bill" text="Reminders before rent, EMIs and other dues." />
              <Feature tint="purple" icon={<Landmark className="size-4" />} title="Wealth in AED & INR" text="Bank balances, deposits, SIPs, stocks and loans." />
              <Feature tint="pink" icon={<Heart className="size-4" />} title="Shared costs, fairly split" text="Common bills split 50/50 with a monthly settle-up." />
            </ul>
          </section>
          <main className="w-full max-w-md justify-self-center lg:max-w-none">
            <div className="card p-6 sm:p-8">{children}</div>
          </main>
        </div>
        <footer className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 lg:justify-start">
          <ShieldCheck className="size-3.5" /> Private to your workspace. Passwords are stored as secure hashes.
        </footer>
      </div>
    </div>
  );
}

export default function Login({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <AuthShell>
      <div className="mb-6"><Tabs<Mode> value={mode} onChange={setMode} full items={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} /></div>
      {mode === 'login' ? <SignIn onRegister={() => setMode('register')} /> : <Register onSignIn={() => setMode('login')} />}
    </AuthShell>
  );
}
