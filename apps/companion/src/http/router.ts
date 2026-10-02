import type { IncomingMessage } from 'node:http';

export interface RequestContext {
  req: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

export type Handler = (ctx: RequestContext) => Promise<unknown>;

interface Route {
  method: 'GET' | 'POST';
  segments: string[];
  handler: Handler;
  /** false only for /health. */
  auth: boolean;
}

/** Minimal router: "/metadata/tables/:table/fields" style patterns, exact segment count. */
export class Router {
  private readonly routes: Route[] = [];

  get(path: string, handler: Handler, auth = true): this {
    this.routes.push({ method: 'GET', segments: split(path), handler, auth });
    return this;
  }

  post(path: string, handler: Handler, auth = true): this {
    this.routes.push({ method: 'POST', segments: split(path), handler, auth });
    return this;
  }

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | { allowed: string[] } | null {
    const parts = split(pathname);
    const allowed: string[] = [];
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      const ok = route.segments.every((seg, i) => {
        const part = parts[i] as string;
        if (seg.startsWith(':')) {
          try {
            params[seg.slice(1)] = decodeURIComponent(part);
          } catch {
            return false;
          }
          return true;
        }
        return seg === part;
      });
      if (!ok) continue;
      if (route.method === method) return { route, params };
      allowed.push(route.method);
    }
    return allowed.length ? { allowed } : null;
  }
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}
