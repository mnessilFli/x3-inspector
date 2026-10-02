import { describe, expect, it } from 'vitest';
import { getCompletionContext, wordAt } from '../src/sql/completion';
import { buildRelationQuery, buildSelectWhere, buildTopRows, buildWhere, sqlValue } from '../src/sql/generate';
import { qualifyTables } from '../src/sql/qualify';
import { scanTableRefs } from '../src/sql/tableRefs';
import { stripTrailingSemicolons } from '../src/sql/statements';
import { significant, tokenize } from '../src/sql/tokenizer';

const KNOWN = new Map(['BPCUSTOMER', 'BPARTNER', 'BPADDRESS', 'SORDER'].map((t) => [t, t]));
const resolveTable = (n: string) => KNOWN.get(n.toUpperCase());

describe('tokenize', () => {
  it('splits words, strings, comments and punctuation', () => {
    const t = significant(tokenize("SELECT a.B_0, 'x''y' FROM T -- c\n", 'mssql').tokens);
    expect(t.map((x) => x.type)).toEqual(['word', 'word', 'punct', 'word', 'punct', 'string', 'word', 'word']);
    expect(t[5]?.text).toBe("'x''y'");
  });

  it('keeps <= and <> as one operator but never swallows a comment start', () => {
    const t = significant(tokenize('a<=b<>c--x', 'mssql').tokens).map((x) => x.text);
    expect(t).toEqual(['a', '<=', 'b', '<>', 'c']);
  });

  it('reads parameters', () => {
    const t = significant(tokenize('WHERE A = @p0 AND B = :p1', 'mssql').tokens).filter((x) => x.type === 'param');
    expect(t.map((x) => x.text)).toEqual(['@p0', ':p1']);
  });
});

describe('scanTableRefs', () => {
  it('finds tables, schemas and aliases', () => {
    const refs = scanTableRefs('SELECT * FROM SEED.BPCUSTOMER BPC JOIN BPADDRESS AS BPA ON 1=1, SORDER', 'mssql').refs;
    expect(refs.map((r) => [r.schema ?? '', r.table, r.alias ?? ''])).toEqual([
      ['SEED', 'BPCUSTOMER', 'BPC'],
      ['', 'BPADDRESS', 'BPA'],
      ['', 'SORDER', ''],
    ]);
  });

  it('ignores FROM inside EXTRACT and table-valued functions', () => {
    const refs = scanTableRefs('SELECT EXTRACT(YEAR FROM BPCUSTOMER) FROM fn(1) x, BPARTNER', 'oracle').refs;
    expect(refs.map((r) => r.table)).toEqual(['BPARTNER']);
  });

  it('marks CTE names', () => {
    const scan = scanTableRefs('WITH BPCUSTOMER AS (SELECT 1 AS X FROM BPARTNER) SELECT * FROM BPCUSTOMER', 'mssql');
    expect(scan.refs.map((r) => [r.table, r.isCte])).toEqual([
      ['BPARTNER', false],
      ['BPCUSTOMER', true],
    ]);
  });
});

describe('qualifyTables', () => {
  it('prefixes known tables only', () => {
    const r = qualifyTables('SELECT * FROM bpcustomer c JOIN UNKNOWNT u ON 1=1', { dialect: 'mssql', schema: 'SEED', resolveTable });
    expect(r.sql).toBe('SELECT * FROM SEED.BPCUSTOMER c JOIN UNKNOWNT u ON 1=1');
    expect(r.qualified).toEqual(['BPCUSTOMER']);
  });

  it('leaves qualified references, CTEs, strings and columns alone', () => {
    const sql = "WITH SORDER AS (SELECT 1 AS X) SELECT BPCUSTOMER, 'FROM BPARTNER' FROM SORDER, OTHER.BPARTNER";
    expect(qualifyTables(sql, { dialect: 'mssql', schema: 'SEED', resolveTable }).sql).toBe(sql);
  });

  it('handles subqueries and comma lists', () => {
    const r = qualifyTables('SELECT * FROM (SELECT * FROM BPARTNER) x, BPADDRESS WHERE K IN (SELECT K FROM SORDER)', {
      dialect: 'oracle',
      schema: 'seed',
      resolveTable,
    });
    expect(r.sql).toBe('SELECT * FROM (SELECT * FROM SEED.BPARTNER) x, SEED.BPADDRESS WHERE K IN (SELECT K FROM SEED.SORDER)');
  });

  it('quotes an unusual schema name', () => {
    const r = qualifyTables('SELECT * FROM BPARTNER', { dialect: 'mssql', schema: 'MY-FOLDER', resolveTable });
    expect(r.sql).toBe('SELECT * FROM [MY-FOLDER].BPARTNER');
  });
});

describe('getCompletionContext', () => {
  const ctx = (sqlWithCursor: string) => {
    const cursor = sqlWithCursor.indexOf('|');
    return getCompletionContext(sqlWithCursor.replace('|', ''), cursor, 'mssql');
  };

  it('suggests tables after FROM', () => {
    expect(ctx('SELECT * FROM BP|')).toMatchObject({ kind: 'table', prefix: 'BP' });
    expect(ctx('SELECT * FROM |')).toMatchObject({ kind: 'table', prefix: '' });
    expect(ctx('SELECT * FROM A, B|')).toMatchObject({ kind: 'table', prefix: 'B' });
    expect(ctx('SELECT * FROM A JOIN |')).toMatchObject({ kind: 'table' });
  });

  it('suggests tables of a schema', () => {
    expect(ctx('SELECT * FROM SEED.BP|')).toMatchObject({ kind: 'table', prefix: 'BP', schema: 'SEED' });
  });

  it('suggests columns of an alias defined later in the statement', () => {
    expect(ctx('SELECT BPC.BPC| FROM BPCUSTOMER BPC')).toMatchObject({ kind: 'column', prefix: 'BPC', qualifier: 'BPC', qualifierTable: 'BPCUSTOMER' });
  });

  it('suggests columns of tables in scope elsewhere', () => {
    const c = ctx('SELECT * FROM BPCUSTOMER WHERE BPC|');
    expect(c.kind).toBe('any');
    expect(c.tablesInScope.map((t) => t.table)).toEqual(['BPCUSTOMER']);
  });

  it('does not suggest inside strings or comments', () => {
    expect(ctx("SELECT 'BP|").kind).toBe('none');
    expect(ctx('SELECT 1 -- BP|').kind).toBe('none');
  });
});

describe('wordAt', () => {
  it('returns the identifier and its qualifier', () => {
    expect(wordAt('SELECT BPC.BPCNUM_0 FROM BPCUSTOMER BPC', 13, 'mssql')).toMatchObject({ word: 'BPCNUM_0', qualifier: 'BPC' });
  });
});

describe('SQL generation', () => {
  it('quotes values and escapes quotes', () => {
    expect(sqlValue("O'Neil", false)).toBe("'O''Neil'");
    expect(sqlValue('42', true)).toBe('42');
    expect(sqlValue('42', false)).toBe("'42'");
    expect(sqlValue('4 2', true)).toBe("'4 2'");
    expect(sqlValue(null, false)).toBe('NULL');
  });

  it('builds WHERE and SELECT', () => {
    expect(buildWhere([{ column: 'BPCNUM_0', value: 'SFRC000066', numeric: false }], 'mssql')).toBe("WHERE BPCNUM_0 = 'SFRC000066'");
    expect(buildSelectWhere('BPCUSTOMER', [{ column: 'BPCNUM_0', value: 'SFRC000066', numeric: false }], 'mssql')).toBe(
      "SELECT *\nFROM BPCUSTOMER\nWHERE BPCNUM_0 = 'SFRC000066'",
    );
    expect(buildWhere([{ column: 'X_0', value: null, numeric: false }], 'mssql')).toBe('WHERE X_0 IS NULL');
  });

  it('limits rows per dialect', () => {
    expect(buildTopRows('T', 100, 'mssql')).toBe('SELECT TOP 100 *\nFROM T');
    expect(buildTopRows('T', 100, 'oracle')).toBe('SELECT *\nFROM T\nFETCH FIRST 100 ROWS ONLY');
  });

  it('builds a query on the other side of a relation', () => {
    const rel = {
      fromTable: 'SORDER',
      fromColumns: ['BPCORD_0'],
      toTable: 'BPCUSTOMER',
      toColumns: ['BPCNUM_0'],
      kind: 'inferred-key-match' as const,
      label: 'x',
      direction: 'incoming' as const,
      prov: { source: 'inference' as const, confidence: 'INFERRED' as const },
    };
    expect(buildRelationQuery(rel, { BPCNUM_0: 'C1' }, 'mssql')).toBe("SELECT *\nFROM SORDER\nWHERE BPCORD_0 = 'C1'");
    expect(buildRelationQuery({ ...rel, direction: 'outgoing' }, { bpcord_0: 'C1' }, 'mssql')).toBe("SELECT *\nFROM BPCUSTOMER\nWHERE BPCNUM_0 = 'C1'");
    expect(buildRelationQuery(rel, {}, 'mssql')).toBeNull();
  });
});

describe('stripTrailingSemicolons', () => {
  it('removes trailing semicolons and what follows them', () => {
    expect(stripTrailingSemicolons('SELECT 1 ; ; -- end', 'oracle')).toBe('SELECT 1');
    expect(stripTrailingSemicolons("SELECT ';' FROM DUAL", 'oracle')).toBe("SELECT ';' FROM DUAL");
    expect(stripTrailingSemicolons('SELECT 1 -- no semicolon', 'oracle')).toBe('SELECT 1 -- no semicolon');
  });
});
