import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as income from '../services/income.service.js';
import { syncMonthIncome } from '../services/workspace.service.js';

export async function list(req: Request, res: Response) {
  res.json(await income.listIncome(authUser(req).workspaceId, res.locals.query.month));
}
export async function create(req: Request, res: Response) {
  res.status(201).json(await income.createIncome(authUser(req).workspaceId, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await income.updateIncome(authUser(req).workspaceId, req.params.id, req.body));
}
export async function archive(req: Request, res: Response) {
  res.json(await income.setIncomeArchived(authUser(req).workspaceId, req.params.id, true));
}
export async function unarchive(req: Request, res: Response) {
  res.json(await income.setIncomeArchived(authUser(req).workspaceId, req.params.id, false));
}
/** Applies the current recurring income to an already generated month (never touches received rows). */
export async function sync(req: Request, res: Response) {
  const wid = authUser(req).workspaceId;
  await syncMonthIncome(wid, req.body.month);
  res.json(await income.listIncome(wid, req.body.month));
}
