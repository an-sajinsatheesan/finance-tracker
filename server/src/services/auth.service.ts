import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError, badRequest, forbidden } from '../utils/AppError.js';
import { currentMonth } from '../utils/month.js';
import { User, Workspace } from '../models/index.js';
import { userRepository } from '../repositories/workspace.repository.js';
import { createInvitation } from './invite.service.js';

export const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

export function signToken(userId: string, workspaceId: string): string {
  return jwt.sign({ wid: workspaceId }, env.jwtSecret, {
    subject: userId,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

type UserLike = { _id: unknown; username: string; email?: string | null; displayName: string; relationship?: string | null; workspaceId: unknown };
export const publicUser = (u: UserLike) => ({
  id: String(u._id),
  username: u.username,
  email: u.email ?? null,
  displayName: u.displayName,
  relationship: u.relationship ?? '',
  workspaceId: String(u.workspaceId),
});

const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Z6Z6eYvF1E5j6hLkC0G9rZsY3b6y2W';

/** Signs in with email (or, for older accounts, username). */
export async function login(identifier: string, password: string) {
  const user = await userRepository.findByLoginWithPassword(identifier);
  // Compare against a dummy hash when the user does not exist, to keep timing similar.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok || user.status !== 'active') throw new AppError(401, 'Invalid email or password');
  await userRepository.touchLogin(user._id);
  return { token: signToken(String(user._id), String(user.workspaceId)), user: publicUser(user) };
}

export async function assertEmailFree(email: string) {
  const e = email.toLowerCase().trim();
  if (await User.exists({ $or: [{ email: e }, { username: e }] })) throw new AppError(409, `An account with ${e} already exists`);
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  relationship: string;
  mode: 'personal' | 'couple';
  workspaceName?: string;
  partner?: { displayName: string; email?: string | null; relationship: string } | null;
}

/**
 * Creates the user and their workspace. For a couple, the partner is added
 * straight away as an invited (not yet active) member so that common expenses
 * are split 50/50 from day one; the partner claims that member by accepting
 * the emailed invitation, which is sent once registration is complete.
 */
export async function register(input: RegisterInput) {
  if (!env.allowRegistration) throw forbidden('Registration is disabled on this server');
  const email = input.email.toLowerCase().trim();
  await assertEmailFree(email);
  const partnerEmail = input.mode === 'couple' ? input.partner?.email?.toLowerCase().trim() || null : null;
  if (partnerEmail) {
    if (partnerEmail === email) throw badRequest('Your partner needs a different email address');
    await assertEmailFree(partnerEmail);
  }

  const workspaceId = new Types.ObjectId();
  const owner = {
    _id: new Types.ObjectId(), username: email, email, passwordHash: await hashPassword(input.password),
    displayName: input.displayName, relationship: input.relationship, workspaceId, status: 'active',
  };
  const partner = input.mode === 'couple' && input.partner
    ? {
        _id: new Types.ObjectId(), username: partnerEmail ?? `partner-${new Types.ObjectId().toHexString()}`,
        email: partnerEmail ?? undefined, displayName: input.partner.displayName, relationship: input.partner.relationship,
        workspaceId, status: 'invited',
      }
    : null;
  if (input.mode === 'couple' && !partner) throw badRequest('Add your partner’s name');

  const name = input.workspaceName?.trim()
    || (partner ? `${input.displayName} & ${partner.displayName}` : `${input.displayName}'s finances`);
  await Workspace.create({
    _id: workspaceId, name, mode: input.mode, startMonth: currentMonth(), setupCompleted: false,
    members: [owner, ...(partner ? [partner] : [])].map((u) => ({
      userId: u._id, displayName: u.displayName, relationship: u.relationship, incomeSources: [],
    })),
  });
  try {
    await User.insertMany(partner ? [owner, partner] : [owner]);
  } catch (err) {
    await Workspace.deleteOne({ _id: workspaceId }); // keep things consistent if the email was taken meanwhile
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'That email address is already registered');
    throw err;
  }

  // Registration is complete — now send the partner invitation.
  const invite = partner && partnerEmail
    ? await createInvitation({ workspaceId: String(workspaceId), userId: String(partner._id), email: partnerEmail, invitedBy: String(owner._id) })
    : null;

  return { token: signToken(String(owner._id), String(workspaceId)), user: publicUser(owner), invite };
}

/** Your own name and login email. The email must not belong to another account. */
export async function updateProfile(userId: string, input: { email?: string; displayName?: string }) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(401, 'Account not available');
  if (input.email) {
    const email = input.email.toLowerCase().trim();
    if (email !== user.email) {
      if (await User.exists({ _id: { $ne: user._id }, $or: [{ email }, { username: email }] })) throw new AppError(409, `An account with ${email} already exists`);
      // Accounts that sign in with their email keep doing so with the new one.
      if (!user.username || user.username === user.email || user.username.includes('@')) user.username = email;
      user.email = email;
    }
  }
  if (input.displayName?.trim() && input.displayName.trim() !== user.displayName) {
    user.displayName = input.displayName.trim();
    await Workspace.updateOne({ _id: user.workspaceId, 'members.userId': user._id }, { $set: { 'members.$.displayName': user.displayName } });
  }
  await user.save();
  return publicUser(user);
}
