/** Category codes come from the Lookup table (type "category"). */
export type Category = string;

export type LookupType =
  | 'relationship' | 'workspaceMode' | 'memberStatus' | 'currency' | 'incomeSource' | 'incomeStatus'
  | 'commitmentType' | 'commitmentStatus' | 'category' | 'expenseStatus' | 'goalStatus' | 'bank' | 'accountType';
export interface LookupItem {
  id: string; type: LookupType; code: string; label: string; sortOrder: number; active: boolean;
  system: boolean; custom: boolean; meta: Record<string, string | number | boolean>;
}
export type Lookups = Partial<Record<LookupType, LookupItem[]>>;

export type Kind = 'personal' | 'common';

export interface AuthUser { id: string; workspaceId: string; username: string; email: string | null; displayName: string; relationship: string }

export interface IncomeSource { key?: string; source: string; amount: number; expectedDay: number; paidPreviousMonth?: boolean; active: boolean; accountId?: string | null }
export interface Member {
  userId: string; displayName: string; relationship: string; email: string | null;
  status: 'active' | 'invited' | 'disabled'; incomeSources: IncomeSource[];
}
export interface Workspace {
  id: string; name: string; mode: 'personal' | 'couple'; currency: string; fxRates: Record<string, number>;
  setupCompleted: boolean; startMonth: string; members: Member[];
}
export interface InviteResult { id: string; email: string; expiresAt: string; sent: boolean; url: string }
export interface PendingInvite { id: string; userId: string; email: string; expiresAt: string; lastSentAt?: string; expired: boolean }

export interface Income {
  _id: string; userId: string; month: string; source: string; expectedAmount: number; receivedAmount: number;
  expectedDate?: string; receivedDate?: string; status: 'expected' | 'partial' | 'received' | 'archived'; notes: string;
  accountId?: string | null;
}

/** How a common commitment is shared: 50/50, agreed amounts, or by expected income. */
export type SplitMode = 'equal' | 'custom' | 'income';
export interface Share { userId: string; amount: number }
export interface CommitmentSplit { mode: SplitMode; shares?: Share[] }

/** A partner's share sent to the one who pays the bill (toUserId empty: into a joint account). */
export interface SentShare { id: string; fromUserId: string; toUserId: string | null; toAccountId: string | null; amount: number; date: string }
export interface CommitmentPayment {
  paidAmount: number; remaining: number; paid: boolean; contributions: { userId: string; amount: number }[];
  sent?: SentShare[];
}
export interface Commitment {
  id: string; title: string; category: Category; customCategory: string; type: Kind; ownerId: string | null;
  amount: number; amountHistory: { fromMonth: string; amount: number }[]; startMonth: string; endMonth: string | null;
  dueDay: number; reminderDaysBefore: number | null; notes: string; status: 'active' | 'scheduled' | 'ended';
  /** Paid towards it in the month asked for (each partner can pay part of a common bill). */
  payment?: CommitmentPayment;
  split: CommitmentSplit;
  /** Each person's planned part this month (common only). */
  shares?: Share[];
}

export interface Reminder {
  id: string; title: string; type: Kind; ownerId: string | null; category: string; month: string; dueDate: string;
  daysUntil: number; amount: number; myShare: number; status: 'overdue' | 'due-today' | 'due-soon';
}

export interface Expense {
  _id: string; date: string; month: string; description: string; category: Category; customCategory: string;
  amount: number; paidBy: string; type: Kind; ownerId?: string; shares: { userId: string; amount: number }[];
  commitmentId?: string; notes: string; status: 'active' | 'archived';
  accountId?: string | null;
}

export interface Goal {
  _id: string; name: string; targetAmount: number; type: Kind; ownerId?: string; status: 'active' | 'completed' | 'archived';
  notes: string; allocatedTotal: number;
}
export interface Allocation { _id: string; goalId: string; userId: string; month: string; date: string; amount: number; note: string; status: string }

export interface Cards {
  incomeExpected: number; incomeReceived: number; incomePending: number; personalExpenses: number; commonShare: number;
  commonTotal: number; totalOutflow: number; cashLeft: number; allocatedToGoals: number; notYetAllocated: number;
  plannedCommitments: number; plannedBalance: number;
  members: { userId: string; commonPaid: number; commonShare: number; balance: number }[];
  /** Partners paying each other's personal bills this month (not owed back). */
  support: { from: string; to: string; amount: number }[];
}
export interface Summary {
  month: string; scope: string; cards: Cards;
  budgetVsActual: { category: string; planned: number; actual: number }[];
  daily: { day: number; personal: number; common: number }[];
  trend: { month: string; incomeReceived: number; outflow: number; planned: number }[];
  commitmentsDue: {
    id: string; title: string; type: Kind; ownerId: string | null; category: string; dueDay: number; amount: number; myShare: number; paid: boolean; payment: CommitmentPayment;
    split: SplitMode; shares?: Share[];
  }[];
}

export type AccountGroup = 'cash' | 'deposit' | 'investment' | 'liability';
export interface Account {
  id: string; name: string; bank: string; currency: string; accountType: string; group: AccountGroup; type: Kind;
  ownerId: string | null; accountNumberLast4: string; openedMonth: string; notes: string; archived: boolean;
}
export interface WealthAccount extends Account {
  current: number | null; previous: number | null; change: number | null; recordedThisMonth: boolean;
  lastRecordedMonth: string | null; invested: number | null; gain: number | null;
}
export interface Transfer {
  _id: string; date: string; month: string; fromAccountId: string; toAccountId: string; amount: number; toAmount: number;
  fee: number; note: string;
}
export interface Wealth {
  month: string; base: string; fx: Record<string, number>;
  accounts: WealthAccount[];
  byCurrency: {
    currency: string; assets: number; liabilities: number; net: number; previousNet: number; change: number; netInBase: number;
    groups: { group: AccountGroup; current: number; previous: number; change: number }[];
    investments: { value: number; invested: number; gain: number };
  }[];
  combined: { currency: string; assets: number; liabilities: number; net: number; previousNet: number; change: number };
  trend: { month: string; net: number; byCurrency: Record<string, number>; transferredOut: number }[];
  transferSummary: { from: string; to: string; amount: number; toAmount: number; fee: number; count: number; rate: number | null }[];
  missingRates: string[];
  staleAccounts: string[];
}

/** Calculated balances (GET /balances): recorded balance + linked income, expenses and transfers. */
export interface BalanceAccount extends Account {
  opening: number; moneyIn: number; moneyOut: number; closing: number; recorded: boolean; untracked: number | null;
}
export interface BalanceTotals { household: number; joint: number; members: Record<string, number> }
export interface Balances {
  month: string; base: string; missingRates: string[];
  accounts: BalanceAccount[];
  totals: BalanceTotals;
  trend: ({ month: string } & BalanceTotals)[];
  savings: {
    month: string; income: number; spent: number; saved: number; cumulative: number;
    members: { userId: string; income: number; spent: number; saved: number }[];
  }[];
  unlinked: { expenses: { count: number; amount: number }; income: { count: number; amount: number } };
}
