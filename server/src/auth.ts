import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { dataDir } from './db.js';

function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, 'jwt-secret.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}

const SECRET = loadSecret();

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);
export const signToken = (userId: number) => jwt.sign({ sub: userId }, SECRET, { expiresIn: '30d' });

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, SECRET) as unknown as { sub: number };
    res.locals.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Требуется вход' });
  }
}
