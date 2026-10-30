import { useEffect, useRef, useState } from 'react';
import { Download, Plus, ShieldCheck, Trash2, Upload, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Member } from '../lib/types';
import { Badge, Button, ErrorNote, Field, Modal, Money, PageHeader } from '../components/ui';

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

function IncomeSources() {
  const { workspace, refreshWorkspace } = useAuth();
  const [members, setMembers] = useState<Member[]>(workspace?.members ?? []);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (workspace) setMembers(workspace.members); }, [workspace]);
  const upd = (i: number, j: number, patch: Record<string, unknown>) =>
    setMembers((ms) => ms.map((m, k) => (k !== i ? m : { ...m, incomeSources: m.incomeSources.map((s, l) => (l === j ? { ...s, ...patch } : s)) })));

  async function save() {
    setBusy(true); setError(null); setMsg(null);
    try {
      await api.put('/workspace', { members: members.map((m) => ({ userId: m.userId, displayName: m.displayName, relationship: m.relationship, incomeSources: m.incomeSources.map((s) => ({ ...s, amount: Number(s.amount), expectedDay: Number(s.expectedDay) })) })) });
      await refreshWorkspace();
      setMsg('Saved. Changes apply to months whose income has not been created yet.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Monthly income sources</h2>
      <p className="mb-3 text-xs text-stone-500">Used to create each new month's expected income. Past months are never changed.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {members.map((m, i) => (
          <div key={m.userId} className="rounded-md border border-stone-200 p-3">
            <div className="mb-2 flex justify-between text-sm font-medium"><span>{m.displayName}</span><Money value={m.incomeSources.filter((s) => s.active).reduce((a, s) => a + Number(s.amount || 0), 0)} /></div>
            <div className="space-y-2">
              {m.incomeSources.map((s, j) => (
                <div key={j} className="grid grid-cols-[1fr_6.5rem_3.5rem_auto] items-center gap-2">
                  <input className="input" value={s.source} onChange={(e) => upd(i, j, { source: e.target.value })} aria-label="Source" />
                  <input className="input num text-right" type="number" min={0} step="0.01" value={s.amount} onChange={(e) => upd(i, j, { amount: e.target.value })} aria-label="Amount" />
                  <input className="input num" type="number" min={1} max={31} value={s.expectedDay} onChange={(e) => upd(i, j, { expectedDay: e.target.value })} aria-label="Pay day" title="Pay day" />
                  <button className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" title="Remove" onClick={() => setMembers((ms) => ms.map((x, k) => (k !== i ? x : { ...x, incomeSources: x.incomeSources.filter((_, l) => l !== j) })))}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setMembers((ms) => ms.map((x, k) => (k !== i ? x : { ...x, incomeSources: [...x.incomeSources, { source: '', amount: 0, expectedDay: 28, active: true }] })))}><Plus className="size-3" /> Add source</Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" loading={busy} onClick={save}>Save income sources</Button>
        {msg && <span className="text-xs text-brand-700">{msg}</span>}
      </div>
      <div className="mt-2"><ErrorNote message={error} /></div>
    </section>
  );
}

function BackupPanel() {
  const snapshots = useApi<Snapshot[]>('/backup/snapshots');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; data: unknown; report: Report } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  async function exportNow() {
    setBusy('export'); setError(null);
    try { downloadJson(await api.get('/backup/export'), `finance-backup-${stamp()}.json`); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function pickFile(f: File) {
    setError(null); setMsg(null);
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
      setMsg(`Restore complete. A backup of the previous data was saved first (snapshot ${r.preRestoreBackupId.slice(-6)}).`);
      snapshots.reload();
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function downloadSnapshot(s: Snapshot) {
    try { downloadJson(await api.get(`/backup/snapshots/${s.id}`), `finance-snapshot-${s.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json`); } catch (e) { setError(errorText(e)); }
  }

  return (
    <section className="card p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 text-brand-700" />
        <div>
          <h2 className="text-sm font-semibold">Backup & restore</h2>
          <p className="text-xs text-stone-500">A backup is a JSON file of the whole workspace with a timestamp and schema version. Keep copies somewhere safe (e.g. cloud drive). Records are never permanently deleted from the app; archive them instead.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === 'export'} onClick={exportNow}><Download className="size-3.5" /> Export backup</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Restore from file…</Button>
        <Button variant="ghost" onClick={async () => { await api.post('/backup/snapshots'); snapshots.reload(); }}><History className="size-3.5" /> Save server snapshot</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
      </div>
      <div className="mt-3 space-y-2">
        <ErrorNote message={error} />
        {msg && <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">{msg}</div>}
      </div>

      <h3 className="mb-1 mt-4 text-xs font-semibold text-stone-700">Server snapshots</h3>
      {(snapshots.data ?? []).length === 0 ? <p className="text-xs text-stone-500">None yet. One is taken automatically before every restore.</p> : (
        <ul className="divide-y divide-stone-100 text-sm">
          {snapshots.data!.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-1.5">
              <span><span className="num">{new Date(s.createdAt).toLocaleString('en-GB')}</span> <Badge>{s.reason}</Badge> <span className="text-xs text-stone-400">{(s.sizeBytes / 1024).toFixed(1)} KB</span></span>
              <Button size="sm" variant="ghost" onClick={() => downloadSnapshot(s)}><Download className="size-3" /> Download</Button>
            </li>
          ))}
        </ul>
      )}

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
                <Field label='Type "RESTORE" to confirm'><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
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
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={`${workspace?.name} · signed in as @${user?.username}`} />
      <IncomeSources />
      <BackupPanel />
    </div>
  );
}
