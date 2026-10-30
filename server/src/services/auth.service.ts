import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/workspace.repository.js';

export const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

export function signToken(userId: string, workspaceId: string): string {
  return jwt.sign({ wid: workspaceId }, env.jwtSecret, {
    subject: userId,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export async function login(username: string, password: string) {
  const user = await userRepository.findByUsernameWithPassword(username);
  // Compare against a dummy hash when the user does not exist, to keep timing similar.
  const hash = user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Z6Z6eYvF1E5j6hLkC0G9rZsY3b6y2W';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok || user.status !== 'active') throw new AppError(401, 'Invalid username or password');
  await userRepository.touchLogin(user._id);
  return {
    token: signToken(String(user._id), String(user.workspaceId)),
    user: {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName,
      relationship: user.relationship,
      workspaceId: String(user.workspaceId),
    },
  };
}
