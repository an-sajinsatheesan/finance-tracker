import type { Types } from 'mongoose';
import { Expense } from '../models/index.js';

type Id = Types.ObjectId | string;

export const expenseRepository = {
  listByMonth: (workspaceId: Id, month: string, includeArchived = false) =>
    Expense.find({ workspaceId, month, ...(includeArchived ? {} : { status: 'active' }) })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
  listActiveByMonths: (workspaceId: Id, months: string[]) =>
    Expense.find({ workspaceId, month: { $in: months }, status: 'active' }).lean(),
  findById: (workspaceId: Id, id: Id) => Expense.findOne({ _id: id, workspaceId }),
  findForCommitment: (workspaceId: Id, commitmentId: Id, month: string) =>
    Expense.findOne({ workspaceId, commitmentId, month, status: 'active' }).lean(),
  create: (data: Record<string, unknown>) => Expense.create(data),
};
