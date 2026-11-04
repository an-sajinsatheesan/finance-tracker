import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { currentMonth } from '../utils/month.js';
import { Account, Admin, Income, Invitation, User, Workspace } from '../models/index.js';
import { DUMMY_HASH, hashPassword } from './auth.service.js';
import { createInvitation } from './invite.service.js';

/** Admin sign-in against the admins collection (see `npm run admin:create`). */
export async function adminLogin(username: string, password: string) {
  const admin = await Admin.findOne({ username: username.toLowerCase().trim() }).select('+passwordHash');
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) throw new AppError(401, 'Invalid admin username or password');
  await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
  return { token: jwt.sign({ adm: true }, env.jwtSecret, { subject: String(admin._id), expiresIn: '8h' }) };
}

const joined = (u: { status?: string | null }) => u.status !== 'invited';
const revokeOpenInvites = (userId: unknown) =>
  Invitation.updateMany({ userId, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });

export async function listUsers() {
  const [users, workspaces] = await Promise.all([User.find().sort({ createdAt: 1 }).lean(), Workspace.find().lean()]);
  const wsName = new Map(workspaces.map((w) => [String(w._id), w.name]));
  return users
    // A member slot nobody has been invited to (e.g. after a delete) isn't a person.
    .filter((u) => joined(u) || u.email)
    .map((u) => ({
      id: String(u._id), displayName: u.displayName, email: u.email ?? null, username: u.username, status: u.status,
      workspaceId: String(u.workspaceId), workspaceName: wsName.get(String(u.workspaceId)) ?? '—',
      createdAt: (u as { createdAt?: Date }).createdAt ?? null, lastLoginAt: u.lastLoginAt ?? null,
      /** Deleting this person also deletes the workspace: nobody else has joined it. */
      lastInWorkspace: joined(u) && !users.some((o) => joined(o) && String(o._id) !== String(u._id) && String(o.workspaceId) === String(u.workspaceId)),
    }));
}

/** The short info card: who they are, their salary and this month's income so far. */
export async function userDetails(id: string) {
  const user = await User.findById(id).lean();
  if (!user) throw notFound('User');
  const ws = await Workspace.findById(user.workspaceId).lean();
  const member = ws?.members.find((m) => String(m.userId) === id);
  const month = currentMonth();
  const [income, accounts] = await Promise.all([
    Income.find({ workspaceId: user.workspaceId, userId: id, month, status: { $ne: 'archived' } }).lean(),
    Account.countDocuments({ workspaceId: user.workspaceId, archived: { $ne: true }, $or: [{ ownerId: id }, { type: 'common' }] }),
  ]);
  const salary = (member?.incomeSources ?? []).filter((s) => s.active !== false).map((s) => ({ source: s.source, amount: s.amount, day: s.expectedDay ?? 1 }));
  return {
    id, displayName: user.displayName, email: user.email ?? null, username: user.username, relationship: user.relationship ?? '', status: user.status,
    createdAt: (user as { createdAt?: Date }).createdAt ?? null, lastLoginAt: user.lastLoginAt ?? null,
    workspaceName: ws?.name ?? '—', partner: ws?.members.find((m) => String(m.userId) !== id)?.displayName ?? null,
    currency: ws?.currency ?? 'AED',
    salary, salaryTotal: salary.reduce((a, s) => a + s.amount, 0),
    month, expected: income.reduce((a, i) => a + i.expectedAmount, 0), received: income.reduce((a, i) => a + (i.receivedAmount ?? 0), 0),
    accounts,
  };
}

/** Freeze or unfreeze an account, or correct its name or email. */
export async function updateUser(id: string, input: { status?: 'active' | 'disabled'; email?: string; displayName?: string }) {
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  if (input.status) {
    if (user.status === 'invited') throw badRequest('This person hasn’t joined yet: set a password for them first');
    user.status = input.status;
  }
  const email = input.email?.toLowerCase().trim();
  const emailChanged = !!email && email !== user.email;
  if (emailChanged) {
    if (await User.exists({ _id: { $ne: user._id }, $or: [{ email }, { username: email }] })) throw new AppError(409, `An account with ${email} already exists`);
    if (!user.username || user.username === user.email || user.username.includes('@')) user.username = email;
    user.email = email;
  }
  if (input.displayName?.trim()) {
    user.displayName = input.displayName.trim();
    await Workspace.updateOne({ _id: user.workspaceId, 'members.userId': user._id }, { $set: { 'members.$.displayName': user.displayName } });
  }
  await user.save();

  // A link sent to the old address must stop working: accepting it would put that email back.
  let invite: { sent: boolean; email: string } | null = null;
  if (emailChanged) {
    if (user.status === 'invited') {
      const inviter = await User.findOne({ workspaceId: user.workspaceId, _id: { $ne: user._id }, status: { $ne: 'invited' } }).lean();
      const inv = await createInvitation({ workspaceId: String(user.workspaceId), userId: id, email: email!, invitedBy: String(inviter?._id ?? user._id) });
      invite = { sent: inv.sent, email: inv.email };
    } else {
      await revokeOpenInvites(user._id);
    }
  }
  return { user: (await listUsers()).find((u) => u.id === id), invite };
}

/** Sets a new password and signs the person out everywhere. Someone still invited can now sign in. */
export async function setPassword(id: string, password: string) {
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  if (user.status === 'invited') user.status = 'active';
  await user.save();
  await revokeOpenInvites(user._id);
  return (await listUsers()).find((u) => u.id === id);
}

/**
 * Deletes a person. With someone else still in the workspace, only the sign-in goes: the member
 * stays as an open slot because shared records and 50/50 splits need it, the email is free
 * again, and the partner can invite someone to the slot from Settings. The last person in a
 * workspace takes the whole workspace and all its data with them, permanently.
 */
export async function deleteUser(id: string) {
  const user = await User.findById(id).lean();
  if (!user) throw notFound('User');
  const othersJoined = await User.exists({ _id: { $ne: user._id }, workspaceId: user.workspaceId, status: { $ne: 'invited' } });
  if (!joined(user) || othersJoined) {
    await revokeOpenInvites(user._id);
    await User.updateOne(
      { _id: user._id },
      {
        $set: { status: 'invited', username: `partner-${new Types.ObjectId().toHexString()}` },
        $unset: { email: 1, passwordHash: 1, passwordChangedAt: 1, lastLoginAt: 1 },
      },
    );
    return { workspaceDeleted: false };
  }
  for (const name of mongoose.modelNames()) {
    const m = mongoose.model(name);
    if (m.schema.path('workspaceId')) await m.deleteMany({ workspaceId: user.workspaceId });
  }
  await Workspace.deleteOne({ _id: user.workspaceId });
  return { workspaceDeleted: true };
}
