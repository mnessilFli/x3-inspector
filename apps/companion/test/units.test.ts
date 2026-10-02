import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, databaseFromX3ConnectProfile, parseEnvFile, resolveConfig } from '../src/config/loadConfig';
import { isValidAuthorization, loadOrCreateToken } from '../src/config/token';
import { toCell } from '../src/db/serialize';
import { isAllowedHost, isAllowedOrigin } from '../src/http/server';
import { redact } from '../src/logger';
import { parseCsv } from '../src/sources/files/csv';
import { containsPattern } from '../src/sources/sql/catalogQueries';
import { buildDictSelect } from '../src/sources/sql/sqlDictSource';

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

describe('config', () => {
  const base = {
    environments: [
      { id: 'pre', kind: 'PREPROD' as const, database: { type: 'mssql' as const, host: 'h', database: 'db', schema: 'SEED', user: 'ro', passwordEnv: 'PW' } },
    ],
  };

  it('resolves defaults and reads the password from the environment variable', () => {
    const c = resolveConfig(base, '/tmp', { PW: 'secret' });
    expect(c.server).toMatchObject({ host: '127.0.0.1', port: 8642 });
    expect(c.security).toMatchObject({ maxRowsDefault: 500, maxRowsLimit: 5000 });
    expect(c.environments[0]?.database).toMatchObject({ password: 'secret', isolation: 'read-uncommitted', schema: 'SEED' });
    expect(c.environments[0]?.language).toBe('FRA');
  });

  it('reports every problem at once', () => {
    try {
      resolveConfig({ server: { host: '0.0.0.0' }, environments: [{ id: 'x', database: { type: 'mssql', host: '', schema: 'BAD-SCHEMA', user: '', passwordEnv: 'NOPE' } }] }, '/tmp', {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).problems.join('\n');
      expect(msg).toContain('not a loopback address');
      expect(msg).toContain('database.host is required');
      expect(msg).toContain('database.schema');
      expect(msg).toContain('NOPE is empty');
    }
  });

  it('accepts an x3-context environment without database', () => {
    const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
    const c = resolveConfig({ environments: [{ id: 'off', metadata: { provider: 'x3-context', path: 'x3-context' } }] }, fixtures, {});
    expect(c.environments[0]?.contextPath).toBe(path.join(fixtures, 'x3-context'));
    expect(c.environments[0]?.database).toBeUndefined();
  });

  it('rejects an x3-context path without tables.csv at startup', () => {
    expect(() => resolveConfig({ environments: [{ id: 'off', metadata: { provider: 'x3-context', path: 'nope' } }] }, os.tmpdir(), {})).toThrow('no tables.csv');
  });

  it('reads an x3-connect profile', () => {
    const env = parseEnvFile('# comment\nX3_SQL_TYPE=oracle\nX3_SQL_HOST=ora\nX3_SQL_SERVICE="X3"\nX3_SQL_SCHEMA=SEED\nX3_SQL_USER=ro\nX3_SQL_PASSWORD=pw\n');
    const { db, password } = databaseFromX3ConnectProfile(env);
    expect(db).toMatchObject({ type: 'oracle', host: 'ora', service: 'X3', schema: 'SEED', user: 'ro' });
    expect(password).toBe('pw');
  });
});

describe('token and origin checks', () => {
  it('creates a token once and validates bearer headers', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'x3i-')), '.companion-token');
    const t1 = loadOrCreateToken(file);
    const t2 = loadOrCreateToken(file);
    expect(t1.created).toBe(true);
    expect(t2).toMatchObject({ created: false, value: t1.value });
    expect(isValidAuthorization(`Bearer ${t1.value}`, t1.value)).toBe(true);
    expect(isValidAuthorization(`Bearer ${t1.value}x`, t1.value)).toBe(false);
    expect(isValidAuthorization(undefined, t1.value)).toBe(false);
  });

  it('accepts only chrome-extension origins (optionally a given id)', () => {
    expect(isAllowedOrigin(EXT, [])).toBe(true);
    expect(isAllowedOrigin(EXT, ['abcdefghijklmnopabcdefghijklmnop'])).toBe(true);
    expect(isAllowedOrigin(EXT, ['pppppppppppppppppppppppppppppppp'])).toBe(false);
    expect(isAllowedOrigin('https://evil.example', [])).toBe(false);
    expect(isAllowedOrigin('null', [])).toBe(false);
  });

  it('rejects unexpected Host headers (DNS rebinding)', () => {
    expect(isAllowedHost('127.0.0.1:8642', '127.0.0.1', 8642)).toBe(true);
    expect(isAllowedHost('localhost:8642', '127.0.0.1', 8642)).toBe(true);
    expect(isAllowedHost('evil.example:8642', '127.0.0.1', 8642)).toBe(false);
    expect(isAllowedHost(undefined, '127.0.0.1', 8642)).toBe(false);
  });

  it('redacts secrets in logged data', () => {
    expect(redact({ user: 'ro', password: 'x', nested: { token: 'y' } })).toEqual({ user: 'ro', password: '***', nested: { token: '***' } });
  });
});

describe('dictionary SQL', () => {
  it('builds parameterized queries with delimited identifiers', () => {
    const q = buildDictSelect('mssql', 'SEED', 'ATABZON', ['CODZONE_0', 'INTITZON_0'], [
      { column: 'CODFIC_0', op: 'eq', value: 'BPCUSTOMER' },
      { column: 'CODZONE_0', op: 'like', value: '%BPC_NUM%' },
      { column: 'CODTYP_0', op: 'in', values: ['BPC', 'BPR'] },
    ]);
    expect(q.sql).toBe(
      "SELECT [CODZONE_0], [INTITZON_0] FROM [SEED].[ATABZON] WHERE [CODFIC_0] = @p0 AND UPPER([CODZONE_0]) LIKE UPPER(@p1) ESCAPE '\\' AND [CODTYP_0] IN (@p2, @p3)",
    );
    expect(q.params).toEqual({ p0: 'BPCUSTOMER', p1: '%BPC\\_NUM%', p2: 'BPC', p3: 'BPR' });
  });

  it('uses Oracle binds and upper-case schema', () => {
    const q = buildDictSelect('oracle', 'seed', 'APLSTD', ['LANMES_0'], [{ column: 'LANCHP_0', op: 'eq', value: 1 }]);
    expect(q.sql).toBe('SELECT "LANMES_0" FROM "SEED"."APLSTD" WHERE "LANCHP_0" = :p0');
  });

  it('refuses identifiers that are not plain names', () => {
    expect(() => buildDictSelect('mssql', 'SEED', 'ATABZON]; DROP TABLE X; --', ['A'], [])).toThrow('invalid SQL identifier');
  });

  it('escapes LIKE wildcards of user text', () => {
    expect(containsPattern('BPCNUM_0')).toBe('%BPCNUM\\_0%');
    expect(containsPattern('100%')).toBe('%100\\%%');
  });
});

describe('csv and serialization', () => {
  it('parses quotes, separators and CRLF', () => {
    expect(parseCsv('﻿A,B\r\n"x,y","say ""hi"""\r\n\r\n3,\n')).toEqual({ header: ['A', 'B'], rows: [['x,y', 'say "hi"'], ['3', '']] });
  });

  it('converts driver values to JSON-safe cells', () => {
    expect(toCell(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(toCell(Buffer.from('abc'))).toBe('<binary 3 bytes>');
    expect(toCell(10n)).toBe('10');
    expect(toCell(Number.NaN)).toBeNull();
    expect(toCell(undefined)).toBeNull();
  });
});
