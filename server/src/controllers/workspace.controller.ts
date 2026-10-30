import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as ws from '../services/workspace.service.js';

export async function get(req: Request, res: Response) {
  const u = authUser(req);
  res.json(ws.serializeWorkspace(await ws.getWorkspace(u.workspaceId)));
}
export async function update(req: Request, res: Response) {
  res.json(await ws.updateWorkspace(authUser(req).workspaceId, req.body));
}
export async function completeSetup(req: Request, res: Response) {
  res.json(await ws.completeSetup(authUser(req).workspaceId, req.body.startMonth));
}
