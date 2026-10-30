import type { Types } from 'mongoose';
import { Commitment } from '../models/index.js';

type Id = Types.ObjectId | string;

export const commitmentRepository = {
  list: (workspaceId: Id) => Commitment.find({ workspaceId, archived: false }).sort({ startMonth: 1, title: 1 }).lean(),
  /** Commitments that overlap a range of months. */
  listOverlapping: (workspaceId: Id, fromMonth: string, toMonth: string) =>
    Commitment.find({
      workspaceId,
      archived: false,
      startMonth: { $lte: toMonth },
      $or: [{ endMonth: null }, { endMonth: { $gte: fromMonth } }],
    }).lean(),
  findById: (workspaceId: Id, id: Id) => Commitment.findOne({ _id: id, workspaceId }),
  create: (data: Record<string, unknown>) => Commitment.create(data),
};
