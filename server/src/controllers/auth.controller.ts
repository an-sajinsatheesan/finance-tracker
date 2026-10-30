import type { Request, Response } from 'express';
import * as auth from '../services/auth.service.js';
import { authUser } from '../middleware/auth.js';
import { getWorkspace, serializeWorkspace } from '../services/workspace.service.js';

export async function login(req: Request, res: Response) {
  res.json(await auth.login(req.body.username, req.body.password));
}

export async function me(req: Request, res: Response) {
  const u = authUser(req);
  const ws = await getWorkspace(u.workspaceId);
  res.json({ user: u, workspace: serializeWorkspace(ws) });
}
