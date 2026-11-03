import { z } from 'zod';
import { LOOKUP_TYPES } from './lookups.js';
import { DATE_RE, MONTH_RE } from './month.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const month = z.string().regex(MONTH_RE, 'Month must be YYYY-MM');
export const date = z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD');
const money = z.coerce.number().finite().min(0).max(100_000_000);
const positiveMoney = z.coerce.number().finite().gt(0, 'Amount must be greater than 0').max(100_000_000);
/** Categories, banks, currencies... are Lookup codes, checked against the database in the services. */
const code = (max = 40) => z.string().trim().min(1).max(max);
const category = code();
const text = (max: number) => z.string().trim().max(max);

/** `email` also accepts the username of accounts created before email sign-in. */
export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

export const registerSchema = z
  .object({
    displayName: text(50).min(1),
    email,
    password,
    relationship: text(30).default(''),
    mode: z.enum(['personal', 'couple']),
    workspaceName: text(80).optional(),
    partner: z
      .object({ displayName: text(50).min(1), email: email.optional().nullable().or(z.literal('')), relationship: text(30).default('') })
      .optional()
      .nullable(),
  })
  .refine((v) => v.mode === 'personal' || !!v.partner, { message: 'Add your partner’s name', path: ['partner'] });

export const acceptInviteSchema = z.object({ password, displayName: text(50).optional() });
export const invitePartnerSchema = z.object({ email, displayName: text(50).optional(), relationship: text(30).optional() });

export const incomeSourceSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  source: code(80),
  amount: money,
  expectedDay: z.coerce.number().int().min(1).max(31).default(1),
  paidPreviousMonth: z.boolean().default(false),
  active: z.boolean().default(true),
  accountId: objectId.optional().nullable(),
});

export const workspaceUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  fxRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.coerce.number().finite().gt(0).max(1_000_000)).optional(),
  members: z
    .array(
      z.object({
        userId: objectId,
        displayName: text(50).min(1),
        relationship: text(30).default(''),
        incomeSources: z.array(incomeSourceSchema).max(10).optional(),
      }),
    )
    .optional(),
});

export const completeSetupSchema = z.object({ startMonth: month });

export const incomeCreateSchema = z.object({
  userId: objectId,
  month,
  source: code(80),
  expectedAmount: money,
  receivedAmount: money.default(0),
  expectedDate: date.optional().or(z.literal('')),
  receivedDate: date.optional().or(z.literal('')),
  status: z.enum(['expected', 'partial', 'received']).optional(),
  notes: text(500).default(''),
  accountId: objectId.optional().nullable(),
});
export const incomeUpdateSchema = incomeCreateSchema.omit({ month: true }).partial();

/** Days before the due day to remind; null = no reminder. */
const reminderDays = z.coerce.number().int().min(0).max(15).nullable();

/** How a common commitment is shared (50/50, agreed amounts, or by salary). */
const commitmentSplit = z.object({
  mode: z.enum(['equal', 'custom', 'income']),
  shares: z.array(z.object({ userId: objectId, amount: z.coerce.number().min(0).max(1e9) })).max(10).optional(),
});

export const commitmentCreateSchema = z
  .object({
    title: text(80).min(1),
    category,
    customCategory: text(40).default(''),
    type: z.enum(['personal', 'common']),
    ownerId: objectId.optional().nullable(),
    amount: positiveMoney,
    startMonth: month,
    endMonth: month.optional().nullable(),
    dueDay: z.coerce.number().int().min(1).max(31).default(1),
    reminderDaysBefore: reminderDays.default(3),
    split: commitmentSplit.optional(),
    notes: text(500).default(''),
  })
  .refine((v) => v.type === 'common' || !!v.ownerId, { message: 'Personal commitments need an owner', path: ['ownerId'] })
  .refine((v) => !v.endMonth || v.endMonth >= v.startMonth, { message: 'End month must be after start month', path: ['endMonth'] })
  .refine((v) => v.category !== 'Custom' || v.customCategory.length > 0, { message: 'Name the custom category', path: ['customCategory'] });

export const commitmentUpdateSchema = z.object({
  title: text(80).min(1).optional(),
  category: category.optional(),
  customCategory: text(40).optional(),
  type: z.enum(['personal', 'common']).optional(),
  ownerId: objectId.optional().nullable(),
  amount: positiveMoney.optional(),
  /** Month from which a new amount applies. Earlier months keep the old amount. */
  amountEffectiveFrom: month.optional(),
  startMonth: month.optional(),
  endMonth: month.optional().nullable(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  reminderDaysBefore: reminderDays.optional(),
  split: commitmentSplit.optional(),
  notes: text(500).optional(),
});

export const commitmentEndSchema = z.object({ endMonth: month });
export const commitmentPaySchema = z.object({
  month,
  date: date.optional(),
  paidBy: objectId.optional(),
  amount: positiveMoney.optional(),
  accountId: objectId.optional().nullable(),
  /** true: this payment completes the month even if smaller; false: part of it (the rest comes later). */
  settles: z.boolean().optional(),
  /** false: recorded from the common account but the provider isn't paid yet. */
  paidOut: z.boolean().optional(),
});

/** A partner's share of a common commitment sent to the partner who pays it, or into a joint account. */
export const commitmentShareSchema = z.object({
  month,
  amount: positiveMoney,
  date: date.optional(),
  fromUserId: objectId.optional(),
  fromAccountId: objectId.optional().nullable(),
  toUserId: objectId.optional().nullable(),
  toAccountId: objectId.optional().nullable(),
});

export const expenseCreateSchema = z
  .object({
    date,
    description: text(120).min(1),
    category,
    customCategory: text(40).default(''),
    amount: positiveMoney,
    paidBy: objectId,
    type: z.enum(['personal', 'common']),
    ownerId: objectId.optional().nullable(),
    notes: text(500).default(''),
    commitmentId: objectId.optional().nullable(),
    accountId: objectId.optional().nullable(),
  })
  .refine((v) => v.category !== 'Custom' || v.customCategory.length > 0, { message: 'Name the custom category', path: ['customCategory'] });

export const expenseUpdateSchema = z.object({
  date: date.optional(),
  description: text(120).min(1).optional(),
  category: category.optional(),
  customCategory: text(40).optional(),
  amount: positiveMoney.optional(),
  paidBy: objectId.optional(),
  type: z.enum(['personal', 'common']).optional(),
  ownerId: objectId.optional().nullable(),
  notes: text(500).optional(),
  accountId: objectId.optional().nullable(),
  /** Bill paid from the common account: has the provider been paid yet, and when. */
  paidOut: z.boolean().optional(),
  paidOutDate: date.optional().nullable(),
});

export const goalCreateSchema = z
  .object({
    name: text(80).min(1),
    targetAmount: money.default(0),
    type: z.enum(['personal', 'common']),
    ownerId: objectId.optional().nullable(),
    notes: text(500).default(''),
  })
  .refine((v) => v.type === 'common' || !!v.ownerId, { message: 'Personal goals need an owner', path: ['ownerId'] });
export const goalUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  targetAmount: money.optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  notes: text(500).optional(),
});
export const allocationCreateSchema = z.object({
  userId: objectId,
  date,
  amount: positiveMoney,
  note: text(200).default(''),
});

// ---------- Lookups ----------

export const lookupCreateSchema = z.object({
  type: z.enum(Object.keys(LOOKUP_TYPES) as [keyof typeof LOOKUP_TYPES, ...(keyof typeof LOOKUP_TYPES)[]]),
  code: text(40).optional(),
  label: text(60).min(1),
  meta: z.record(z.union([z.string().max(60), z.number(), z.boolean()])).optional(),
});
export const lookupUpdateSchema = z.object({
  label: text(60).min(1).optional(),
  active: z.boolean().optional(),
  meta: z.record(z.union([z.string().max(60), z.number(), z.boolean()])).optional(),
});

// ---------- Accounts & wealth ----------

const signedMoney = z.coerce.number().finite().min(-100_000_000).max(100_000_000);

export const accountCreateSchema = z
  .object({
    name: text(80).min(1),
    bank: code(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code'),
    accountType: code(),
    type: z.enum(['personal', 'common']),
    ownerId: objectId.optional().nullable(),
    accountNumberLast4: z.string().trim().regex(/^\d{0,4}$/, 'Up to 4 digits').default(''),
    openedMonth: month,
    notes: text(500).default(''),
    openingBalance: signedMoney.optional().nullable(),
    openingInvested: money.optional().nullable(),
  })
  .refine((v) => v.type === 'common' || !!v.ownerId, { message: 'Personal accounts need an owner', path: ['ownerId'] });

export const accountUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  bank: code().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  accountType: code().optional(),
  type: z.enum(['personal', 'common']).optional(),
  ownerId: objectId.optional().nullable(),
  accountNumberLast4: z.string().trim().regex(/^\d{0,4}$/).optional(),
  openedMonth: month.optional(),
  notes: text(500).optional(),
  archived: z.boolean().optional(),
  /** Balance at the start of `openedMonth` (null removes it). */
  openingBalance: signedMoney.optional().nullable(),
});

export const balancesSaveSchema = z.object({
  month,
  items: z
    .array(z.object({ accountId: objectId, balance: signedMoney.nullable(), invested: money.optional().nullable(), note: text(200).optional() }))
    .min(1)
    .max(200),
});

export const transferCreateSchema = z.object({
  date,
  fromAccountId: objectId,
  toAccountId: objectId,
  amount: positiveMoney,
  toAmount: positiveMoney.optional().nullable(),
  fee: money.default(0),
  note: text(200).default(''),
});

export const wealthQuery = z.object({ month, scope: z.string().min(1).default('all') });

export const monthQuery = z.object({ month });
export const summaryQuery = z.object({ month, scope: z.string().min(1) });

// ---------- Contracts (rent cheques) & deposits ----------

const owner = { type: z.enum(['personal', 'common']), ownerId: objectId.optional().nullable() };
const ownerNeeded = (v: { type?: string; ownerId?: string | null }) => v.type !== 'personal' || !!v.ownerId;

export const contractCreateSchema = z
  .object({
    ...owner,
    name: text(80).min(1),
    startDate: date,
    months: z.coerce.number().int().min(1).max(60),
    totalAmount: positiveMoney,
    chequeCount: z.coerce.number().int().min(1).max(60),
    commitmentId: objectId.optional().nullable(),
    accountId: objectId.optional().nullable(),
    notes: text(500).default(''),
    chequesPaid: z.coerce.number().int().min(0).max(60).optional(),
  })
  .refine(ownerNeeded, { message: 'Personal contracts need an owner', path: ['ownerId'] });

export const contractUpdateSchema = z.object({
  type: owner.type.optional(),
  ownerId: owner.ownerId,
  name: text(80).min(1).optional(),
  startDate: date.optional(),
  months: z.coerce.number().int().min(1).max(60).optional(),
  totalAmount: positiveMoney.optional(),
  chequeCount: z.coerce.number().int().min(1).max(60).optional(),
  commitmentId: objectId.optional().nullable(),
  accountId: objectId.optional().nullable(),
  notes: text(500).optional(),
});

export const contractRenewSchema = z.object({
  totalAmount: positiveMoney,
  chequeCount: z.coerce.number().int().min(1).max(60),
  months: z.coerce.number().int().min(1).max(60).optional(),
  startDate: date.optional(),
});

export const chequeSchema = z.object({ cleared: z.boolean(), clearedDate: date.optional().nullable() });

export const depositCreateSchema = z
  .object({
    ...owner,
    name: text(80).min(1),
    amount: positiveMoney,
    contractId: objectId.optional().nullable(),
    paidDate: date.optional().nullable(),
    refundedDate: date.optional().nullable(),
    notes: text(500).default(''),
  })
  .refine(ownerNeeded, { message: 'Personal deposits need an owner', path: ['ownerId'] });

export const depositUpdateSchema = z.object({
  type: owner.type.optional(),
  ownerId: owner.ownerId,
  name: text(80).min(1).optional(),
  amount: positiveMoney.optional(),
  contractId: objectId.optional().nullable(),
  paidDate: date.optional().nullable(),
  refundedDate: date.optional().nullable(),
  notes: text(500).optional(),
  archived: z.boolean().optional(),
});
