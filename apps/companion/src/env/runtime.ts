import type { CompanionEnvironmentInfo, EnvironmentStatus } from '@x3i/shared';
import {
  CatalogMetadataProvider,
  DEFAULT_DICTIONARY_MAPPING,
  mergeMapping,
  type CatalogSource,
  type DictSource,
  type Logger,
  type X3ConnectionProvider,
} from '@x3i/x3-core';
import type { ResolvedConfig, ResolvedEnvironment } from '../config/types';
import { MssqlConnectionProvider } from '../db/mssqlConnection';
import { OracleConnectionProvider } from '../db/oracleConnection';
import { QueryService } from '../query/queryService';
import { loadX3Context } from '../sources/files/x3ContextSource';
import { SqlCatalogSource } from '../sources/sql/sqlCatalogSource';
import { SqlDictSource } from '../sources/sql/sqlDictSource';
import { explainDbError } from '../db/errors';

/** Everything the API needs for one environment: metadata provider, query service, connection. */
export class EnvironmentRuntime {
  readonly metadata: CatalogMetadataProvider;
  readonly query: QueryService | null;
  readonly connection: X3ConnectionProvider | null;

  constructor(
    readonly env: ResolvedEnvironment,
    private readonly config: ResolvedConfig,
    private readonly logger: Logger,
    connectionOverride?: X3ConnectionProvider | null,
  ) {
    this.connection = connectionOverride !== undefined ? connectionOverride : createConnection(env, config, logger);
    let catalog: CatalogSource;
    let dict: DictSource | undefined;
    if (env.metadataProvider === 'x3-context') {
      const loaded = loadX3Context(env.contextPath as string, logger);
      catalog = loaded.catalog;
      dict = loaded.dict;
    } else {
      if (!this.connection) throw new Error(`environment ${env.id}: database provider without connection`);
      catalog = new SqlCatalogSource(this.connection, this.connection.info.schema, logger);
      dict = new SqlDictSource(this.connection, catalog, this.connection.info.schema);
    }
    this.metadata = new CatalogMetadataProvider({
      name: `${env.metadataProvider}:${env.id}`,
      catalog,
      dict,
      mapping: mergeMapping(DEFAULT_DICTIONARY_MAPPING, env.dictionaryMapping),
      language: env.language,
      ...(env.technicalFields ? { technicalFields: env.technicalFields } : {}),
      logger,
    });
    this.query = this.connection
      ? new QueryService(this.connection, this.metadata, async () => (await this.metadata.catalog.tables()).map((t) => t.name), logger, config.security.logSql)
      : null;
  }

  info(): CompanionEnvironmentInfo {
    return {
      id: this.env.id,
      name: this.env.name,
      kind: this.env.kind,
      language: this.env.language,
      metadataProvider: this.env.metadataProvider,
      database: this.connection?.info ?? null,
      queryEnabled: this.query !== null,
    };
  }

  async refresh(): Promise<void> {
    await this.metadata.refresh();
    this.query?.resetCache();
  }

  async status(): Promise<EnvironmentStatus> {
    const base = {
      environment: this.info(),
      readOnly: true as const,
      maxRowsDefault: this.config.security.maxRowsDefault,
      maxRowsLimit: this.config.security.maxRowsLimit,
    };
    let connection: EnvironmentStatus['connection'] = 'not-configured';
    let message = 'No database configured: metadata from x3-context files, SQL execution disabled.';
    let writeAccessWarning: boolean | null = null;
    if (this.connection) {
      try {
        const probe = this.connection.type === 'oracle' ? 'SELECT 1 AS OK FROM DUAL' : 'SELECT 1 AS OK';
        await this.connection.runReadOnly(probe, {}, { maxRows: 1, timeoutMs: 15000 });
        connection = 'ok';
        message = `Connected to ${this.connection.info.host} (${this.connection.info.type}), schema ${this.connection.info.schema}.`;
        writeAccessWarning = await this.connection.checkWriteAccess();
      } catch (e) {
        connection = 'error';
        message = explainDbError(e);
      }
    }
    let tableCount: number | null = null;
    let dictionary: EnvironmentStatus['dictionary'] = null;
    if (connection !== 'error') {
      try {
        tableCount = (await this.metadata.catalog.tables()).length;
        dictionary = await this.metadata.getDictionaryStatus();
      } catch (e) {
        message += ` Metadata error: ${(e as Error).message}`;
      }
    }
    return { ...base, connection, message, writeAccessWarning, tableCount, dictionary };
  }

  async close(): Promise<void> {
    await this.connection?.close();
  }
}

function createConnection(env: ResolvedEnvironment, config: ResolvedConfig, logger: Logger): X3ConnectionProvider | null {
  if (!env.database) return null;
  const maxTimeout = Math.max(config.security.queryTimeoutMs, 120000);
  return env.database.type === 'oracle'
    ? new OracleConnectionProvider(env.database, logger)
    : new MssqlConnectionProvider(env.database, maxTimeout, logger);
}
