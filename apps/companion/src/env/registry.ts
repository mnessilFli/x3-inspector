import type { AppLogger } from '../logger';
import type { ResolvedConfig } from '../config/types';
import { HttpError } from '../http/errors';
import { EnvironmentRuntime } from './runtime';

export type RuntimeFactory = (envId: string) => EnvironmentRuntime;

/** Creates environment runtimes lazily (first call) and keeps them for the process lifetime. */
export class EnvironmentRegistry {
  private readonly runtimes = new Map<string, EnvironmentRuntime>();
  private readonly factory: RuntimeFactory;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly logger: AppLogger,
    factory?: RuntimeFactory,
  ) {
    this.factory =
      factory ??
      ((id) => {
        const env = this.config.environments.find((e) => e.id === id);
        if (!env) throw new HttpError(404, 'unknown-environment', `unknown environment ${id}`);
        return new EnvironmentRuntime(env, this.config, this.logger.child(id));
      });
  }

  ids(): string[] {
    return this.config.environments.map((e) => e.id);
  }

  get(id: string | undefined): EnvironmentRuntime {
    if (!id) throw new HttpError(400, 'missing-environment', 'X-X3I-Env header is required');
    if (!this.ids().includes(id)) throw new HttpError(404, 'unknown-environment', `unknown environment ${id}`);
    let rt = this.runtimes.get(id);
    if (!rt) {
      rt = this.factory(id);
      this.runtimes.set(id, rt);
    }
    return rt;
  }

  /** Infos without opening connections for environments not used yet. */
  infos(): ReturnType<EnvironmentRuntime['info']>[] {
    return this.config.environments.map((e) => {
      const rt = this.runtimes.get(e.id);
      if (rt) return rt.info();
      return {
        id: e.id,
        name: e.name,
        kind: e.kind,
        language: e.language,
        metadataProvider: e.metadataProvider,
        database: e.database ? { type: e.database.type, host: e.database.host, database: e.database.database || e.database.service || '', schema: e.database.schema, user: e.database.user } : null,
        queryEnabled: e.database !== undefined,
      };
    });
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((r) => r.close()));
  }
}
