import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/commitment.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listCommitments(authUser(req).workspaceId));
}
export async function create(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createCommitment(u.workspaceId, u.id, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateCommitment(authUser(req).workspaceId, req.params.id, req.body));
}
export async function end(req: Request, res: Response) {
  res.json(await svc.endCommitment(authUser(req).workspaceId, req.params.id, req.body.endMonth));
}
export async function reactivate(req: Request, res: Response) {
  res.json(await svc.reactivateCommitment(authUser(req).workspaceId, req.params.id));
}
export async function archive(req: Request, res: Response) {
  res.json(await svc.archiveCommitment(authUser(req).workspaceId, req.params.id));
}
export async function pay(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.payCommitment(u.workspaceId, u.id, req.params.id, req.body));
}
