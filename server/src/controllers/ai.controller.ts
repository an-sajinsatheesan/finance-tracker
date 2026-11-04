import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/ai.service.js';

export async function chat(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.chat(u.workspaceId, u.id, req.body.messages));
}
