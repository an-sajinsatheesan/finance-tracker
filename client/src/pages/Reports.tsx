import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { ArrowDownRight, ArrowUpRight, BarChart3, PiggyBank, Printer, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useApi } from '../lib/useApi';
import type { BalanceAccount, Balances, Expense } from '../lib/types';
import { categoryLabel, monthLabel, moneyIn, thisMonth } from '../lib/format';
import { Button, ErrorNote, Money, Page, PageHeader, StatRail, TableCard, TableSkeleton, Tabs, cx } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';

type View = 'month' | 'lifetime';
type Saving = Balances['savings'][number];
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const tone = (v: number) => (v < -0.004 ? 'text-rose-700' : 'text-emerald-700');

/** Income, spending and savings per person: one month in detail, or every month since you started. */
export default function Reports() {
  const { month } = useMonth();
  const { workspace, isCouple } = useAuth();
  const [view, setView] = useState<View>('month');
  const members = workspace?.members ?? [];
  const monthData = useApi<Balances>(`/balances?month=${month}`);
  const expenses = useApi<Expense[]>(view === 'month' ? `/expenses?month=${month}` : null);
  const lifetime = useApi<Balances>(view === 'lifetime' ? `/balances?month=${thisMonth()}` : null);

  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle={view === 'month' ? `${monthLabel(month)} · income, spending and savings` : 'Every month since you started · income, spending and savings'}
        actions={<>
          <Tabs<View> value={view} onChange={setView} items={[{ value: 'month', label: 'Monthly report' }, { value: 'lifetime', label: 'Lifetime' }]} />
          <Button onClick={() => window.print()} icon={<Printer className="size-3.5" />}>Print</Button>
        </>}
      />
      {view === 'month'
        ? <MonthReport month={month} data={monthData.data} error={monthData.error} expenses={expenses.data ?? []} members={members} isCouple={isCouple} />
        : <Lifetime data={lifetime.data} error={lifetime.error} loading={lifetime.loading} members={members} isCouple={isCouple} />}
    </Page>
  );
}

type Members = { userId: string; displayName: string }[];

function MonthReport({ month, data, error, expenses, members, isCouple }: {
  month: string; data: Balances | null; error: string | null; expenses: Expense[]; members: Members; isCouple: boolean;
}) {
  const row = data?.savings.find((s) => s.month === month);
  const active = expenses.filter((e) => e.status === 'active');
  const spentTotal = active.reduce((a, e) => a + e.amount, 0);
  const categories = useMemo(() => {
    const by = new Map<string, { category: string; custom: string; amount: number; common: number }>();
    for (const e of active) {
      const key = e.category === 'Custom' ? `Custom:${e.customCategory}` : e.category;
      const x = by.get(key) ?? { category: e.category, custom: e.customCategory, amount: 0, common: 0 };
      x.amount += e.amount;
      if (e.type === 'common') x.common += e.amount;
      by.set(key, x);
    }
    return [...by.values()].sort((a, b) => b.amount - a.amount);
  }, [active]);
  const accounts = (data?.accounts ?? []).filter((a) => a.group !== 'liability');

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <StatRail items={[
        { label: 'Income received', value: row?.income ?? 0, tone: 'text-emerald-700', icon: <ArrowDownRight className="size-3.5" />, sub: monthLabel(month) },
        { label: 'Spent', value: row?.spent ?? 0, tone: 'text-rose-700', icon: <ArrowUpRight className="size-3.5" />, sub: `${active.length} expenses · ${moneyIn(spentTotal, 'AED')} recorded` },
        { label: 'Saved', value: row?.saved ?? 0, tone: tone(row?.saved ?? 0), icon: <PiggyBank className="size-3.5" />, sub: `${pct(row?.saved ?? 0, row?.income ?? 0)}% of income` },
        { label: 'Saved so far', value: row?.cumulative ?? 0, tone: tone(row?.cumulative ?? 0), icon: <Wallet className="size-3.5" />, sub: 'Since you started' },
      ]} />

      <TableCard>
        <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-stone-800">Each person</h2>
        <DataTable value={row?.members ?? []} dataKey="userId" size="small" emptyMessage={<TableSkeleton cols={5} rows={2} />}>
          <Column header="Person" body={(m: Saving['members'][number]) => <span className="font-medium">{members.find((x) => x.userId === m.userId)?.displayName}</span>} />
          <Column header="Income" align="right" body={(m: Saving['members'][number]) => <Money value={m.income} className="text-emerald-700" />} />
          <Column header={isCouple ? 'Spent (own + share of common)' : 'Spent'} align="right" body={(m: Saving['members'][number]) => <Money value={m.spent} className="text-rose-600" />} />
          <Column header="Saved" align="right" body={(m: Saving['members'][number]) => <Money value={m.saved} className={cx('font-semibold', tone(m.saved))} />} />
          <Column header="Savings rate" align="right" body={(m: Saving['members'][number]) => <span className={cx('num', tone(m.saved))}>{pct(m.saved, m.income)}%</span>} />
        </DataTable>
      </TableCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard>
          <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-stone-800">Where the money went</h2>
          <DataTable
            value={categories} dataKey="category" size="small"
            emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">No expenses recorded this month.</p>}
            footerColumnGroup={categories.length ? (
              <ColumnGroup><Row>
                <Column footer="Total" />
                <Column align="right" footer={<Money value={spentTotal} className="font-semibold" />} />
                <Column align="right" footer="100%" />
              </Row></ColumnGroup>
            ) : undefined}
          >
            <Column header="Category" body={(c: typeof categories[number]) => (
              <span className="flex items-center gap-2.5"><CategoryIcon category={c.category} custom={c.custom} size="sm" />
                <span>{categoryLabel(c.category, c.custom)}{c.common > 0 && <span className="ml-1 text-[11px] text-violet-700">· {moneyIn(c.common, 'AED')} common</span>}</span>
              </span>
            )} />
            <Column header="Amount" align="right" body={(c: typeof categories[number]) => <Money value={c.amount} className="font-medium" />} />
            <Column header="Share" align="right" body={(c: typeof categories[number]) => (
              <div className="flex items-center justify-end gap-2">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${pct(c.amount, spentTotal)}%` }} /></div>
                <span className="num w-9 text-xs text-stone-600">{pct(c.amount, spentTotal)}%</span>
              </div>
            )} />
          </DataTable>
        </TableCard>

        <TableCard>
          <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-stone-800">Accounts at the end of {monthLabel(month)}</h2>
          <DataTable value={accounts} dataKey="id" size="small" emptyMessage={<p className="px-3 py-6 text-center text-xs text-stone-500">No accounts yet.</p>}>
            <Column header="Account" body={(a: BalanceAccount) => <span className="font-medium">{a.name}</span>} />
            <Column header="In" align="right" body={(a: BalanceAccount) => a.moneyIn ? <span className="num text-emerald-700">+{moneyIn(a.moneyIn, a.currency)}</span> : <span className="text-stone-300">—</span>} />
            <Column header="Out" align="right" body={(a: BalanceAccount) => a.moneyOut ? <span className="num text-rose-700">−{moneyIn(a.moneyOut, a.currency)}</span> : <span className="text-stone-300">—</span>} />
            <Column header="End" align="right" body={(a: BalanceAccount) => (
              <span className={cx('num font-semibold', a.closing < 0 ? 'text-rose-700' : 'text-emerald-700')}>{a.currency} {moneyIn(a.closing, a.currency)}</span>
            )} />
          </DataTable>
        </TableCard>
      </div>
    </div>
  );
}

function Lifetime({ data, error, loading, members, isCouple }: { data: Balances | null; error: string | null; loading: boolean; members: Members; isCouple: boolean }) {
  const rows = [...(data?.savings ?? [])].reverse(); // newest first
  const sumOf = (userId: string, k: 'income' | 'spent' | 'saved') => rows.reduce((a, s) => a + (s.members.find((m) => m.userId === userId)?.[k] ?? 0), 0);
  const income = rows.reduce((a, s) => a + s.income, 0);
  const saved = rows.reduce((a, s) => a + s.saved, 0);
  const first = rows[rows.length - 1]?.month;

  const header = (
    <ColumnGroup>
      <Row>
        <Column header="Month" rowSpan={2} />
        {members.map((m) => <Column key={m.userId} header={m.displayName} colSpan={3} alignHeader="center" />)}
        {isCouple && <Column header="Household" colSpan={2} alignHeader="center" />}
        {!isCouple && <Column header="Saved so far" rowSpan={2} align="right" />}
      </Row>
      <Row>
        {members.flatMap((m) => [
          <Column key={`${m.userId}-i`} header="In" align="right" />,
          <Column key={`${m.userId}-s`} header="Out" align="right" />,
          <Column key={`${m.userId}-v`} header="Saved" align="right" />,
        ])}
        {isCouple && <Column header="Saved" align="right" />}
        {isCouple && <Column header="Saved so far" align="right" />}
      </Row>
    </ColumnGroup>
  );
  const footer = (
    <ColumnGroup>
      <Row>
        <Column footer="Lifetime" />
        {members.flatMap((m) => [
          <Column key={`${m.userId}-i`} align="right" footer={<Money value={sumOf(m.userId, 'income')} className="font-semibold text-emerald-700" />} />,
          <Column key={`${m.userId}-s`} align="right" footer={<Money value={sumOf(m.userId, 'spent')} className="font-semibold text-rose-600" />} />,
          <Column key={`${m.userId}-v`} align="right" footer={<Money value={sumOf(m.userId, 'saved')} className={cx('font-semibold', tone(sumOf(m.userId, 'saved')))} />} />,
        ])}
        {isCouple && <Column align="right" footer={<Money value={saved} className={cx('font-semibold', tone(saved))} />} />}
        <Column align="right" footer={<Money value={rows[0]?.cumulative ?? 0} className="font-semibold" />} />
      </Row>
    </ColumnGroup>
  );

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <StatRail items={[
        ...members.map((m) => ({
          label: `${m.displayName} · lifetime earnings`, value: sumOf(m.userId, 'income'), tone: 'text-emerald-700', icon: <ArrowDownRight className="size-3.5" />,
          sub: `Spent ${moneyIn(sumOf(m.userId, 'spent'), 'AED')} · saved ${moneyIn(sumOf(m.userId, 'saved'), 'AED')}`,
        })),
        { label: 'Household saved', value: saved, tone: tone(saved), icon: <PiggyBank className="size-3.5" />, sub: `${pct(saved, income)}% of ${moneyIn(income, 'AED')} earned` },
        { label: 'Average saved a month', value: rows.length ? saved / rows.length : 0, tone: tone(saved), icon: <BarChart3 className="size-3.5" />, sub: first ? `${rows.length} month${rows.length === 1 ? '' : 's'} since ${monthLabel(first, 'short')}` : '—' },
      ]} />
      <TableCard>
        <DataTable
          value={rows} dataKey="month" size="small" headerColumnGroup={header} footerColumnGroup={rows.length ? footer : undefined}
          tableStyle={{ minWidth: isCouple ? '62rem' : '32rem' }}
          emptyMessage={loading ? <TableSkeleton cols={isCouple ? 9 : 4} /> : <p className="px-3 py-6 text-center text-xs text-stone-500">No months yet.</p>}
        >
          <Column body={(s: Saving) => <span className="font-medium">{monthLabel(s.month, 'short')}</span>} />
          {members.flatMap((m) => [
            <Column key={`${m.userId}-i`} align="right" body={(s: Saving) => <Money value={s.members.find((x) => x.userId === m.userId)?.income ?? 0} className="text-emerald-700" />} />,
            <Column key={`${m.userId}-s`} align="right" body={(s: Saving) => <Money value={s.members.find((x) => x.userId === m.userId)?.spent ?? 0} className="text-rose-600" />} />,
            <Column key={`${m.userId}-v`} align="right" body={(s: Saving) => {
              const v = s.members.find((x) => x.userId === m.userId)?.saved ?? 0;
              return <Money value={v} className={cx('font-semibold', tone(v))} />;
            }} />,
          ])}
          {isCouple && <Column align="right" body={(s: Saving) => <Money value={s.saved} className={cx('font-semibold', tone(s.saved))} />} />}
          <Column align="right" body={(s: Saving) => <Money value={s.cumulative} className={cx(s.cumulative < 0 ? 'text-rose-700' : 'text-stone-700')} />} />
        </DataTable>
      </TableCard>
      <p className="text-[11px] text-stone-500">
        In = income received for the month · Out = own expenses{isCouple ? ' plus each person’s share of common bills' : ''} · Saved = In − Out.
      </p>
    </div>
  );
}
