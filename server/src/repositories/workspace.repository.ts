import type { Types } from 'mongoose';
import { Workspace, User } from '../models/index.js';

type Id = Types.ObjectId | string;

export const workspaceRepository = {
  findById: (id: Id) => Workspace.findById(id),
  findByIdLean: (id: Id) => Workspace.findById(id).lean(),
  findFirst: () => Workspace.findOne().sort({ createdAt: 1 }),
  create: (data: Record<string, unknown>) => Workspace.create(data),
};

export const userRepository = {
  findByUsernameWithPassword: (username: string) =>
    User.findOne({ username: username.toLowerCase().trim() }).select('+passwordHash'),
  findById: (id: Id) => User.findById(id).lean(),
  findByWorkspace: (workspaceId: Id) => User.find({ workspaceId }).sort({ createdAt: 1 }).lean(),
  findByUsername: (username: string) => User.findOne({ username: username.toLowerCase().trim() }),
  touchLogin: (id: Id) => User.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } }),
};
