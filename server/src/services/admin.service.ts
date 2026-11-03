import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { Invitation, User, Workspace } from '../models/index.js';
import { createInvitation } from './invite.service.js';

/** Constant-time comparison so the check doesn't leak how much of the input matched. */
const same = (a: string, b: string) => {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
};

/** Admin sign-in with the ADMIN_USERNAME / ADMIN_PASSWORD set on the server. */
export function adminLogin(username: string, password: string) {
  if (!env.adminPassword) throw new AppError(503, 'The admin panel is not set up on this server (ADMIN_PASSWORD is missing)');
  if (!same(username.toLowerCase().trim(), env.adminUsername) || !same(password, env.adminPassword)) throw new AppError(401, 'Invalid admin username or password');
  return { token: jwt.sign({ adm: true }, env.jwtSecret, { subject: 'admin', expiresIn: '8h' }) };
}

export async function listUsers() {
  const [users, workspaces] = await Promise.all([User.find().sort({ createdAt: 1 }).lean(), Workspace.find().lean()]);
  const wsName = new Map(workspaces.map((w) => [String(w._id), w.name]));
  return users.map((u) => ({
    id: String(u._id), displayName: u.displayName, email: u.email ?? null, username: u.username, status: u.status,
    workspaceId: String(u.workspaceId), workspaceName: wsName.get(String(u.workspaceId)) ?? '—',
    createdAt: (u as { createdAt?: Date }).createdAt ?? null, lastLoginAt: u.lastLoginAt ?? null,
  }));
}

/** Enable or disable an account, or correct its name or email. */
export async function updateUser(id: string, input: { status?: 'active' | 'disabled'; email?: string; displayName?: string }) {
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  if (input.status) {
    if (input.status === 'active' && !(await User.findById(id).select('+passwordHash').lean())?.passwordHash) {
      throw badRequest('This person hasn’t set a password yet: send them a password link instead');
    }
    user.status = input.status;
  }
  if (input.email && input.email.toLowerCase().trim() !== user.email) {
    // Someone who has joined changes their own email in Settings: the admin must not be able
    // to point an account at an address they control (and then reset its password).
    if (user.status !== 'invited') throw badRequest('Only the person can change their sign-in email, in their Settings');
    const email = input.email.toLowerCase().trim();
    if (await User.exists({ _id: { $ne: user._id }, $or: [{ email }, { username: email }] })) throw new AppError(409, `An account with ${email} already exists`);
    if (!user.username || user.username === user.email || user.username.includes('@')) user.username = email;
    user.email = email;
  }
  if (input.displayName?.trim()) {
    user.displayName = input.displayName.trim();
    await Workspace.updateOne({ _id: user.workspaceId, 'members.userId': user._id }, { $set: { 'members.$.displayName': user.displayName } });
  }
  await user.save();
  return (await listUsers()).find((u) => u.id === id);
}

/**
 * Emails the person a link to set a new password (it works like an invitation). The link is
 * only ever sent to their own email, never shown to the admin, so the admin can't use it to
 * get into anyone's finances.
 */
export async function passwordLink(id: string) {
  const user = await User.findById(id).lean();
  if (!user) throw notFound('User');
  if (!user.email) throw badRequest('This person has no email to send the link to');
  if (user.status === 'disabled') throw badRequest('Enable the account first');
  const inv = await createInvitation({ workspaceId: String(user.workspaceId), userId: String(user._id), email: user.email, invitedBy: String(user._id) });
  if (!inv.sent) {
    await Invitation.updateOne({ _id: inv.id }, { $set: { revokedAt: new Date() } });
    throw new AppError(503, 'Email isn’t set up on the server, so the link can’t be sent. Their partner can use “Invite again” in Settings.');
  }
  return { sent: true, email: inv.email };
}
