import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

export const sign = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '60d' });

export function verify(token: string): string | null {
  try {
    return (jwt.verify(token, config.jwtSecret) as { sub: string }).sub;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? '';
  const id = h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
  if (!id) return res.status(401).json({ error: 'unauthorized' });
  res.locals.userId = id;
  next();
}
