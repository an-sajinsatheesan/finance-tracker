import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { KeyRound, LogOut, Pencil, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { Badge, Button, ErrorNote, Field, IconButton, Logo, Modal, StatRail, TableCard, TextInput, confirmAction, useToast } from '../components/ui';

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
  workspaceId: string; workspaceName: string; createdAt: string | null; lastLoginAt: string | null;
}
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS_TONE = { active: 'brand', invited: 'amber', disabled: 'rose' } as const;

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
        <p className="text-xs text-stone-500">User control for this app. Separate from the family sign-in.</p>
        <Field label="Username"><TextInput value={f.username} onChange={(v) => setF({ ...f, username: v })} required autoComplete="username" /></Field>
        <Field label="Password"><TextInput type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} required autoComplete="current-password" /></Field>
        <ErrorNote message={error} />
        <Button type="submit" variant="primary" loading={busy} className="w-full" icon={<ShieldCheck className="size-3.5" />}>Sign in</Button>
      </form>
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
      await adminApi('PUT', `/admin/users/${user.id}`, { displayName: f.displayName, ...(user.status === 'invited' && f.email && { email: f.email }) });
      toast.success(`${f.displayName} saved`);
      onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name"><TextInput value={f.displayName} onChange={(v) => setF({ ...f, displayName: v })} required maxLength={50} /></Field>
      {user.status === 'invited'
        ? <Field label="Email (sign-in)"><TextInput type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} /></Field>
        : <p className="text-[11px] text-stone-500">Email: <b>{user.email}</b>. Only {user.displayName} can change it, from their own Settings, so nobody else can take over the account.</p>}
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
      </div>
    </form>
  );
}

/** User control: every account, its workspace and status; enable, disable, edit, password link. */
export default function Admin() {
  const toast = useToast();
  const [signedIn, setSignedIn] = useState(!!getToken());
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await adminApi<AdminUser[]>('GET', '/admin/users')); setError(null); } catch (err) {
      if ((err as { status?: number }).status === 401) setSignedIn(false); else setError((err as Error).message);
    }
  }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);
  if (!signedIn) return <AdminLogin onIn={() => setSignedIn(true)} />;

  const setStatus = (u: AdminUser, status: 'active' | 'disabled') => confirmAction({
    header: `${status === 'disabled' ? 'Disable' : 'Enable'} ${u.displayName}?`,
    message: status === 'disabled' ? 'They are signed out and can’t sign in until enabled again. Their data is kept.' : 'They can sign in again.',
    acceptLabel: status === 'disabled' ? 'Disable' : 'Enable',
    onAccept: () => adminApi('PUT', `/admin/users/${u.id}`, { status }).then(() => { toast.success(`${u.displayName} ${status === 'disabled' ? 'disabled' : 'enabled'}`); load(); }, (e) => toast.error((e as Error).message)),
  });
  // The link goes only to the person's own email: the admin never sees it.
  const sendLink = (u: AdminUser) => confirmAction({
    header: `Email ${u.displayName} a password link?`,
    message: `A link to choose a new password is emailed to ${u.email ?? 'their email'}. Any earlier link stops working.`,
    acceptLabel: 'Send link',
    onAccept: () => adminApi<{ sent: boolean; email: string }>('POST', `/admin/users/${u.id}/password-link`)
      .then((r) => toast.success(`Password link emailed to ${r.email}`), (e) => toast.error((e as Error).message)),
  });
  const all = users ?? [];
  const workspaces = new Set(all.map((u) => u.workspaceId)).size;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2"><Logo size="sm" /><span className="text-sm font-semibold">Admin · user control</span></div>
        <Button size="sm" onClick={() => { setToken(null); setSignedIn(false); }} icon={<LogOut className="size-3.5" />}>Sign out</Button>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <ErrorNote message={error} />
        <StatRail items={[
          { label: 'Users', value: all.length, text: String(all.length), icon: <Users className="size-3.5" />, sub: `${workspaces} workspace${workspaces === 1 ? '' : 's'}` },
          { label: 'Active', value: 0, text: String(all.filter((u) => u.status === 'active').length), tone: 'text-emerald-700', icon: <UserCheck className="size-3.5" /> },
          { label: 'Invited', value: 0, text: String(all.filter((u) => u.status === 'invited').length), tone: 'text-amber-700', icon: <KeyRound className="size-3.5" />, sub: 'Not joined yet' },
          { label: 'Disabled', value: 0, text: String(all.filter((u) => u.status === 'disabled').length), tone: 'text-rose-700', icon: <UserX className="size-3.5" /> },
        ]} />
        <TableCard>
          <DataTable value={all} dataKey="id" size="small" tableStyle={{ minWidth: '56rem' }} emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">{users ? 'No users.' : 'Loading…'}</p>}>
            <Column header="User" body={(u: AdminUser) => (
              <div>
                <div className="font-medium">{u.displayName}</div>
                <div className="text-[11px] text-stone-500">{u.email ?? u.username}</div>
              </div>
            )} />
            <Column header="Workspace" body={(u: AdminUser) => <span className="text-xs text-stone-600">{u.workspaceName}</span>} />
            <Column header="Status" body={(u: AdminUser) => <Badge tone={STATUS_TONE[u.status]}>{u.status === 'invited' ? 'Invited' : u.status === 'disabled' ? 'Disabled' : 'Active'}</Badge>} />
            <Column header="Last sign-in" body={(u: AdminUser) => <span className="text-xs text-stone-600">{when(u.lastLoginAt)}</span>} />
            <Column header="Joined" body={(u: AdminUser) => <span className="text-xs text-stone-500">{when(u.createdAt)}</span>} />
            <Column align="right" style={{ width: '9rem' }} body={(u: AdminUser) => (
              <div className="whitespace-nowrap">
                <IconButton title="Edit name or email" onClick={() => setEditing(u)}><Pencil className="size-3.5" /></IconButton>
                <IconButton title="Send a link to set a new password" onClick={() => sendLink(u)}><KeyRound className="size-3.5" /></IconButton>
                {u.status === 'disabled'
                  ? <IconButton title="Enable" onClick={() => setStatus(u, 'active')}><UserCheck className="size-3.5 text-emerald-600" /></IconButton>
                  : u.status === 'active' && <IconButton title="Disable" danger onClick={() => setStatus(u, 'disabled')}><UserX className="size-3.5" /></IconButton>}
              </div>
            )} />
          </DataTable>
        </TableCard>
      </main>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.displayName ?? ''}`}>
        {editing && <EditUser user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}
