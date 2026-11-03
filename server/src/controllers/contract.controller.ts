import type { Request, Response } from 'express';
import { authUser } from '../middleware/auth.js';
import * as svc from '../services/contract.service.js';

export async function list(req: Request, res: Response) {
  res.json(await svc.listContracts(authUser(req).workspaceId));
}
export async function create(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createContract(u.workspaceId, u.id, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await svc.updateContract(authUser(req).workspaceId, req.params.id, req.body));
}
export async function renew(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.renewContract(u.workspaceId, u.id, req.params.id, req.body));
}
export async function archive(req: Request, res: Response) {
  res.json(await svc.archiveContract(authUser(req).workspaceId, req.params.id));
}
export async function setCheque(req: Request, res: Response) {
  res.json(await svc.setCheque(authUser(req).workspaceId, req.params.id, req.params.chequeId, req.body));
}
export async function createDeposit(req: Request, res: Response) {
  const u = authUser(req);
  res.status(201).json(await svc.createDeposit(u.workspaceId, u.id, req.body));
}
export async function updateDeposit(req: Request, res: Response) {
  res.json(await svc.updateDeposit(authUser(req).workspaceId, req.params.id, req.body));
}
