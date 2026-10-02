import { describe, expect, it } from 'vitest';
import { assertReadOnly, ReadOnlyViolation, validateReadOnly, type ValidationDialect } from '../src/sql/readOnly';

const ok = (sql: string, dialect: ValidationDialect = 'mssql') => validateReadOnly(sql, { dialect });

function expectAllowed(sql: string, dialect: ValidationDialect = 'mssql') {
  const v = ok(sql, dialect);
  expect(v.errors, sql).toEqual([]);
  expect(v.ok).toBe(true);
}

function expectRejected(sql: string, dialect: ValidationDialect = 'mssql', fragment?: string) {
  const v = ok(sql, dialect);
  expect(v.ok, sql).toBe(false);
  if (fragment) expect(v.errors.map((e) => e.message).join(' | ')).toContain(fragment);
}

describe('validateReadOnly: allowed queries', () => {
  it.each([
    'SELECT 1',
    'select * from BPCUSTOMER',
    "SELECT * FROM BPCUSTOMER WHERE BPCNUM_0 = 'SFRC000066';",
    'SELECT TOP 10 BPCNUM_0, BPCNAM_0 FROM BPCUSTOMER ORDER BY BPCNUM_0',
    'SELECT a.X_0 FROM A a JOIN B b ON a.K_0 = b.K_0 LEFT JOIN C c ON c.K_0 = a.K_0',
    'SELECT * FROM (SELECT BPCNUM_0 FROM BPCUSTOMER) t',
    'SELECT * FROM T WHERE K_0 IN (SELECT K_0 FROM U WHERE V_0 > 2)',
    'WITH c AS (SELECT BPCNUM_0 FROM BPCUSTOMER) SELECT * FROM c',
    'WITH a AS (SELECT 1 AS x), b (y) AS (SELECT 2) SELECT * FROM a, b',
    '(SELECT 1) UNION (SELECT 2)',
    'SELECT COUNT(*) FROM T GROUP BY X_0 HAVING COUNT(*) > 1',
    'SELECT REPLACE(BPCNAM_0, \'a\', \'b\') FROM BPCUSTOMER',
    'SELECT * FROM T WITH (NOLOCK)',
    'SELECT UPDTICK_0, CREDATTIM_0, UPDDATTIM_0 FROM T',
  ])('%s', (sql) => expectAllowed(sql));

  it('ignores forbidden words inside strings', () => {
    expectAllowed("SELECT * FROM T WHERE X_0 = 'DELETE FROM T; DROP TABLE T'");
  });

  it('ignores forbidden words inside comments', () => {
    expectAllowed('-- DELETE FROM T\nSELECT 1 /* UPDATE T SET X = 1 */');
  });

  it('ignores forbidden words inside delimited identifiers', () => {
    expectAllowed('SELECT [DELETE], "UPDATE" FROM T');
  });

  it('handles doubled quotes in strings', () => {
    expectAllowed("SELECT 'it''s; DELETE' FROM T");
  });

  it('accepts N strings', () => {
    expectAllowed("SELECT * FROM T WHERE X_0 = N'Électricité; DROP'");
  });

  it('accepts Oracle q-quoted strings under the oracle dialect', () => {
    expectAllowed("SELECT q'[it's; DELETE]' FROM DUAL", 'oracle');
  });

  it('accepts Oracle FETCH FIRST', () => {
    expectAllowed('SELECT * FROM T FETCH FIRST 10 ROWS ONLY', 'oracle');
  });

  it('accepts several trailing semicolons and whitespace', () => {
    expectAllowed('SELECT 1 ;  ; \n');
  });
});

describe('validateReadOnly: rejected queries', () => {
  it.each([
    ['INSERT INTO T VALUES (1)', 'Only SELECT'],
    ['UPDATE T SET X_0 = 1', 'Only SELECT'],
    ['DELETE FROM T', 'Only SELECT'],
    ['DROP TABLE T', 'Only SELECT'],
    ['ALTER TABLE T ADD X INT', 'Only SELECT'],
    ['TRUNCATE TABLE T', 'Only SELECT'],
    ['MERGE INTO T USING U ON (1=1) WHEN MATCHED THEN DELETE', 'Only SELECT'],
    ['CREATE TABLE X (A INT)', 'Only SELECT'],
    ['EXEC sp_who', 'Only SELECT'],
    ['EXECUTE xp_cmdshell \'dir\'', 'Only SELECT'],
    ['xp_cmdshell \'dir\'', 'Only SELECT'],
    ['DECLARE @x INT', 'Only SELECT'],
    ['BEGIN TRAN', 'Only SELECT'],
  ])('%s', (sql, fragment) => expectRejected(sql, 'mssql', fragment));

  it('rejects a second statement after a semicolon', () => {
    expectRejected('SELECT 1; DELETE FROM T', 'mssql', 'Only one statement');
  });

  it('rejects a second statement without semicolon (T-SQL batch)', () => {
    expectRejected('SELECT 1 DELETE FROM T', 'mssql', 'DELETE');
  });

  it('rejects SELECT INTO (creates a table)', () => {
    expectRejected('SELECT * INTO NEWT FROM T', 'mssql', 'INTO');
  });

  it('rejects WITH followed by DML', () => {
    expectRejected('WITH c AS (SELECT 1 AS x) DELETE FROM T', 'mssql');
    expectRejected('WITH c AS (SELECT 1 AS x) UPDATE T SET X_0 = 1', 'mssql');
  });

  it('rejects Oracle WITH FUNCTION', () => {
    expectRejected('WITH FUNCTION f RETURN NUMBER IS BEGIN RETURN 1; END; SELECT f FROM DUAL', 'oracle');
  });

  it('rejects FOR UPDATE', () => {
    expectRejected('SELECT * FROM T FOR UPDATE', 'oracle', 'FOR UPDATE');
  });

  it('rejects locking hints', () => {
    expectRejected('SELECT * FROM T WITH (UPDLOCK)', 'mssql', 'UPDLOCK');
    expectRejected('SELECT * FROM T WITH (TABLOCKX, HOLDLOCK)', 'mssql', 'TABLOCKX');
  });

  it('rejects sequences', () => {
    expectRejected('SELECT SEQ1.NEXTVAL FROM DUAL', 'oracle', 'NEXTVAL');
    expectRejected('SELECT NEXT VALUE FOR SEQ1', 'mssql', 'NEXT VALUE FOR');
  });

  it('rejects system packages and procedures', () => {
    expectRejected("SELECT UTL_HTTP.REQUEST('http://x') FROM DUAL", 'oracle', 'UTL_HTTP');
    expectRejected('SELECT DBMS_RANDOM.VALUE FROM DUAL', 'oracle', 'DBMS_RANDOM');
    expectRejected("SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'SELECT 1')", 'mssql', 'OPENROWSET');
  });

  it('rejects WAITFOR, SET, USE, GRANT', () => {
    expectRejected("SELECT 1 WAITFOR DELAY '00:00:10'", 'mssql', 'WAITFOR');
    expectRejected('SELECT 1 SET ROWCOUNT 0', 'mssql', 'SET');
    expectRejected('SELECT 1 USE master', 'mssql', 'USE');
    expectRejected('SELECT 1 GRANT SELECT ON T TO PUBLIC', 'mssql', 'GRANT');
  });

  it('does not exempt keywords written after a dot', () => {
    expectRejected('SELECT a. DELETE FROM T', 'mssql', 'DELETE');
  });

  it('rejects unterminated strings and comments', () => {
    expectRejected("SELECT 'abc", 'mssql', 'Unterminated string');
    expectRejected('SELECT 1 /* open', 'mssql', 'Unterminated block comment');
    expectRejected('SELECT [abc', 'mssql', 'Unterminated');
  });

  it('rejects unbalanced parentheses', () => {
    expectRejected('SELECT (1', 'mssql', 'Unbalanced');
    expectRejected('SELECT 1)', 'mssql', 'Unbalanced');
  });

  it('rejects empty queries', () => {
    expectRejected('   ', 'mssql', 'Empty');
    expectRejected('-- only a comment', 'mssql', 'Empty');
    expectRejected(';', 'mssql', 'Empty');
  });
});

describe('validateReadOnly: dialect-specific lexing cannot hide a statement', () => {
  // Under SQL Server, q'[ ... ]' is NOT a string: q is an identifier and '[x' is a string,
  // so "; DELETE" would really be executed. The mssql lexer must see it.
  const qQuoteTrick = "SELECT q'[x' ; DELETE FROM T --]'";

  it('mssql sees the hidden DELETE behind an Oracle q-quote', () => {
    expectRejected(qQuoteTrick, 'mssql');
  });

  it("'any' validates under both dialects", () => {
    expectRejected(qQuoteTrick, 'any');
  });

  // SQL Server nests block comments; Oracle does not. Under Oracle the comment ends at the first */.
  const nested = 'SELECT 1 /* outer /* inner */ DELETE FROM T */';

  it('mssql lexer treats the nested comment as one comment', () => {
    expectAllowed(nested, 'mssql');
  });

  it('oracle lexer closes the comment at the first */ and sees DELETE', () => {
    expectRejected(nested, 'oracle', 'DELETE');
  });

  it("'any' rejects what one dialect would execute", () => {
    expectRejected(nested, 'any', 'DELETE');
  });
});

describe('assertReadOnly', () => {
  it('throws a ReadOnlyViolation with the validation', () => {
    expect(() => assertReadOnly('DELETE FROM T', { dialect: 'mssql' })).toThrow(ReadOnlyViolation);
  });

  it('does not throw for a SELECT', () => {
    expect(() => assertReadOnly('SELECT 1', { dialect: 'mssql' })).not.toThrow();
  });
});
