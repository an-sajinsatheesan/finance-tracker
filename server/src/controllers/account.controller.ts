import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/account.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listAccounts(authUser(req).workspaceId, req.query.includeArchived === 'true'));
}
export async function create(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createAccount(u.workspaceId, u.id, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateAccount(authUser(req).workspaceId, req.params.id, req.body));
}
export async function history(req: Request, res: Response) {
  res.json(await svc.balanceHistory(authUser(req).workspaceId, req.params.id));
}
export async function saveBalances(req: Request, res: Response) {
  const u = authUser(req);
  res.json(await svc.saveBalances(u.workspaceId, u.id, req.body.month, req.body.items));
}
export async function listTransfers(req: Request, res: Response) {
  res.json(await svc.listTransfers(authUser(req).workspaceId, res.locals.query.month));
}
export async function createTransfer(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createTransfer(u.workspaceId, u.id, req.body));
}
export async function archiveTransfer(req: Request, res: Response) {
  res.json(await svc.archiveTransfer(authUser(req).workspaceId, req.params.id));
}
export async function wealth(req: Request, res: Response) {
  const { month, scope } = res.locals.query;
  res.json(await svc.getWealth(authUser(req).workspaceId, month, scope));
}
export async function balances(req: Request, res: Response) {
  res.json(await svc.getBalances(authUser(req).workspaceId, res.locals.query.month));
}
