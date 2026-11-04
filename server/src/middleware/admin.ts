import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { issuedBeforePasswordChange } from '../utils/token.js';
import { Admin } from '../models/index.js';

/** Admin panel requests: a token from the admin sign-in (separate from user sessions). */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const p = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (p.adm !== true) throw new Error('not admin');
    const admin = await Admin.findById(p.sub).lean();
    if (!admin || issuedBeforePasswordChange(p, admin.passwordChangedAt)) throw new Error('not admin');
    next();
  } catch {
    next(new AppError(401, 'Admin sign-in required'));
  }
};
