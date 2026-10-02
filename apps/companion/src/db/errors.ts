/** Error raised by a connection provider; mapped to HTTP 502 "database-error". */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly driverCode?: string,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/** Human readable database errors (network, login), without secrets. */
export function explainDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  const msg = err?.message ?? String(e);
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ESOCKET', 'ETIMEOUT', 'EAI_AGAIN'].includes(code) || /NJS-50\d|NJS-51\d|ORA-12170|ORA-12541/.test(msg)) {
    return `Database unreachable (${code || msg.slice(0, 60)}). Is the VPN up? Are host, port or instance correct? ${msg}`;
  }
  if (code === 'ELOGIN' || /ORA-01017/.test(msg)) return `Login refused: check database.user and the password source. ${msg}`;
  if (code === 'ECANCEL' || /NJS-123|DPI-1067|ORA-01013/.test(msg)) return `Query cancelled: timeout reached. ${msg}`;
  return msg;
}

export function toDatabaseError(e: unknown): DatabaseError {
  if (e instanceof DatabaseError) return e;
  const code = (e as { code?: string })?.code;
  return new DatabaseError(explainDbError(e), typeof code === 'string' ? code : undefined);
}
