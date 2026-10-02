import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_COMPANION_PORT, ENVIRONMENT_KINDS, type DatabaseType, type EnvironmentKind } from '@x3i/shared';
import type { CompanionConfigFile, DatabaseConfigFile, EnvironmentConfigFile, ResolvedConfig, ResolvedDatabase, ResolvedEnvironment } from './types';

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid companion configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
const SCHEMA = /^[A-Za-z0-9_]{1,30}$/;

/** KEY=value lines, # comments, optional quotes. Same format as x3-connect profiles. */
export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[line.slice(0, eq).trim()] = value;
  }
  return env;
}

/** Converts an x3-connect profile (X3_SQL_* keys) into a database configuration with its password. */
export function databaseFromX3ConnectProfile(env: Record<string, string>): { db: DatabaseConfigFile; password: string | undefined } {
  const type = (env.X3_SQL_TYPE || 'mssql').toLowerCase() as DatabaseType;
  const db: DatabaseConfigFile = {
    type,
    host: env.X3_SQL_HOST ?? '',
    schema: env.X3_SQL_SCHEMA ?? '',
    user: env.X3_SQL_USER ?? '',
    encrypt: env.X3_SQL_ENCRYPT === 'true',
    trustServerCertificate: env.X3_SQL_TRUST_CERT !== 'false',
  };
  if (env.X3_SQL_PORT) db.port = Number(env.X3_SQL_PORT);
  if (env.X3_SQL_INSTANCE) db.instance = env.X3_SQL_INSTANCE;
  if (env.X3_SQL_DATABASE) db.database = env.X3_SQL_DATABASE;
  if (env.X3_SQL_SERVICE) db.service = env.X3_SQL_SERVICE;
  return { db, password: env.X3_SQL_PASSWORD || undefined };
}

export function resolveConfig(file: CompanionConfigFile, baseDir: string, processEnv: NodeJS.ProcessEnv): ResolvedConfig {
  const problems: string[] = [];
  const host = file.server?.host ?? '127.0.0.1';
  const allowRemote = file.server?.allowRemote === true;
  if (!LOOPBACK.has(host) && !allowRemote) problems.push(`server.host "${host}" is not a loopback address; set server.allowRemote: true to accept it (not recommended)`);
  const port = file.server?.port ?? DEFAULT_COMPANION_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`server.port must be an integer between 1 and 65535`);

  const maxRowsLimit = file.security?.maxRowsLimit ?? 5000;
  const maxRowsDefault = Math.min(file.security?.maxRowsDefault ?? 500, maxRowsLimit);
  const queryTimeoutMs = file.security?.queryTimeoutMs ?? 30000;
  if (maxRowsLimit < 1 || maxRowsLimit > 100000) problems.push('security.maxRowsLimit must be between 1 and 100000');

  if (!Array.isArray(file.environments) || file.environments.length === 0) problems.push('environments must contain at least one environment');
  const ids = new Set<string>();
  const environments: ResolvedEnvironment[] = [];
  for (const [i, e] of (file.environments ?? []).entries()) {
    const r = resolveEnvironment(e, i, baseDir, processEnv, problems);
    if (!r) continue;
    if (ids.has(r.id)) problems.push(`environments[${i}]: duplicate id "${r.id}"`);
    ids.add(r.id);
    environments.push(r);
  }

  if (problems.length) throw new ConfigError(problems);
  return {
    server: { host, port, allowRemote, tls: file.server?.tls ? { certFile: path.resolve(baseDir, file.server.tls.certFile), keyFile: path.resolve(baseDir, file.server.tls.keyFile) } : undefined },
    security: {
      allowedExtensionIds: file.security?.allowedExtensionIds ?? [],
      maxRowsDefault,
      maxRowsLimit,
      queryTimeoutMs,
      logSql: file.security?.logSql ?? true,
    },
    logging: { level: file.logging?.level ?? 'info', file: file.logging?.file ? path.resolve(baseDir, file.logging.file) : undefined },
    environments,
  };
}

function resolveEnvironment(e: EnvironmentConfigFile, i: number, baseDir: string, processEnv: NodeJS.ProcessEnv, problems: string[]): ResolvedEnvironment | undefined {
  const where = `environments[${i}]${e?.id ? ` (${e.id})` : ''}`;
  if (!e || typeof e.id !== 'string' || !ID.test(e.id)) {
    problems.push(`${where}: id is required (letters, digits, _ . -)`);
    return undefined;
  }
  const kind: EnvironmentKind = e.kind ?? 'DEV';
  if (!ENVIRONMENT_KINDS.includes(kind)) problems.push(`${where}: kind must be one of ${ENVIRONMENT_KINDS.join(', ')}`);
  const provider = e.metadata?.provider ?? 'database';
  let contextPath: string | undefined;
  if (provider === 'x3-context') {
    if (!e.metadata?.path) problems.push(`${where}: metadata.path is required for the x3-context provider`);
    else {
      contextPath = path.resolve(baseDir, e.metadata.path);
      const tablesCsv = [path.join(contextPath, 'sql', 'tables.csv'), path.join(contextPath, 'tables.csv')];
      if (!tablesCsv.some((f) => fs.existsSync(f))) problems.push(`${where}: no tables.csv found in ${contextPath} (expected an x3-context/<profile> folder from x3-connect)`);
    }
  }

  let dbFile = e.database;
  let password: string | undefined;
  if (e.x3ConnectProfile) {
    const profilePath = path.resolve(baseDir, e.x3ConnectProfile);
    if (!fs.existsSync(profilePath)) {
      problems.push(`${where}: x3ConnectProfile not found: ${profilePath}`);
    } else {
      const fromProfile = databaseFromX3ConnectProfile(parseEnvFile(fs.readFileSync(profilePath, 'utf8')));
      dbFile = { ...fromProfile.db, ...(e.database ?? {}) };
      password = fromProfile.password;
    }
  }

  let database: ResolvedDatabase | undefined;
  if (dbFile) {
    if (dbFile.passwordEnv) password = processEnv[dbFile.passwordEnv];
    database = resolveDatabase(dbFile, password, where, problems);
  } else if (provider === 'database') {
    problems.push(`${where}: a database (or x3ConnectProfile) is required for the database provider`);
  }

  return {
    id: e.id,
    name: e.name ?? e.id,
    kind,
    language: (e.language ?? 'FRA').toUpperCase(),
    metadataProvider: provider,
    contextPath,
    database,
    dictionaryMapping: e.dictionaryMapping,
    technicalFields: e.technicalFields,
  };
}

function resolveDatabase(d: DatabaseConfigFile, password: string | undefined, where: string, problems: string[]): ResolvedDatabase | undefined {
  const before = problems.length;
  if (d.type !== 'mssql' && d.type !== 'oracle') problems.push(`${where}: database.type must be mssql or oracle`);
  if (!d.host) problems.push(`${where}: database.host is required`);
  if (!d.schema || !SCHEMA.test(d.schema)) problems.push(`${where}: database.schema (X3 folder code) is required, letters/digits/_ only`);
  if (!d.user) problems.push(`${where}: database.user is required`);
  if (d.type === 'mssql' && !d.database) problems.push(`${where}: database.database is required for SQL Server`);
  if (d.type === 'oracle' && !d.service) problems.push(`${where}: database.service is required for Oracle`);
  if (!password) {
    problems.push(
      d.passwordEnv
        ? `${where}: environment variable ${d.passwordEnv} is empty (set it in apps/companion/.env)`
        : `${where}: no password source: set database.passwordEnv or x3ConnectProfile`,
    );
  }
  if (problems.length > before) return undefined;
  return {
    type: d.type,
    host: d.host,
    port: d.port,
    instance: d.instance,
    database: d.database ?? '',
    service: d.service,
    schema: d.schema,
    user: d.user,
    password: password as string,
    encrypt: d.encrypt ?? false,
    trustServerCertificate: d.trustServerCertificate ?? true,
    isolation: d.isolation ?? 'read-uncommitted',
  };
}

export function loadConfigFile(configPath: string, processEnv: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  if (!fs.existsSync(configPath)) {
    throw new ConfigError([`configuration file not found: ${configPath} (copy config/companion.config.example.json)`]);
  }
  let parsed: CompanionConfigFile;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CompanionConfigFile;
  } catch (e) {
    throw new ConfigError([`cannot parse ${configPath}: ${(e as Error).message}`]);
  }
  return resolveConfig(parsed, path.dirname(configPath), processEnv);
}
