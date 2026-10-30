import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/goal.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listGoals(authUser(req).workspaceId));
}
export async function create(req: Request, res: Response) {
  res.status(201).json(await svc.createGoal(authUser(req).workspaceId, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateGoal(authUser(req).workspaceId, req.params.id, req.body));
}
export async function listAllocations(req: Request, res: Response) {
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  res.json(await svc.listAllocations(authUser(req).workspaceId, month));
}
export async function allocate(req: Request, res: Response) {
  res.status(201).json(await svc.createAllocation(authUser(req).workspaceId, req.params.id, req.body));
}
export async function archiveAllocation(req: Request, res: Response) {
  res.json(await svc.setAllocationArchived(authUser(req).workspaceId, req.params.id, true));
}
