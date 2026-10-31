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
  updateExpected: (id: Id, set: Record<string, unknown>) => Income.updateOne({ _id: id, status: 'expected' }, { $set: set }),
  isMonthGenerated: async (workspaceId: Id, month: string) => !!(await IncomeMonth.exists({ workspaceId, month })),
  markMonthGenerated: (workspaceId: Id, month: string) =>
    IncomeMonth.updateOne({ workspaceId, month }, { $setOnInsert: { workspaceId, month } }, { upsert: true }).catch((err) => {
      if ((err as { code?: number }).code !== 11000) throw err; // a concurrent request marked it first
    }),
  /**
   * Inserts generated rows unless they already exist (keyed by member + source).
   * Safe to run concurrently: duplicates are rejected by the unique index.
   */
  async insertGenerated(docs: Record<string, any>[]) {
    if (!docs.length) return;
    try {
      await Income.bulkWrite(
        docs.map((d) => ({
          updateOne: {
            filter: { workspaceId: d.workspaceId, month: d.month, userId: d.userId, sourceKey: d.sourceKey },
            update: { $setOnInsert: d },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  },
};
