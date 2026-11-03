import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/gold.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listGold(authUser(req).workspaceId));
}
export async function create(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createGoldItem(u.workspaceId, u.id, req.body));
}
export async function update(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.updateGoldItem(u.workspaceId, u.id, req.params.id, req.body));
}
export async function setPrice(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.setGoldPrice(u.workspaceId, u.id, req.body));
}
