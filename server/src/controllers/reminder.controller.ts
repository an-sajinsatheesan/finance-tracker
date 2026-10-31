import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/reminder.service.js';

export async function list(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.listReminders(u.workspaceId, u.id));
}

/** Scheduled job (Vercel Cron). Requires `Authorization: Bearer <CRON_SECRET>`. */
export async function cron(req: Request, res: Response) {
  if (!env.cronSecret || req.headers.authorization !== `Bearer ${env.cronSecret}`) throw new AppError(401, 'Unauthorized');
  res.json(await svc.sendReminderEmails());
}
