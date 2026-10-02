import type { SqlValidation } from '@x3i/shared';

/**
 * GraphQL read-only guard: only query operations are allowed. "mutation" and "subscription"
 * are rejected anywhere outside strings and comments (a field named like that would need an alias).
 */
export function validateGraphqlReadOnly(query: string): SqlValidation {
  const errors: SqlValidation['errors'] = [];
  const stripped = stripGraphql(query);
  if (stripped === null) return { ok: false, errors: [{ message: 'Unterminated string in GraphQL query' }], warnings: [] };
  if (!stripped.trim()) errors.push({ message: 'Empty GraphQL query' });
  const m = /\b(mutation|subscription)\b/i.exec(stripped);
  if (m) errors.push({ message: `GraphQL ${m[1]!.toLowerCase()} is not allowed in read-only mode`, offset: m.index });
  return { ok: errors.length === 0, errors, warnings: [] };
}

/** Replaces comments and string contents with spaces (offsets preserved). null when a string is unterminated. */
function stripGraphql(q: string): string | null {
  let out = '';
  let i = 0;
  while (i < q.length) {
    const c = q[i] as string;
    if (c === '#') {
      while (i < q.length && q[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (q.startsWith('"""', i)) {
      const end = q.indexOf('"""', i + 3);
      if (end < 0) return null;
      out += ' '.repeat(end + 3 - i);
      i = end + 3;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < q.length && q[j] !== '"') {
        if (q[j] === '\\') j++;
        if (q[j] === '\n') return null;
        j++;
      }
      if (j >= q.length) return null;
      out += ' '.repeat(j + 1 - i);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
