import type { Request, Response } from 'express';
import * as svc from '../services/admin.service.js';

export async function login(req: Request, res: Response) {
  res.json(svc.adminLogin(req.body.username, req.body.password));
}
export async function users(_req: Request, res: Response) {
  res.json(await svc.listUsers());
}
export async function updateUser(req: Request, res: Response) {
  res.json(await svc.updateUser(req.params.id, req.body));
}
export async function passwordLink(req: Request, res: Response) {
  res.json(await svc.passwordLink(req.params.id));
}
