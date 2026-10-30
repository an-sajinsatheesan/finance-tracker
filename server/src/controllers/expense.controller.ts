import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/expense.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listExpenses(authUser(req).workspaceId, res.locals.query.month, req.query.includeArchived === 'true'));
}
export async function create(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createExpense(u.workspaceId, u.id, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateExpense(authUser(req).workspaceId, req.params.id, req.body));
}
export async function archive(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.setExpenseArchived(u.workspaceId, u.id, req.params.id, true));
}
export async function unarchive(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.setExpenseArchived(u.workspaceId, u.id, req.params.id, false));
}
