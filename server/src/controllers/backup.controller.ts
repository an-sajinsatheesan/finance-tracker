import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/backup.service.js';

const filename = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

export async function exportJson(req: Request, res: Response) {
  const data = await svc.exportWorkspace(authUser(req).workspaceId);
  res.setHeader('Content-Disposition', `attachment; filename="${filename('finance-backup')}"`);
  res.json(data);
}
export async function validate(req: Request, res: Response) {
  const { valid, errors, summary } = await svc.validateBackup(req.body, authUser(req).workspaceId);
  res.json({ valid, errors, summary });
}
export async function restore(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.restoreWorkspace(u.workspaceId, req.body, u.id));
}
export async function snapshot(req: Request, res: Response) {
  const u = authUser(req);
  const s = await svc.createSnapshot(u.workspaceId, 'manual', u.id);
  res.status(201).json({ id: s.id, createdAt: s.createdAt });
}
export async function listSnapshots(req: Request, res: Response) {
  res.json(await svc.listSnapshots(authUser(req).workspaceId));
}
export async function downloadSnapshot(req: Request, res: Response) {
  const data = await svc.getSnapshot(authUser(req).workspaceId, req.params.id);
  res.setHeader('Content-Disposition', `attachment; filename="${filename('finance-snapshot')}"`);
  res.json(data);
}
