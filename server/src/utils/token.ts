import type { JwtPayload } from 'jsonwebtoken';

/** True when a token was issued before the password last changed, so it must stop working. */
export const issuedBeforePasswordChange = (payload: JwtPayload, changedAt?: Date | null) =>
  !!changedAt && (payload.iat ?? 0) < Math.floor(changedAt.getTime() / 1000);
