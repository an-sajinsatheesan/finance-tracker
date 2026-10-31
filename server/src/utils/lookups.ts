/**
 * Seed rows for the Lookup table. Codes that existing records already store
 * (categories, income sources) are kept identical to their old string values.
 */
export const LOOKUP_TYPES = {
  relationship: 'relationship',
  workspaceMode: 'workspaceMode',
  memberStatus: 'memberStatus',
  currency: 'currency',
  incomeSource: 'incomeSource',
  incomeStatus: 'incomeStatus',
  commitmentType: 'commitmentType',
  commitmentStatus: 'commitmentStatus',
  category: 'category',
  expenseStatus: 'expenseStatus',
  goalStatus: 'goalStatus',
  bank: 'bank',
  accountType: 'accountType',
} as const;
export type LookupType = keyof typeof LOOKUP_TYPES;

/** Types a workspace may add its own values to. The rest are fixed by the app. */
export const EXTENDABLE_TYPES: LookupType[] = ['relationship', 'incomeSource', 'category', 'bank', 'accountType', 'currency'];

type Row = { code: string; label?: string; meta?: Record<string, unknown> };
const sys = (rows: Row[]) => rows.map((r) => ({ ...r, system: true }));

export const LOOKUP_SEED: Record<LookupType, (Row & { system?: boolean })[]> = {
  relationship: [{ code: 'Husband' }, { code: 'Wife' }, { code: 'Partner' }, { code: 'Self' }, { code: 'Other' }],
  workspaceMode: sys([{ code: 'personal', label: 'Personal' }, { code: 'couple', label: 'Couple' }]),
  memberStatus: sys([{ code: 'active', label: 'Active' }, { code: 'invited', label: 'Invited' }, { code: 'disabled', label: 'Disabled' }]),
  currency: [
    { code: 'AED', label: 'UAE Dirham', meta: { symbol: 'AED', locale: 'en-AE' } },
    { code: 'INR', label: 'Indian Rupee', meta: { symbol: '₹', locale: 'en-IN' } },
    { code: 'USD', label: 'US Dollar', meta: { symbol: '$', locale: 'en-US' } },
  ],
  incomeSource: [
    { code: 'Salary' }, { code: 'Bonus' }, { code: 'Allowance' }, { code: 'Freelance' }, { code: 'Rental income' },
    { code: 'Interest' }, { code: 'Dividend' }, { code: 'Other' },
  ],
  incomeStatus: sys([
    { code: 'expected', label: 'Expected' }, { code: 'partial', label: 'Partial' },
    { code: 'received', label: 'Received' }, { code: 'archived', label: 'Archived' },
  ]),
  commitmentType: sys([{ code: 'personal', label: 'Personal' }, { code: 'common', label: 'Common' }]),
  commitmentStatus: sys([{ code: 'active', label: 'Active' }, { code: 'scheduled', label: 'Scheduled' }, { code: 'ended', label: 'Ended' }]),
  category: [
    { code: 'Rent' }, { code: 'Utilities' }, { code: 'Internet' }, { code: 'Mobile' }, { code: 'Grocery' },
    { code: 'Home Loan' }, { code: 'EMI' }, { code: 'Car Loan' }, { code: 'Credit Card' }, { code: 'Chitti' },
    { code: 'Family Support' }, { code: 'Travel' }, { code: 'Fuel' }, { code: 'Dining' }, { code: 'Shopping' },
    { code: 'Medical' }, { code: 'Education' }, { code: 'Insurance' }, { code: 'Subscription' },
    { code: 'Custom', label: 'Custom…', system: true },
  ],
  expenseStatus: sys([{ code: 'active', label: 'Active' }, { code: 'archived', label: 'Archived' }]),
  goalStatus: sys([{ code: 'active', label: 'Active' }, { code: 'completed', label: 'Completed' }, { code: 'archived', label: 'Archived' }]),
  bank: [
    { code: 'ENBD', label: 'Emirates NBD', meta: { currency: 'AED' } },
    { code: 'RAK', label: 'RAKBANK', meta: { currency: 'AED' } },
    { code: 'EIB', label: 'Emirates Islamic', meta: { currency: 'AED' } },
    { code: 'ADCB', label: 'ADCB', meta: { currency: 'AED' } },
    { code: 'FAB', label: 'First Abu Dhabi Bank', meta: { currency: 'AED' } },
    { code: 'MASHREQ', label: 'Mashreq', meta: { currency: 'AED' } },
    { code: 'DIB', label: 'Dubai Islamic Bank', meta: { currency: 'AED' } },
    { code: 'SBI', label: 'State Bank of India', meta: { currency: 'INR' } },
    { code: 'FEDERAL', label: 'Federal Bank', meta: { currency: 'INR' } },
    { code: 'HDFC', label: 'HDFC Bank', meta: { currency: 'INR' } },
    { code: 'ICICI', label: 'ICICI Bank', meta: { currency: 'INR' } },
    { code: 'AXIS', label: 'Axis Bank', meta: { currency: 'INR' } },
    { code: 'SIB', label: 'South Indian Bank', meta: { currency: 'INR' } },
    { code: 'ZERODHA', label: 'Zerodha', meta: { currency: 'INR' } },
    { code: 'GROWW', label: 'Groww', meta: { currency: 'INR' } },
    { code: 'OTHER', label: 'Other' },
  ],
  /** group: cash | deposit | investment | liability — drives the wealth dashboard. */
  accountType: [
    { code: 'savings', label: 'Savings', meta: { group: 'cash' } },
    { code: 'current', label: 'Current / salary', meta: { group: 'cash' } },
    { code: 'cash', label: 'Cash in hand', meta: { group: 'cash' } },
    { code: 'fixed_deposit', label: 'Fixed deposit', meta: { group: 'deposit' } },
    { code: 'recurring_deposit', label: 'Recurring deposit', meta: { group: 'deposit' } },
    { code: 'sip', label: 'SIP', meta: { group: 'investment' } },
    { code: 'mutual_fund', label: 'Mutual fund', meta: { group: 'investment' } },
    { code: 'stocks', label: 'Stocks', meta: { group: 'investment' } },
    { code: 'gold', label: 'Gold', meta: { group: 'investment' } },
    { code: 'ppf_nps', label: 'PPF / NPS / Pension', meta: { group: 'investment' } },
    { code: 'loan', label: 'Loan', meta: { group: 'liability' } },
    { code: 'credit_card', label: 'Credit card', meta: { group: 'liability' } },
  ],
};

export const ACCOUNT_GROUPS = ['cash', 'deposit', 'investment', 'liability'] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];
