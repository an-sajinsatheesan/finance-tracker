import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chip } from 'primereact/chip';
import { Copy, Download, Eye, EyeOff, History, ListChecks, Plus, Send, ShieldCheck, Upload, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { AccountGroup, InviteResult, LookupItem, LookupType, PendingInvite } from '../lib/types';
import {
  Badge, Button, ErrorNote, Field, Modal, Page, PageHeader, Select, Tabs, TextInput, confirmAction, cx, usePaging, useToast,
} from '../components/ui';
import { LookupSelect } from '../components/forms';

interface Report { valid: boolean; errors: string[]; summary?: { exportedAt: string; schemaVersion: number; workspaceName: string; counts: Record<string, number> } }
interface Snapshot { id: string; reason: string; createdAt: string; sizeBytes: number }

function downloadJson(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function InviteLink({ invite }: { invite: InviteResult }) {
  const toast = useToast();
  return (
    <div className="space-y-1.5 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-900">
      <div>{invite.sent ? <>Invitation emailed to <b>{invite.email}</b>.</> : <>Email is not configured on the server, so send <b>{invite.email}</b> this link yourself:</>}</div>
      <div className="flex gap-2">
        <TextInput value={invite.url} onChange={() => undefined} readOnly onFocus={(e) => e.target.select()} className="flex-1 text-xs" />
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(invite.url).then(() => toast.success('Invitation link copied', 'Copied'))} icon={<Copy className="size-3" />}>Copy</Button>
      </div>
    </div>
  );
}

/** Members, their status and the partner invitation. */
function MembersPanel() {
  const { workspace, user, refreshWorkspace } = useAuth();
  const toast = useToast();
  const invites = useApi<PendingInvite[]>('/workspace/invitations');
  const [form, setForm] = useState({ email: '', displayName: '', relationship: 'Wife' });
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pendingMember = workspace?.members.find((m) => m.status === 'invited');
  const canInvite = (workspace?.members.length ?? 0) < 2 || !!pendingMember;
  useEffect(() => { if (pendingMember?.email) setForm((f) => ({ ...f, email: pendingMember.email ?? '' })); }, [pendingMember?.email]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy('invite'); setError(null); setResult(null);
    try {
      const r = await api.post<InviteResult>('/workspace/invitations', form);
      setResult(r);
      toast.success(r.sent ? `Invitation emailed to ${r.email}` : 'Invitation created — copy the link below', 'Invitation');
      await refreshWorkspace();
      invites.reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }
  async function resend(id: string) {
    setBusy(id); setError(null);
    try {
      const r = await api.post<InviteResult>(`/workspace/invitations/${id}/resend`);
      setResult(r);
      toast.success('A new invitation link was created; the old one no longer works.', 'Invitation');
      invites.reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }

  return (
    <section className="card p-4">
      <div className="flex items-start gap-2">
        <Users className="mt-0.5 size-4 text-brand-700" />
        <div>
          <h2 className="text-sm font-semibold">Members</h2>
          <p className="text-xs text-stone-500">{workspace?.mode === 'couple' ? 'Common expenses are split 50/50 between the two of you.' : 'Personal workspace. Invite a partner to share common expenses.'}</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-stone-100">
        {workspace?.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{m.displayName}{m.userId === user?.id && <span className="ml-1 text-xs font-normal text-stone-400">(you)</span>}</div>
              <div className="truncate text-[11px] text-stone-500">{m.relationship}{m.email && ` · ${m.email}`}</div>
            </div>
            {m.status === 'invited' ? <Badge tone="amber">Invitation pending</Badge> : <Badge tone="brand">Active</Badge>}
          </li>
        ))}
      </ul>
      {(invites.data ?? []).map((i) => (
        <div key={i.id} className="mt-1 flex items-center justify-between gap-2 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <span>Invite to <b>{i.email}</b> · {i.expired ? <span className="text-rose-700">expired</span> : <>expires {new Date(i.expiresAt).toLocaleDateString('en-GB')}</>}</span>
          <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => resend(i.id)} icon={<Send className="size-3" />}>Resend</Button>
        </div>
      ))}
      {canInvite && (
        <form onSubmit={invite} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
          {!pendingMember && <Field label="Partner name"><TextInput value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} required maxLength={50} /></Field>}
          <Field label={pendingMember ? `${pendingMember.displayName}'s email` : 'Partner email'} className={pendingMember ? 'sm:col-span-2' : ''}>
            <TextInput type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          </Field>
          {!pendingMember && <Field label="Relationship"><LookupSelect type="relationship" value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} /></Field>}
          {pendingMember && <span />}
          <Button type="submit" variant="primary" loading={busy === 'invite'} icon={<Send className="size-3.5" />}>{pendingMember ? 'Send invite' : 'Invite'}</Button>
        </form>
      )}
      <div className="mt-2 space-y-2">
        <ErrorNote message={error} />
        {result && <InviteLink invite={result} />}
      </div>
    </section>
  );
}

const LIST_TYPES: { value: LookupType; label: string }[] = [
  { value: 'category', label: 'Categories' },
  { value: 'bank', label: 'Banks & brokers' },
  { value: 'accountType', label: 'Account types' },
  { value: 'incomeSource', label: 'Income sources' },
  { value: 'relationship', label: 'Relationships' },
  { value: 'currency', label: 'Currencies' },
];
const GROUPS: { value: AccountGroup; label: string }[] = [
  { value: 'cash', label: 'Cash / bank' }, { value: 'deposit', label: 'Deposit' }, { value: 'investment', label: 'Investment' }, { value: 'liability', label: 'Loan / liability' },
];

/** The shared enum table: built-in values plus this workspace's own additions. */
function ListsPanel() {
  const { lookups, reload } = useLookups();
  const toast = useToast();
  const [type, setType] = useState<LookupType>('category');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<AccountGroup>('investment');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = lookups[type] ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const meta = type === 'accountType' ? { group } : undefined;
      await api.post('/lookups', { type, label, meta });
      toast.success(`${label} added`);
      setLabel('');
      await reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function setActive(item: LookupItem, active: boolean) {
    try {
      await api.put(`/lookups/${item.id}`, { active });
      toast.success(`${item.label} ${active ? 'shown' : 'hidden'}`);
      await reload();
    } catch (err) { toast.error(errorText(err)); }
  }
  const askHide = (item: LookupItem) => confirmAction({
    header: `Hide “${item.label}”?`,
    message: 'It disappears from dropdowns. Records that already use it keep it, and you can show it again here.',
    acceptLabel: 'Hide',
    onAccept: () => setActive(item, false),
  });

  return (
    <section className="card p-4">
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 size-4 text-brand-700" />
        <div>
          <h2 className="text-sm font-semibold">Lists</h2>
          <p className="text-xs text-stone-500">Values used in dropdowns across the app. Built-in values are shared; add your own for anything missing.</p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto"><Tabs<LookupType> value={type} onChange={setType} items={LIST_TYPES} /></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <Chip
            key={r.id}
            className={cx(!r.active && 'line-through opacity-50')}
            template={
              <span className="inline-flex items-center gap-1 py-1">
                {r.label}
                {r.code !== r.label && <span className="text-[10px] text-stone-400">{r.code}</span>}
                {typeof r.meta.group === 'string' && <span className="text-[10px] text-stone-400">· {r.meta.group}</span>}
                {r.custom && (
                  <button type="button" className="ml-0.5 text-stone-400 hover:text-stone-700" title={r.active ? 'Hide' : 'Show'} aria-label={r.active ? 'Hide' : 'Show'}
                    onClick={() => (r.active ? askHide(r) : setActive(r, true))}>
                    {r.active ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                )}
              </span>
            }
          />
        ))}
      </div>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Add value" className="min-w-[12rem] flex-1"><TextInput value={label} onChange={setLabel} required maxLength={60} /></Field>
        {type === 'accountType' && <Field label="Counts as" className="w-44"><Select value={group} onChange={(v) => setGroup(v as AccountGroup)} options={GROUPS} /></Field>}
        <Button type="submit" loading={busy} icon={<Plus className="size-3.5" />}>Add</Button>
      </form>
      <div className="mt-2"><ErrorNote message={error} /></div>
    </section>
  );
}

function BackupPanel() {
  const snapshots = useApi<Snapshot[]>('/backup/snapshots');
  const paging = usePaging(null, 5);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; data: unknown; report: Report } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  async function exportNow() {
    setBusy('export'); setError(null);
    try { downloadJson(await api.get('/backup/export'), `finance-backup-${stamp()}.json`); toast.success('Backup downloaded', 'Export'); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function pickFile(f: File) {
    setError(null);
    try {
      const data = JSON.parse(await f.text());
      const report = await api.post<Report>('/backup/validate', data);
      setPending({ name: f.name, data, report });
      setConfirmText('');
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That file is not valid JSON.' : errorText(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function restore() {
    if (!pending) return;
    setBusy('restore'); setError(null);
    try {
      const r = await api.post<{ preRestoreBackupId: string }>('/backup/restore', pending.data);
      setPending(null);
      toast.success(`Restore complete. The previous data was saved first (snapshot ${r.preRestoreBackupId.slice(-6)}).`, 'Restored');
      snapshots.reload();
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function downloadSnapshot(s: Snapshot) {
    try { downloadJson(await api.get(`/backup/snapshots/${s.id}`), `finance-snapshot-${s.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json`); } catch (e) { setError(errorText(e)); }
  }
  async function snapshotNow() {
    try { await api.post('/backup/snapshots'); toast.success('Server snapshot saved'); snapshots.reload(); } catch (e) { toast.error(errorText(e)); }
  }

  return (
    <section className="card p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 text-brand-700" />
        <div>
          <h2 className="text-sm font-semibold">Backup & restore</h2>
          <p className="text-xs text-stone-500">A backup is a JSON file of the whole workspace with a timestamp and schema version. Keep copies somewhere safe (e.g. cloud drive).</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === 'export'} onClick={exportNow} icon={<Download className="size-3.5" />}>Export backup</Button>
        <Button onClick={() => fileRef.current?.click()} icon={<Upload className="size-3.5" />}>Restore from file…</Button>
        <Button variant="ghost" onClick={snapshotNow} icon={<History className="size-3.5" />}>Save server snapshot</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
      </div>
      <div className="mt-3"><ErrorNote message={error} /></div>

      <h3 className="mb-1 mt-4 text-sm font-semibold text-stone-800">Server snapshots</h3>
      <div className="overflow-hidden rounded-md border border-stone-200">
        <DataTable value={snapshots.data ?? []} dataKey="id" size="small" {...paging} emptyMessage={<p className="px-3 py-4 text-xs text-stone-500">None yet. One is taken automatically before every restore.</p>}>
          <Column header="Saved" body={(s: Snapshot) => <span className="num">{new Date(s.createdAt).toLocaleString('en-GB')}</span>} />
          <Column header="Reason" body={(s: Snapshot) => <Badge>{s.reason}</Badge>} />
          <Column header="Size" align="right" body={(s: Snapshot) => <span className="text-xs text-stone-500">{(s.sizeBytes / 1024).toFixed(1)} KB</span>} />
          <Column align="right" body={(s: Snapshot) => <Button size="sm" variant="ghost" onClick={() => downloadSnapshot(s)} icon={<Download className="size-3" />}>Download</Button>} />
        </DataTable>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Restore backup"
        footer={<>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="danger" disabled={!pending?.report.valid || confirmText !== 'RESTORE'} loading={busy === 'restore'} onClick={restore}>Restore</Button>
        </>}
      >
        {pending && (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-stone-500">{pending.name}</div>
            {pending.report.valid ? (
              <>
                <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Valid backup of “{pending.report.summary?.workspaceName}”, exported {new Date(pending.report.summary!.exportedAt).toLocaleString('en-GB')} (schema v{pending.report.summary?.schemaVersion}).
                </div>
                <ul className="grid grid-cols-2 gap-x-4 text-xs text-stone-600">
                  {Object.entries(pending.report.summary?.counts ?? {}).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="num">{v}</span></li>)}
                </ul>
                <p className="text-xs text-stone-600">Restoring replaces all current workspace data with this backup. The current data is saved as a server snapshot first, so you can undo by restoring that snapshot.</p>
                <Field label='Type "RESTORE" to confirm'><TextInput value={confirmText} onChange={setConfirmText} /></Field>
              </>
            ) : (
              <ErrorNote message={`This file cannot be restored: ${pending.report.errors.join(' · ')}`} />
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

export default function SettingsPage() {
  const { workspace, user } = useAuth();
  return (
    <Page>
      <div className="space-y-4">
      <PageHeader title="Settings" subtitle={`${workspace?.name} · signed in as ${user?.email ?? '@' + user?.username}`} />
      <MembersPanel />
      <ListsPanel />
      <BackupPanel />
      </div>
    </Page>
  );
}
