import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface PairingToken {
  value: string;
  file: string;
  created: boolean;
}

/** Loads the pairing token, creating a random one (32 bytes) on first start. */
export function loadOrCreateToken(file: string): PairingToken {
  if (fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (value.length >= 32) return { value, file, created: false };
  }
  const value = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  return { value, file, created: true };
}

/** Constant-time comparison of the Authorization header with the token. */
export function isValidAuthorization(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7).trim());
  const expected = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
