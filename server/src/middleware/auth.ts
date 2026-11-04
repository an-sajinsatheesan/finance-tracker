import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { issuedBeforePasswordChange } from '../utils/token.js';
import { userRepository } from '../repositories/workspace.repository.js';

export interface AuthUser {
  id: string;
  workspaceId: string;
  username: string;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifies the JWT and loads the user. Every downstream query is scoped to req.user.workspaceId. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Authentication required');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new AppError(401, 'Session expired, please sign in again');
    }
    const user = await userRepository.findById(String(payload.sub));
    if (!user || user.status !== 'active') throw new AppError(401, 'Account not available');
    if (String(user.workspaceId) !== String(payload.wid)) throw new AppError(401, 'Workspace mismatch');
    if (issuedBeforePasswordChange(payload, user.passwordChangedAt)) throw new AppError(401, 'Session expired, please sign in again');
    req.user = {
      id: String(user._id),
      workspaceId: String(user.workspaceId),
      username: user.username,
      displayName: user.displayName,
    };
    next();
  } catch (err) {
    next(err);
  }
};

export const authUser = (req: Express.Request): AuthUser => {
  if (!req.user) throw new AppError(401, 'Authentication required');
  return req.user;
};
