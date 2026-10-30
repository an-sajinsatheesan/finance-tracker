import type { Types } from 'mongoose';
import { Goal, GoalAllocation } from '../models/index.js';

type Id = Types.ObjectId | string;

export const goalRepository = {
  list: (workspaceId: Id) => Goal.find({ workspaceId }).sort({ createdAt: 1 }).lean(),
  findById: (workspaceId: Id, id: Id) => Goal.findOne({ _id: id, workspaceId }),
  create: (data: Record<string, unknown>) => Goal.create(data),
  listAllocations: (workspaceId: Id, filter: Record<string, unknown> = {}) =>
    GoalAllocation.find({ workspaceId, ...filter }).sort({ date: -1, createdAt: -1 }).lean(),
  listActiveAllocationsByMonths: (workspaceId: Id, months: string[]) =>
    GoalAllocation.find({ workspaceId, month: { $in: months }, status: 'active' }).lean(),
  findAllocation: (workspaceId: Id, id: Id) => GoalAllocation.findOne({ _id: id, workspaceId }),
  createAllocation: (data: Record<string, unknown>) => GoalAllocation.create(data),
};
