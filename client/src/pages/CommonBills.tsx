import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { CheckCircle2, Clock, Landmark, ReceiptText, RotateCcw, Send, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import { api, errorText } from '../lib/api';
import type { Account, Balances, Cheque, Commitment, Contract, Expense } from '../lib/types';
import { dateLabel, money, monthLabel, todayStr } from '../lib/format';
import { Button, DateInput, Empty, ErrorNote, Field, IconButton, Modal, Money, Page, PageHeader, TableCard, TableSkeleton, cx, useToast } from '../components/ui';
import { PayCommitmentModal, standing } from '../components/forms';
import { CategoryIcon } from '../components/CategoryIcon';
import { ChequeModal } from './Contracts';

type Row = { c: Commitment; amount: number; payments: Expense[]; pending: Expense[] };

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: number; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <span className="flex size-7 items-center justify-center rounded-lg border border-stone-200 bg-white text-brand-600">{icon}</span>{label}
      </div>
      <div className={cx('num mt-2 text-2xl font-semibold tracking-tight', tone ?? 'text-stone-900')}><span className="mr-1 text-sm font-medium text-stone-400">AED</span>{money(value)}</div>
      {sub && <div className="mt-1 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

/**
 * Common bills: both partners move their share into the common account, then the bills are paid
 * from it. Tracks, for each common commitment, whether the provider has actually been paid,
 * and how much the common account holds before and after the bills still to pay.
 */
export default function CommonBills() {
  const { month } = useMonth();
  const { memberName } = useAuth();
  const toast = useToast();
  const commitments = useApi<Commitment[]>(`/commitments?month=${month}`);
  const expenses = useApi<Expense[]>(`/expenses?month=${month}`);
  const balances = useApi<Balances>(`/balances?month=${month}`);
  const accounts = useApi<Account[]>('/accounts');
  const [paying, setPaying] = useState<Commitment | null>(null);
  const [marking, setMarking] = useState<Row | null>(null);
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const contracts = useApi<{ contracts: Contract[] }>('/contracts');
  const [clearing, setClearing] = useState<{ c: Contract; q: Cheque } | null>(null);

  const reload = () => { commitments.reload(); expenses.reload(); balances.reload(); contracts.reload(); };
  const commonIds = new Set((accounts.data ?? []).filter((a) => a.type === 'common').map((a) => a.id));
  const inMonth = (c: Commitment) => c.startMonth <= month && (!c.endMonth || c.endMonth >= month);
  // Rent paid by contract cheques: the monthly bill is the budget; the cheque dated this month is what goes out.
  const contractOf = (c: Commitment) => (contracts.data?.contracts ?? []).find((x) => x.commitmentId === c.id);
  const chequeIn = (k?: Contract) => k?.cheques.find((q) => q.date.startsWith(month));
  const nextCheque = (k?: Contract) => k?.cheques.find((q) => !q.cleared);
  const rows: Row[] = (commitments.data ?? [])
    .filter((c) => c.type === 'common' && c.status !== 'ended' && inMonth(c))
    .map((c) => {
      const payments = (expenses.data ?? []).filter((e) => e.status === 'active' && e.commitmentId === c.id);
      return { c, amount: c.amount, payments, pending: contractOf(c) ? [] : payments.filter((e) => e.paidOut === false) };
    })
    .sort((a, b) => Number(a.pending.length === 0 && !!a.c.payment?.paid) - Number(b.pending.length === 0 && !!b.c.payment?.paid) || a.c.dueDay - b.c.dueDay);

  // The common account(s) in AED: what is in them and what still has to go out to providers.
  const common = (balances.data?.accounts ?? []).filter((a) => a.type === 'common' && a.currency === (balances.data?.base ?? 'AED'));
  const inAccount = common.reduce((a, x) => a + x.closing, 0);
  const movedIn = common.reduce((a, x) => a + x.moneyIn, 0);
  const notRecorded = rows.filter((r) => !contractOf(r.c) && !r.c.payment?.paid).reduce((a, r) => a + (r.c.payment?.remaining ?? r.amount), 0);
  const chequesDue = rows.reduce((a, r) => { const q = chequeIn(contractOf(r.c)); return a + (q && !q.cleared ? q.amount : 0); }, 0);
  const waiting = rows.reduce((a, r) => a + r.pending.reduce((x, e) => x + e.amount, 0), 0) + chequesDue;
  const toPay = notRecorded + waiting;
  const total = rows.reduce((a, r) => a + r.amount, 0);

  async function setPaidOut(list: Expense[], paidOut: boolean, on?: string) {
    setBusy(true);
    try {
      for (const e of list) await api.put(`/expenses/${e._id}`, { paidOut, ...(paidOut && { paidOutDate: on }) });
      toast.success(paidOut ? `${list[0].description} marked paid to the provider` : `${list[0].description} marked as not paid yet`);
      setMarking(null);
      reload();
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  }

  const loading = commitments.loading && !commitments.data;
  return (
    <Page fill>
      <PageHeader
        title="Common bills"
        subtitle={`${monthLabel(month)} · you both move your share into the common account, then the bills are paid from it`}
      />
      <ErrorNote message={commitments.error ?? expenses.error ?? balances.error} />
      {common.length === 0 && !balances.loading && balances.data && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No common account yet. On the Accounts page, set the shared account’s owner to “Common”.
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Landmark className="size-4" />} label="In the common account" value={inAccount} sub={common.map((a) => a.name).join(' · ') || '—'} />
        <Stat icon={<Send className="size-4" />} label="Moved in this month" value={movedIn} sub="Transfers and shares into the common account" tone="text-emerald-700" />
        <Stat icon={<Clock className="size-4" />} label="Still to pay providers" value={toPay} tone={toPay > 0 ? 'text-amber-700' : 'text-emerald-700'}
          sub={toPay > 0 ? <>{chequesDue > 0 && <>{money(chequesDue)} rent cheque · </>}{money(waiting - chequesDue)} bills not paid out{notRecorded > 0 && <> · {money(notRecorded)} not recorded</>}</> : 'Every bill is paid'} />
        <Stat icon={<Wallet className="size-4" />} label="Left after paying" value={inAccount - waiting} tone={inAccount - waiting < 0 ? 'text-rose-700' : 'text-stone-900'}
          sub="After this month’s cheque and the bills still to pay" />
      </div>
      <TableCard>
        <DataTable
          value={rows}
          dataKey="c.id"
          size="small"
          tableStyle={{ minWidth: '52rem' }}
          emptyMessage={loading ? <TableSkeleton cols={6} /> : <Empty icon={<ReceiptText className="size-8" />} title="No common bills this month">Add common commitments such as rent, internet, DEWA and gas.</Empty>}
          footer={rows.length > 0 && (
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="font-medium text-stone-600">{rows.length} common bill{rows.length === 1 ? '' : 's'}</span>
              <span className="flex gap-4">
                <span className="text-amber-700">Still to pay <Money value={toPay} /></span>
                <span className="font-semibold">Total <Money value={total} /> AED</span>
              </span>
            </div>
          )}
        >
          <Column header="Bill" body={(r: Row) => (
            <div className="flex items-center gap-3">
              <CategoryIcon category={r.c.category} custom={r.c.customCategory} />
              <div>
                <div className="font-medium">{r.c.title}</div>
                <div className="text-[11px] text-stone-500">Due day {r.c.dueDay}</div>
              </div>
            </div>
          )} />
          <Column header="Amount" align="right" body={(r: Row) => <Money value={r.amount} className="font-medium" />} />
          <Column header="Each share" align="right" body={(r: Row) => (
            <div className="text-xs">
              {(r.c.shares ?? []).map((s) => {
                const done = standing(r.c, s.userId).ownDone;
                return (
                  <div key={s.userId} className={cx('flex items-center justify-end gap-1', !done && 'text-rose-600')}>
                    {done ? <CheckCircle2 className="size-3.5 text-brand-700" /> : <Clock className="size-3.5" />}{memberName(s.userId)} <Money value={s.amount} />
                  </div>
                );
              })}
            </div>
          )} />
          <Column header="Recorded" body={(r: Row) => (
            r.payments.length === 0
              ? <span className="text-xs text-stone-400">Not recorded</span>
              : (
                <div className="text-[11px] leading-4 text-stone-600">
                  {r.payments.map((e) => (
                    <div key={e._id}>
                      <Money value={e.amount} /> on {dateLabel(e.date)}
                      {e.accountId && <span className="text-stone-400"> · {commonIds.has(e.accountId) ? 'common account' : (accounts.data ?? []).find((a) => a.id === e.accountId)?.name}</span>}
                    </div>
                  ))}
                </div>
              )
          )} />
          <Column header="Paid to provider" body={(r: Row) => {
            const k = contractOf(r.c);
            if (k) {
              const q = chequeIn(k);
              const next = nextCheque(k);
              if (q?.cleared) return <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Cheque cleared · {dateLabel(q.clearedDate ?? q.date)}</span>;
              if (q) return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><Clock className="size-3.5" /> Cheque {dateLabel(q.date)} · <Money value={q.amount} /> waiting</span>;
              return <span className="text-xs text-stone-500">Paid by cheque{next && <> · next {dateLabel(next.date)} (<Money value={next.amount} />)</>}</span>;
            }
            if (r.pending.length > 0) {
              return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><Clock className="size-3.5" /> Not yet · in the account</span>;
            }
            if (!r.c.payment?.paid) return <span className="inline-flex items-center gap-1 text-xs text-rose-600"><Clock className="size-3.5" /> Not paid</span>;
            const last = [...r.payments].sort((a, b) => (b.paidOutDate ?? b.date).localeCompare(a.paidOutDate ?? a.date))[0];
            return <span className="inline-flex items-center gap-1 text-xs text-brand-700"><CheckCircle2 className="size-3.5" /> Paid{last && <> · {dateLabel(last.paidOutDate ?? last.date)}</>}</span>;
          }} />
          <Column align="right" style={{ width: '9rem' }} body={(r: Row) => {
            const k = contractOf(r.c);
            const q = chequeIn(k);
            if (k && q && !q.cleared) return <Button size="sm" variant="primary" onClick={() => setClearing({ c: k, q })}>Cheque cleared</Button>;
            if (k && !r.c.payment?.paid) return <Button size="sm" onClick={() => setPaying(r.c)}>Record share</Button>;
            if (k && q?.cleared) return <IconButton title="Mark the cheque as not cleared" onClick={() => api.put(`/contracts/${k.id}/cheques/${q.id}`, { cleared: false }).then(() => { toast.success('Cheque marked as not cleared'); reload(); }, (err) => toast.error(errorText(err)))}><RotateCcw className="size-3.5" /></IconButton>;
            if (k) return null;
            if (r.pending.length > 0) return <Button size="sm" variant="primary" onClick={() => { setMarking(r); setDate(todayStr()); }}>Mark paid</Button>;
            if (!r.c.payment?.paid) return <Button size="sm" onClick={() => setPaying(r.c)}>{r.payments.length ? 'Record rest' : 'Record bill'}</Button>;
            const fromCommon = r.payments.filter((e) => e.accountId && commonIds.has(e.accountId));
            return fromCommon.length > 0
              ? <IconButton title="Mark as not paid to the provider yet" onClick={() => setPaidOut(fromCommon, false)}><RotateCcw className="size-3.5" /></IconButton>
              : null;
          }} />
        </DataTable>
      </TableCard>

      <Modal open={!!marking} onClose={() => setMarking(null)} title={`Paid “${marking?.c.title ?? ''}” to the provider`}>
        <form onSubmit={(e) => { e.preventDefault(); if (marking) setPaidOut(marking.pending, true, date); }} className="space-y-3">
          <p className="text-xs text-stone-600">
            <Money value={marking?.pending.reduce((a, e) => a + e.amount, 0) ?? 0} /> AED leaves the common account on this date.
          </p>
          <Field label="Date paid"><DateInput value={date} max={todayStr()} onChange={setDate} required /></Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMarking(null)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Mark paid</Button>
          </div>
        </form>
      </Modal>
      <PayCommitmentModal target={paying} month={month} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); }} />
      <ChequeModal contract={clearing?.c ?? null} cheque={clearing?.q ?? null} onClose={() => setClearing(null)} onSaved={() => { setClearing(null); reload(); }} />

    </Page>
  );
}
