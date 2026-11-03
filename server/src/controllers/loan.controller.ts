import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/loan.service.js';

export async function get(req: Request, res: Response) {
  res.json(await svc.getLoan(authUser(req).workspaceId, req.params.accountId));
}
export async function add(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.addEntries(u.workspaceId, u.id, req.params.accountId, req.body.entries));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateEntry(authUser(req).workspaceId, req.params.accountId, req.params.id, req.body));
}
export async function remove(req: Request, res: Response) {
  res.json(await svc.removeEntry(authUser(req).workspaceId, req.params.accountId, req.params.id));
}
