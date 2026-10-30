import { z } from 'zod';
import { CATEGORIES } from './categories.js';
import { DATE_RE, MONTH_RE } from './month.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const month = z.string().regex(MONTH_RE, 'Month must be YYYY-MM');
export const date = z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD');
const money = z.coerce.number().finite().min(0).max(100_000_000);
const positiveMoney = z.coerce.number().finite().gt(0, 'Amount must be greater than 0').max(100_000_000);
const category = z.enum(CATEGORIES);
const text = (max: number) => z.string().trim().max(max);

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const incomeSourceSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  source: text(80).min(1),
  amount: money,
  expectedDay: z.coerce.number().int().min(1).max(31).default(1),
  active: z.boolean().default(true),
});

export const workspaceUpdateSchema = z.object({
  name: text(80).min(1).optional(),
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
  source: text(80).min(1),
  expectedAmount: money,
  receivedAmount: money.default(0),
  expectedDate: date.optional().or(z.literal('')),
  receivedDate: date.optional().or(z.literal('')),
  status: z.enum(['expected', 'partial', 'received']).optional(),
  notes: text(500).default(''),
});
export const incomeUpdateSchema = incomeCreateSchema.omit({ month: true }).partial();

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
  notes: text(500).optional(),
});

export const commitmentEndSchema = z.object({ endMonth: month });
export const commitmentPaySchema = z.object({
  month,
  date: date.optional(),
  paidBy: objectId.optional(),
  amount: positiveMoney.optional(),
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

export const monthQuery = z.object({ month });
export const summaryQuery = z.object({ month, scope: z.string().min(1) });
