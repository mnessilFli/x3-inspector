import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { ApiErrorBody } from '@x3i/shared';
import { ReadOnlyViolation, type Logger } from '@x3i/x3-core';
import { isValidAuthorization } from '../config/token';
import { DatabaseError } from '../db/errors';
import type { ResolvedConfig } from '../config/types';
import { HttpError } from './errors';
import type { Router } from './router';

const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-X3I-Env';

export interface ServerDeps {
  config: ResolvedConfig;
  router: Router;
  token: string;
  logger: Logger;
}

/**
 * Security checks, in order: Host header (DNS rebinding), Origin (only chrome-extension:// or none),
 * CORS preflight, bearer token (except /health), JSON body size.
 */
export function createRequestListener(deps: ServerDeps) {
  const { config, router, token, logger } = deps;

  return async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const origin = req.headers.origin;
    try {
      if (!config.server.allowRemote && !isAllowedHost(req.headers.host, config.server.host, config.server.port)) {
        throw new HttpError(403, 'forbidden-origin', 'unexpected Host header');
      }
      if (origin !== undefined && !isAllowedOrigin(origin, config.security.allowedExtensionIds)) {
        throw new HttpError(403, 'forbidden-origin', `origin not allowed: ${origin}`);
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': ALLOWED_HEADERS,
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const match = router.match(req.method ?? 'GET', url.pathname);
      if (!match) throw new HttpError(404, 'not-found', `no route ${req.method} ${url.pathname}`);
      if ('allowed' in match) throw new HttpError(405, 'bad-request', `method not allowed, use ${match.allowed.join(', ')}`);

      const authenticated = isValidAuthorization(req.headers.authorization, token);
      if (match.route.auth && !authenticated) throw new HttpError(401, 'unauthorized', 'missing or invalid pairing token');

      const body = req.method === 'POST' ? await readJson(req) : undefined;
      const result = await match.route.handler({ req, url, params: match.params, body });
      send(res, 200, result);
      logger.debug(`${req.method} ${url.pathname} 200 ${Date.now() - started}ms`);
    } catch (e) {
      const { status, body } = toErrorResponse(e, logger);
      send(res, status, body);
      logger.info(`${req.method} ${req.url} ${status} ${Date.now() - started}ms`, { code: body.error.code });
    }
  };
}

/** DNS rebinding defense: the Host header must name the loopback address and port we listen on. */
export function isAllowedHost(host: string | undefined, listenHost: string, port: number): boolean {
  const h = String(host ?? '').toLowerCase();
  return [listenHost, '127.0.0.1', 'localhost', '[::1]'].some((x) => h === `${x}:${port}`.toLowerCase());
}

export function isAllowedOrigin(origin: string, allowedIds: string[]): boolean {
  const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  if (!m) return false;
  return allowedIds.length === 0 || allowedIds.includes(m[1] as string);
}

function toErrorResponse(e: unknown, logger: Logger): { status: number; body: ApiErrorBody } {
  if (e instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: e.code, message: e.message } };
    if (e.details !== undefined) body.error.details = e.details;
    return { status: e.status, body };
  }
  if (e instanceof ReadOnlyViolation) {
    return { status: 400, body: { error: { code: 'sql-rejected', message: e.message, details: e.validation } } };
  }
  if (e instanceof DatabaseError) {
    return { status: 502, body: { error: { code: 'database-error', message: e.message } } };
  }
  const err = e as { message?: string };
  logger.error('unhandled error', { error: err?.message, stack: (e as Error)?.stack });
  return { status: 500, body: { error: { code: 'internal', message: err?.message ?? 'internal error' } } };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'bad-request', 'request body too large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad-request', 'invalid JSON body');
  }
}

export function createServer(deps: ServerDeps): http.Server | https.Server {
  const listener = createRequestListener(deps);
  const tls = deps.config.server.tls;
  if (tls) return https.createServer({ cert: fs.readFileSync(tls.certFile), key: fs.readFileSync(tls.keyFile) }, listener);
  return http.createServer(listener);
}
