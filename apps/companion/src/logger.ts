import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '@x3i/x3-core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = /pass(word)?|secret|token|authorization/i;

/** Removes values of secret-looking keys before logging structured data. */
export function redact(data: unknown, depth = 0): unknown {
  if (depth > 4 || data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((d) => redact(d, depth + 1));
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '***' : redact(v, depth + 1)]));
}

export interface LoggerOptions {
  level: LogLevel;
  file?: string;
  scope?: string;
}

export type AppLogger = Logger & { child(scope: string): AppLogger };

export function createLogger(options: LoggerOptions): AppLogger {
  let stream: fs.WriteStream | undefined;
  if (options.file) {
    fs.mkdirSync(path.dirname(options.file), { recursive: true });
    stream = fs.createWriteStream(options.file, { flags: 'a' });
  }
  const make = (scope: string | undefined): AppLogger => {
    const write = (level: LogLevel, msg: string, data?: unknown) => {
      if (ORDER[level] < ORDER[options.level]) return;
      const time = new Date().toISOString();
      const extra = data === undefined ? '' : ` ${JSON.stringify(redact(data))}`;
      const line = `${time} ${level.toUpperCase().padEnd(5)} ${scope ? `[${scope}] ` : ''}${msg}${extra}`;
      (level === 'error' || level === 'warn' ? console.error : console.log)(line);
      stream?.write(`${line}\n`);
    };
    return {
      debug: (m, d) => write('debug', m, d),
      info: (m, d) => write('info', m, d),
      warn: (m, d) => write('warn', m, d),
      error: (m, d) => write('error', m, d),
      child: (s: string) => make(scope ? `${scope}:${s}` : s),
    };
  };
  return make(options.scope);
}
