import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import { getSummary } from '../services/summary.service.js';

export async function summary(req: Request, res: Response) {
  const { month, scope } = res.locals.query;
  res.json(await getSummary(authUser(req).workspaceId, month, scope));
}
