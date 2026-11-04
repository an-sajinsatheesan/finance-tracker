import type { Request, Response } from 'express';
import * as svc from '../services/admin.service.js';

export async function login(req: Request, res: Response) {
  res.json(await svc.adminLogin(req.body.username, req.body.password));
}
export async function users(_req: Request, res: Response) {
  res.json(await svc.listUsers());
}
export async function userDetails(req: Request, res: Response) {
  res.json(await svc.userDetails(req.params.id));
}
export async function updateUser(req: Request, res: Response) {
  res.json(await svc.updateUser(req.params.id, req.body));
}
export async function setPassword(req: Request, res: Response) {
  res.json(await svc.setPassword(req.params.id, req.body.password));
}
export async function deleteUser(req: Request, res: Response) {
  res.json(await svc.deleteUser(req.params.id));
}
