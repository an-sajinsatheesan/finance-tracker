import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as ws from '../services/workspace.service.js';
import * as invites from '../services/invite.service.js';

export async function get(req: Request, res: Response) {
  res.json(await ws.getWorkspaceView(authUser(req).workspaceId));
}
export async function update(req: Request, res: Response) {
  res.json(await ws.updateWorkspace(authUser(req).workspaceId, req.body));
}
export async function completeSetup(req: Request, res: Response) {
  res.json(await ws.completeSetup(authUser(req).workspaceId, req.body.startMonth));
}
export async function listInvitations(req: Request, res: Response) {
  res.json(await invites.listInvitations(authUser(req).workspaceId));
}
export async function invitePartner(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await invites.invitePartner(u.workspaceId, u.id, req.body));
}
export async function resendInvitation(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await invites.resendInvitation(u.workspaceId, u.id, req.params.id));
}
export async function reinviteMember(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await invites.reinviteMember(u.workspaceId, u.id, req.params.userId, req.body.email));
}
