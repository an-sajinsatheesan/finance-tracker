import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/lookup.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listLookups(authUser(req).workspaceId));
}
export async function create(req: Request, res: Response) {
  res.status(201).json(await svc.createLookup(authUser(req).workspaceId, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateLookup(authUser(req).workspaceId, req.params.id, req.body));
}
