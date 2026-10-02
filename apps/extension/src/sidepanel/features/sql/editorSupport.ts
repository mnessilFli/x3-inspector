import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { X3Field, X3Table } from '@x3i/shared';
import { getCompletionContext, resolveQualifier, scanTableRefs, wordAt, type SqlDialect } from '@x3i/x3-core';
import type { CompanionClient } from '../../../lib/companionClient';
import { getTableCached } from '../../../lib/metadataCache';

export interface EditorDeps {
  client: CompanionClient | null;
  dialect: SqlDialect;
}

const VALID_FOR = /^[\w$#]*$/;

function columnOptions(table: X3Table, prefix: string): Completion[] {
  const p = prefix.toUpperCase();
  const out: Completion[] = [];
  for (const f of table.fields) {
    for (const c of f.columns) {
      if (p && !c.name.toUpperCase().startsWith(p) && !f.label?.value.toUpperCase().includes(p)) continue;
      const opt: Completion = { label: c.name, type: f.isKey ? 'constant' : 'property', boost: f.isKey ? 2 : 0 };
      const detail = f.label?.value ?? f.x3Type?.value;
      if (detail) opt.detail = detail;
      opt.info = `${table.name}.${c.name}\n${f.x3Type ? `X3 type ${f.x3Type.value} · ` : ''}${f.sqlType}${f.length !== null ? `(${f.length})` : ''}`;
      out.push(opt);
    }
  }
  return out;
}

async function tablesSafe(client: CompanionClient, names: string[]): Promise<X3Table[]> {
  const res = await Promise.all(names.map((n) => getTableCached(client, n).catch(() => null)));
  return res.filter((t): t is X3Table => t !== null);
}

/** Completion fed by companion metadata: tables after FROM / JOIN, columns after "alias." or in scope. */
export function x3CompletionSource(getDeps: () => EditorDeps): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const { client, dialect } = getDeps();
    if (!client || !client.hasToken) return null;
    const text = ctx.state.doc.toString();
    const cc = getCompletionContext(text, ctx.pos, dialect);
    if (cc.kind === 'none') return null;

    if (cc.kind === 'table') {
      if (!cc.prefix && !ctx.explicit) return null;
      const tables = await client.searchTables(cc.prefix, 50).catch(() => []);
      if (ctx.aborted) return null;
      return {
        from: cc.from,
        validFor: VALID_FOR,
        options: tables.map((t, i) => {
          const o: Completion = { label: t.name, type: 'class', boost: 50 - i };
          const parts = [t.abbreviation?.value, t.description?.value].filter(Boolean);
          if (parts.length) o.detail = parts.join(' · ');
          return o;
        }),
      };
    }

    if (cc.kind === 'column') {
      const name = cc.qualifierTable ?? cc.qualifier;
      if (!name) return null;
      const [table] = await tablesSafe(client, [name]);
      if (!table || ctx.aborted) return null;
      return { from: cc.from, validFor: VALID_FOR, options: columnOptions(table, cc.prefix) };
    }

    // 'any': columns of the tables in scope (keywords come from the SQL language source)
    if (!cc.prefix && !ctx.explicit) return null;
    const tables = await tablesSafe(client, [...new Set(cc.tablesInScope.map((r) => r.table))]);
    if (ctx.aborted || tables.length === 0) return null;
    return { from: cc.from, validFor: VALID_FOR, options: tables.flatMap((t) => columnOptions(t, cc.prefix)) };
  };
}

function findField(table: X3Table, word: string): X3Field | undefined {
  const w = word.toUpperCase();
  return table.fields.find((f) => f.name.toUpperCase() === w || f.columns.some((c) => c.name.toUpperCase() === w));
}

function tooltipDom(lines: Array<[string, string | undefined]>, title: string): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'x3i-hover';
  const t = document.createElement('div');
  t.className = 't';
  t.textContent = title;
  dom.appendChild(t);
  for (const [k, v] of lines) {
    if (!v) continue;
    const d = document.createElement('div');
    d.textContent = `${k}: ${v}`;
    dom.appendChild(d);
  }
  return dom;
}

/** Hover on a column or table name: label, table, X3 type, SQL type from metadata. */
export function x3Hover(getDeps: () => EditorDeps) {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const { client, dialect } = getDeps();
    if (!client || !client.hasToken) return null;
    const text = view.state.doc.toString();
    const w = wordAt(text, pos, dialect);
    if (!w) return null;
    const refs = scanTableRefs(text, dialect).refs.filter((r) => !r.isCte);
    const ref = refs.find((r) => r.table.toUpperCase() === w.word.toUpperCase() && !w.qualifier);
    if (ref) {
      const [t] = await tablesSafe(client, [ref.table]);
      if (!t) return null;
      return {
        pos: w.from,
        end: w.to,
        create: () => ({
          dom: tooltipDom(
            [
              ['Description', t.description?.value],
              ['Abbreviation', t.abbreviation?.value],
              ['Key', t.primaryKey?.value.join(', ')],
              ['Fields', String(t.fields.length)],
            ],
            t.name,
          ),
        }),
      };
    }
    const candidates = w.qualifier ? [resolveQualifier(refs, w.qualifier)?.table ?? w.qualifier] : [...new Set(refs.map((r) => r.table))];
    const tables = await tablesSafe(client, candidates);
    for (const t of tables) {
      const f = findField(t, w.word);
      if (!f) continue;
      return {
        pos: w.from,
        end: w.to,
        create: () => ({
          dom: tooltipDom(
            [
              ['Label', f.label?.value],
              ['Table', t.name],
              ['X3 type', f.x3Type?.value],
              ['SQL type', `${f.sqlType}${f.length !== null ? `(${f.length})` : ''}`],
              ['Length', f.x3Length ? String(f.x3Length.value) : undefined],
              ['Local menu', f.localMenu ? String(f.localMenu.value) : undefined],
              ['Key', f.isKey ? 'yes' : undefined],
            ],
            f.name,
          ),
        }),
      };
    }
    return null;
  });
}
