import type { Types } from 'mongoose';
import { Income, IncomeMonth } from '../models/index.js';

type Id = Types.ObjectId | string;

export const incomeRepository = {
  listByMonth: (workspaceId: Id, month: string) =>
    Income.find({ workspaceId, month }).sort({ expectedDate: 1, createdAt: 1 }).lean(),
  listByMonths: (workspaceId: Id, months: string[]) =>
    Income.find({ workspaceId, month: { $in: months }, status: { $ne: 'archived' } }).lean(),
  findById: (workspaceId: Id, id: Id) => Income.findOne({ _id: id, workspaceId }),
  create: (data: Record<string, unknown>) => Income.create(data),
  insertMany: (docs: Record<string, unknown>[]) => Income.insertMany(docs),
  /** Returns true if this call claimed the month (first time it is generated). */
  async claimMonth(workspaceId: Id, month: string): Promise<boolean> {
    const exists = await IncomeMonth.exists({ workspaceId, month });
    if (exists) return false;
    try {
      await IncomeMonth.create({ workspaceId, month });
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) return false; // another request won the race
      throw err;
    }
  },
};
