import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { escapeHtml, sendMail } from '../utils/mailer.js';
import { Invitation, User, Workspace } from '../models/index.js';
// auth.service imports this module too; the cycle is safe because nothing runs at import time.
import { hashPassword, publicUser, signToken } from './auth.service.js';

const INVITE_DAYS = 14;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const inviteUrl = (token: string) => `${env.appUrl}/invite/${token}`;

/** Creates a fresh invitation (revoking older open ones for the same member) and emails it. */
export async function createInvitation(input: { workspaceId: string; userId: string; email: string; invitedBy: string }) {
  await Invitation.updateMany(
    { workspaceId: input.workspaceId, userId: input.userId, acceptedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const doc = await Invitation.create({
    workspaceId: input.workspaceId, userId: input.userId, email: input.email.toLowerCase(), tokenHash: hashToken(token),
    invitedBy: input.invitedBy, expiresAt,
  });
  const { sent } = await sendInviteEmail(doc._id, token);
  // The link is returned to the inviter so they can also share it directly.
  return { id: String(doc._id), email: doc.email, expiresAt, sent, url: inviteUrl(token) };
}

async function sendInviteEmail(inviteId: Types.ObjectId | string, token: string) {
  const inv = await Invitation.findById(inviteId);
  if (!inv) throw notFound('Invitation');
  const [inviter, ws] = await Promise.all([User.findById(inv.invitedBy).lean(), Workspace.findById(inv.workspaceId).lean()]);
  const who = inviter?.displayName ?? 'Your partner';
  const url = inviteUrl(token);
  const res = await sendMail({
    to: inv.email,
    subject: `${who} invited you to “${ws?.name ?? 'Household Finance'}”`,
    text: `${who} invited you to share the household finance workspace "${ws?.name}".\n\nAccept the invitation and choose your password:\n${url}\n\nThis link expires in ${INVITE_DAYS} days.`,
    html: `<p>${escapeHtml(who)} invited you to share the household finance workspace <b>${escapeHtml(ws?.name ?? '')}</b>.</p>
<p><a href="${url}">Accept the invitation and choose your password</a></p>
<p style="color:#78716c;font-size:12px">This link expires in ${INVITE_DAYS} days. If you weren't expecting it, ignore this email.</p>`,
  });
  inv.lastSentAt = new Date();
  inv.sendCount = (inv.sendCount ?? 0) + 1;
  await inv.save();
  return res;
}

async function findOpenInvite(token: string) {
  const inv = await Invitation.findOne({ tokenHash: hashToken(token) });
  if (!inv || inv.revokedAt) throw notFound('Invitation');
  if (inv.acceptedAt) throw new AppError(410, 'This invitation was already accepted. Sign in instead.');
  if (inv.expiresAt < new Date()) throw new AppError(410, 'This invitation has expired. Ask your partner to resend it.');
  return inv;
}

/** Public: what the invite page shows before the partner sets a password. */
export async function describeInvite(token: string) {
  const inv = await findOpenInvite(token);
  const [inviter, ws, member] = await Promise.all([
    User.findById(inv.invitedBy).lean(), Workspace.findById(inv.workspaceId).lean(), User.findById(inv.userId).lean(),
  ]);
  return { email: inv.email, workspaceName: ws?.name ?? '', invitedBy: inviter?.displayName ?? '', displayName: member?.displayName ?? '' };
}

/** The partner sets a password and becomes an active member of the workspace. */
export async function acceptInvite(token: string, input: { password: string; displayName?: string }) {
  const inv = await findOpenInvite(token);
  const user = await User.findOne({ _id: inv.userId, workspaceId: inv.workspaceId });
  if (!user || user.status === 'disabled') throw notFound('Invitation');
  const clash = await User.exists({ _id: { $ne: user._id }, $or: [{ email: inv.email }, { username: inv.email }] });
  if (clash) throw new AppError(409, `An account with ${inv.email} already exists`);

  user.passwordHash = await hashPassword(input.password);
  user.email = inv.email;
  user.username = inv.email;
  user.status = 'active';
  if (input.displayName?.trim()) user.displayName = input.displayName.trim();
  await user.save();
  if (input.displayName?.trim()) {
    await Workspace.updateOne({ _id: inv.workspaceId, 'members.userId': user._id }, { $set: { 'members.$.displayName': user.displayName } });
  }
  inv.acceptedAt = new Date();
  await inv.save();
  return { token: signToken(String(user._id), String(user.workspaceId)), user: publicUser(user) };
}

export async function listInvitations(workspaceId: string) {
  const docs = await Invitation.find({ workspaceId, acceptedAt: null, revokedAt: null }).sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    id: String(d._id), userId: String(d.userId), email: d.email, expiresAt: d.expiresAt, lastSentAt: d.lastSentAt,
    expired: d.expiresAt < new Date(),
  }));
}

/**
 * Invite (or re-invite) the partner from Settings. A personal workspace becomes
 * a couple workspace with a new invited member; an existing invited member
 * gets a fresh link (optionally to a corrected email).
 */
export async function invitePartner(
  workspaceId: string,
  invitedBy: string,
  input: { email: string; displayName?: string; relationship?: string },
) {
  const email = input.email.toLowerCase().trim();
  const ws = await Workspace.findById(workspaceId);
  if (!ws) throw notFound('Workspace');
  const users = await User.find({ workspaceId }).lean();
  const pending = users.find((u) => u.status === 'invited');
  const taken = await User.findOne({ $or: [{ email }, { username: email }] }).lean();
  if (taken && String(taken._id) !== String(pending?._id)) throw new AppError(409, `An account with ${email} already exists`);

  let partnerId: string;
  if (pending) {
    await User.updateOne({ _id: pending._id }, { $set: { email, username: email } });
    partnerId = String(pending._id);
  } else {
    if (ws.members.length >= 2) throw badRequest('This workspace already has two members');
    if (!input.displayName?.trim()) throw badRequest('Add your partner’s name');
    const u = await User.create({
      username: email, email, displayName: input.displayName.trim(), relationship: input.relationship ?? '',
      workspaceId, status: 'invited',
    });
    ws.members.push({ userId: u._id, displayName: u.displayName, relationship: u.relationship, incomeSources: [] } as never);
    ws.mode = 'couple';
    await ws.save();
    partnerId = String(u._id);
  }
  return createInvitation({ workspaceId, userId: partnerId, email, invitedBy });
}

export async function resendInvitation(workspaceId: string, invitedBy: string, id: string) {
  const inv = await Invitation.findOne({ _id: id, workspaceId, acceptedAt: null, revokedAt: null }).lean();
  if (!inv) throw notFound('Invitation');
  return createInvitation({ workspaceId, userId: String(inv.userId), email: inv.email, invitedBy });
}
