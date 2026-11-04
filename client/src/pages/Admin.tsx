import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Info, KeyRound, LogOut, Pencil, ShieldCheck, Snowflake, Sun, Trash2 } from 'lucide-react';
import { Badge, Button, ErrorNote, Field, IconButton, Logo, Modal, PasswordInput, Spinner, TableCard, TextInput, confirmAction, useToast } from '../components/ui';
import { moneyIn, monthLabel } from '../lib/format';

/** Admin requests use their own sign-in, kept for this browser tab only. */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const KEY = 'ft.admin';
const getToken = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

async function adminApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/admin/login') setToken(null);
    throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { status: res.status });
  }
  return data as T;
}

interface AdminUser {
  id: string; displayName: string; email: string | null; username: string; status: 'active' | 'invited' | 'disabled';
  workspaceId: string; workspaceName: string; createdAt: string | null; lastLoginAt: string | null; lastInWorkspace: boolean;
}
interface UserDetails {
  displayName: string; email: string | null; username: string; relationship: string; status: AdminUser['status'];
  createdAt: string | null; lastLoginAt: string | null; workspaceName: string; partner: string | null; currency: string;
  salary: { source: string; amount: number; day: number }[]; salaryTotal: number;
  month: string; expected: number; received: number; accounts: number;
}
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS = { active: { tone: 'brand', label: 'Active' }, invited: { tone: 'amber', label: 'Invited' }, disabled: { tone: 'rose', label: 'Frozen' } } as const;

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await adminApi<{ token: string }>('POST', '/admin/login', f);
      setToken(r.token);
      onIn();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3 p-6">
        <div className="mb-2 flex items-center gap-2"><Logo size="sm" /><h1 className="text-base font-semibold">Admin panel</h1></div>
        <Field label="Username"><TextInput value={f.username} onChange={(v) => setF({ ...f, username: v })} required autoComplete="username" /></Field>
        <Field label="Password"><TextInput type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} required autoComplete="current-password" /></Field>
        <ErrorNote message={error} />
        <Button type="submit" variant="primary" loading={busy} className="w-full" icon={<ShieldCheck className="size-3.5" />}>Sign in</Button>
      </form>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex justify-between gap-4 py-1 text-xs"><span className="shrink-0 text-stone-500">{label}</span><span className="min-w-0 break-words text-right font-medium">{children}</span></div>;
}

/** The short info card: who they are and their salary. */
function UserInfo({ userId }: { userId: string }) {
  const [d, setD] = useState<UserDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { adminApi<UserDetails>('GET', `/admin/users/${userId}`).then(setD, (e) => setError((e as Error).message)); }, [userId]);
  if (error) return <ErrorNote message={error} />;
  if (!d) return <Spinner />;
  const amount = (n: number) => `${d.currency} ${moneyIn(n, d.currency)}`;
  return (
    <div className="divide-y divide-stone-100">
      <div className="pb-2">
        <Row label="Email">{d.email ?? d.username}</Row>
        {d.relationship && <Row label="Relationship">{d.relationship}</Row>}
        <Row label="Workspace">{d.workspaceName}</Row>
        {d.partner && <Row label="Partner">{d.partner}</Row>}
        <Row label="Status"><Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge></Row>
      </div>
      <div className="py-2">
        {d.salary.length === 0 && <Row label="Salary">Not added</Row>}
        {d.salary.map((s, i) => <Row key={i} label={`${s.source} (day ${s.day})`}>{amount(s.amount)}</Row>)}
        {d.salary.length > 1 && <Row label="Total monthly">{amount(d.salaryTotal)}</Row>}
        {d.expected > 0 && <Row label={`Received in ${monthLabel(d.month, 'short')}`}>{amount(d.received)} of {amount(d.expected)}</Row>}
        <Row label="Accounts">{d.accounts}</Row>
      </div>
      <div className="pt-2">
        <Row label="Joined">{when(d.createdAt)}</Row>
        <Row label="Last sign-in">{when(d.lastLoginAt)}</Row>
      </div>
    </div>
  );
}

function EditUser({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ displayName: user.displayName, email: user.email ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await adminApi<{ invite: { sent: boolean; email: string } | null }>('PUT', `/admin/users/${user.id}`, { displayName: f.displayName, ...(f.email && { email: f.email }) });
      if (r.invite) {
        if (r.invite.sent) toast.success(`New invitation emailed to ${r.invite.email}`);
        else toast.error(`Saved, but the invitation couldn’t be emailed to ${r.invite.email}. Use Resend in Settings, or set a password here.`);
      } else toast.success(`${f.displayName} saved`);
      onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name"><TextInput value={f.displayName} onChange={(v) => setF({ ...f, displayName: v })} required maxLength={50} /></Field>
      <Field label="Email (sign-in)" hint={user.status === 'invited' ? 'Changing it cancels the old invitation and sends a new one here.' : 'They sign in with the new email straight away.'}>
        <TextInput type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
      </Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
      </div>
    </form>
  );
}

function ChangePassword({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await adminApi('PUT', `/admin/users/${user.id}/password`, { password });
      toast.success(`Password changed for ${user.displayName}`);
      onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-stone-500">
        {user.status === 'invited' ? `${user.displayName} can sign in with this straight away; the open invitation is cancelled.` : `${user.displayName} is signed out everywhere and signs in with the new password.`}
        {' '}Tell them the password yourself: it isn’t emailed.
      </p>
      <Field label="New password" hint="At least 8 characters"><PasswordInput value={password} onChange={setPassword} required minLength={8} autoFocus autoComplete="new-password" /></Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Change password</Button>
      </div>
    </form>
  );
}

/** Deleting the last person also deletes their workspace, so the name has to be typed. */
function DeleteWorkspaceUser({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const word = user.email ?? user.username;
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await adminApi('DELETE', `/admin/users/${user.id}`);
      toast.success(`${user.displayName} and the workspace were deleted`);
      onDone();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-stone-600">
        {user.displayName} is the last person in <b>{user.workspaceName}</b>. This permanently deletes the account <b>and the whole workspace</b>: income, expenses, accounts, loans, gold and backups. It can’t be undone.
      </p>
      <Field label={`Type ${word} to confirm`}><TextInput value={typed} onChange={setTyped} autoFocus autoComplete="off" /></Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" loading={busy} disabled={typed.trim().toLowerCase() !== word.toLowerCase()}>Delete everything</Button>
      </div>
    </form>
  );
}

/** User control: every account and its status; info, edit, change password, freeze and delete. */
export default function Admin() {
  const toast = useToast();
  const [signedIn, setSignedIn] = useState(!!getToken());
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'info' | 'edit' | 'password' | 'delete'; user: AdminUser } | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await adminApi<AdminUser[]>('GET', '/admin/users')); setError(null); } catch (err) {
      if ((err as { status?: number }).status === 401) setSignedIn(false); else setError((err as Error).message);
    }
  }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);
  if (!signedIn) return <AdminLogin onIn={() => setSignedIn(true)} />;

  const closeAndReload = () => { setDialog(null); load(); };
  const setStatus = (u: AdminUser, status: 'active' | 'disabled') => confirmAction({
    header: `${status === 'disabled' ? 'Freeze' : 'Unfreeze'} ${u.displayName}?`,
    message: status === 'disabled' ? 'They are signed out and can’t sign in until unfrozen. Their data is kept.' : 'They can sign in again.',
    acceptLabel: status === 'disabled' ? 'Freeze' : 'Unfreeze',
    danger: status === 'disabled',
    onAccept: () => adminApi('PUT', `/admin/users/${u.id}`, { status }).then(() => { toast.success(`${u.displayName} ${status === 'disabled' ? 'frozen' : 'unfrozen'}`); load(); }, (e) => toast.error((e as Error).message)),
  });
  const remove = (u: AdminUser) => {
    if (u.lastInWorkspace) { setDialog({ kind: 'delete', user: u }); return; }
    confirmAction({
      header: `Delete ${u.displayName}?`,
      message: u.status === 'invited'
        ? 'The invitation is cancelled and the email is free again. Their partner can invite someone else from Settings.'
        : `Their sign-in is removed and the email is free again. Shared records stay in ${u.workspaceName}, so their partner’s numbers don’t change.`,
      onAccept: () => adminApi('DELETE', `/admin/users/${u.id}`).then(() => { toast.success(`${u.displayName} deleted`); load(); }, (e) => toast.error((e as Error).message)),
    });
  };
  const titles = dialog && { info: dialog.user.displayName, edit: `Edit ${dialog.user.displayName}`, password: `Change password for ${dialog.user.displayName}`, delete: `Delete ${dialog.user.displayName}?` }[dialog.kind];

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2"><Logo size="sm" /><span className="text-sm font-semibold">Users{users ? ` (${users.length})` : ''}</span></div>
        <Button size="sm" onClick={() => { setToken(null); setSignedIn(false); }} icon={<LogOut className="size-3.5" />}>Sign out</Button>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <ErrorNote message={error} />
        <TableCard>
          <DataTable value={users ?? []} dataKey="id" size="small" tableStyle={{ minWidth: '46rem' }} emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">{users ? 'No users.' : 'Loading…'}</p>}>
            <Column header="User" body={(u: AdminUser) => (
              <button type="button" className="group text-left" title="Show info" onClick={() => setDialog({ kind: 'info', user: u })}>
                <div className="flex items-center gap-1 font-medium group-hover:text-brand-700">{u.displayName}<Info className="size-3 text-stone-400 group-hover:text-brand-700" /></div>
                <div className="text-[11px] text-stone-500">{u.email ?? u.username}</div>
              </button>
            )} />
            <Column header="Workspace" body={(u: AdminUser) => <span className="text-xs text-stone-600">{u.workspaceName}</span>} />
            <Column header="Status" body={(u: AdminUser) => <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>} />
            <Column header="Last sign-in" body={(u: AdminUser) => <span className="text-xs text-stone-600">{when(u.lastLoginAt)}</span>} />
            <Column align="right" style={{ width: '9rem' }} body={(u: AdminUser) => (
              <div className="whitespace-nowrap">
                <IconButton title="Edit name or email" onClick={() => setDialog({ kind: 'edit', user: u })}><Pencil className="size-3.5" /></IconButton>
                <IconButton title="Change password" onClick={() => setDialog({ kind: 'password', user: u })}><KeyRound className="size-3.5" /></IconButton>
                {u.status === 'disabled'
                  ? <IconButton title="Unfreeze" onClick={() => setStatus(u, 'active')}><Sun className="size-3.5 text-emerald-600" /></IconButton>
                  : <IconButton title={u.status === 'invited' ? 'Hasn’t joined yet' : 'Freeze'} disabled={u.status === 'invited'} onClick={() => setStatus(u, 'disabled')}><Snowflake className="size-3.5" /></IconButton>}
                <IconButton title="Delete" danger onClick={() => remove(u)}><Trash2 className="size-3.5" /></IconButton>
              </div>
            )} />
          </DataTable>
        </TableCard>
      </main>
      <Modal open={!!dialog} onClose={() => setDialog(null)} title={titles ?? ''}>
        {dialog?.kind === 'info' && <UserInfo userId={dialog.user.id} />}
        {dialog?.kind === 'edit' && <EditUser user={dialog.user} onClose={() => setDialog(null)} onSaved={closeAndReload} />}
        {dialog?.kind === 'password' && <ChangePassword user={dialog.user} onClose={() => setDialog(null)} onSaved={closeAndReload} />}
        {dialog?.kind === 'delete' && <DeleteWorkspaceUser user={dialog.user} onClose={() => setDialog(null)} onDone={closeAndReload} />}
      </Modal>
    </div>
  );
}
