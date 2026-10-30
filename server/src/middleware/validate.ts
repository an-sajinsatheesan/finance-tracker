import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../utils/AppError.js';

export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(badRequest('Validation failed', r.error.flatten()));
  req.body = r.data;
  next();
};

export const validateQuery = (schema: ZodTypeAny): RequestHandler => (req, res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(badRequest('Invalid query', r.error.flatten()));
  res.locals.query = r.data;
  next();
};
