export type Category =
  | 'Rent' | 'DEWA/Utilities' | 'Internet' | 'Grocery' | 'Home Loan' | 'EMI' | 'Chitti'
  | 'Family Support' | 'Travel' | 'Insurance' | 'Subscription' | 'Custom';

export const CATEGORIES: Category[] = [
  'Rent', 'DEWA/Utilities', 'Internet', 'Grocery', 'Home Loan', 'EMI', 'Chitti',
  'Family Support', 'Travel', 'Insurance', 'Subscription', 'Custom',
];

export type Kind = 'personal' | 'common';

export interface AuthUser { id: string; workspaceId: string; username: string; displayName: string }

export interface IncomeSource { key?: string; source: string; amount: number; expectedDay: number; active: boolean }
export interface Member { userId: string; displayName: string; relationship: string; incomeSources: IncomeSource[] }
export interface Workspace { id: string; name: string; currency: string; setupCompleted: boolean; startMonth: string; members: Member[] }

export interface Income {
  _id: string; userId: string; month: string; source: string; expectedAmount: number; receivedAmount: number;
  expectedDate?: string; receivedDate?: string; status: 'expected' | 'partial' | 'received' | 'archived'; notes: string;
}

export interface Commitment {
  id: string; title: string; category: Category; customCategory: string; type: Kind; ownerId: string | null;
  amount: number; amountHistory: { fromMonth: string; amount: number }[]; startMonth: string; endMonth: string | null;
  dueDay: number; notes: string; status: 'active' | 'scheduled' | 'ended';
}

export interface Expense {
  _id: string; date: string; month: string; description: string; category: Category; customCategory: string;
  amount: number; paidBy: string; type: Kind; ownerId?: string; shares: { userId: string; amount: number }[];
  commitmentId?: string; notes: string; status: 'active' | 'archived';
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
}
export interface Summary {
  month: string; scope: string; cards: Cards;
  budgetVsActual: { category: string; planned: number; actual: number }[];
  daily: { day: number; personal: number; common: number }[];
  trend: { month: string; incomeReceived: number; outflow: number; planned: number }[];
  commitmentsDue: { id: string; title: string; type: Kind; category: string; dueDay: number; amount: number; myShare: number; paid: boolean }[];
}
