/** Console logger with a debug switch (Settings > Debug). Never pass tokens or row data to it. */
let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(scope: string): Logger {
  const prefix = `[X3 Inspector:${scope}]`;
  const out = (fn: (...a: unknown[]) => void, msg: string, data?: unknown) => (data === undefined ? fn(prefix, msg) : fn(prefix, msg, data));
  return {
    debug: (m, d) => {
      if (debugEnabled) out(console.debug, m, d);
    },
    info: (m, d) => out(console.info, m, d),
    warn: (m, d) => out(console.warn, m, d),
    error: (m, d) => out(console.error, m, d),
  };
}
