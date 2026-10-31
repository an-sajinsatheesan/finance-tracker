import type { Request, Response } from 'express';
import * as auth from '../services/auth.service.js';
import * as invites from '../services/invite.service.js';
import { authUser } from '../middleware/auth.js';
import { getWorkspaceView } from '../services/workspace.service.js';
import { userRepository } from '../repositories/workspace.repository.js';

export async function login(req: Request, res: Response) {
  res.json(await auth.login(req.body.email, req.body.password));
}

export async function register(req: Request, res: Response) {
  res.status(201).json(await auth.register(req.body));
}

export async function me(req: Request, res: Response) {
  const u = authUser(req);
  const [user, workspace] = await Promise.all([userRepository.findById(u.id), getWorkspaceView(u.workspaceId)]);
  res.json({ user: auth.publicUser(user!), workspace });
}

export async function describeInvite(req: Request, res: Response) {
  res.json(await invites.describeInvite(req.params.token));
}

export async function acceptInvite(req: Request, res: Response) {
  res.json(await invites.acceptInvite(req.params.token, req.body));
}
