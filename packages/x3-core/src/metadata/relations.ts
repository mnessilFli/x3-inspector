import type { X3Relation, X3Table } from '@x3i/shared';
import type { CatalogMetadataProvider } from './catalogProvider';
import { parseColumnName } from './conventions';
import { asCode } from './text';

const MAX_INCOMING = 300;
export const INFERRED_LABEL = 'Inferred - verification required';

/**
 * Relations of a table, never hardcoded:
 * 1. dictionary: field type -> linked table (METADATA), when the fields and types blocks are resolved;
 * 2. inference: a column equal to the single-column inferred key of another table (INFERRED).
 */
export async function computeRelations(table: X3Table, provider: CatalogMetadataProvider): Promise<X3Relation[]> {
  const out: X3Relation[] = [];
  const catalogKind = provider.catalog.source.kind;

  // 1a. outgoing, dictionary
  for (const f of table.fields) {
    if (!f.linkedTable || f.columns.length === 0) continue;
    const target = await provider.resolveTableName(f.linkedTable.value);
    if (!target) continue;
    const key = await provider.catalog.key(target);
    if (!key || key.columns.length !== 1) continue;
    out.push({
      fromTable: table.name,
      fromColumns: [(f.columns[0] as { name: string }).name],
      toTable: target,
      toColumns: key.columns,
      kind: 'dictionary-type-link',
      label: `X3 dictionary (type ${f.x3Type?.value ?? '?'} -> ${target})`,
      direction: 'outgoing',
      prov: { source: f.linkedTable.prov.source, confidence: 'METADATA', detail: f.linkedTable.prov.detail ?? 'field type' },
    });
  }

  // 1b. outgoing, inferred from keys of other tables
  for (const f of table.fields) {
    if (f.technical) continue;
    for (const c of f.columns) {
      for (const target of await provider.catalog.tablesKeyedBy(c.name)) {
        if (target.toUpperCase() === table.name.toUpperCase()) continue;
        out.push({
          fromTable: table.name,
          fromColumns: [c.name],
          toTable: target,
          toColumns: [c.name],
          kind: 'inferred-key-match',
          label: INFERRED_LABEL,
          direction: 'outgoing',
          prov: { source: 'inference', confidence: 'INFERRED', detail: `${c.name} is the inferred key of ${target}` },
        });
      }
    }
  }

  const key = table.primaryKey?.value;
  if (key && key.length === 1) {
    const keyCol = key[0] as string;

    // 2a. incoming, inferred: other tables having the key column
    const cols = await provider.catalog.source.findColumns(keyCol, 'exact', MAX_INCOMING);
    for (const c of cols) {
      if (c.table.toUpperCase() === table.name.toUpperCase()) continue;
      out.push({
        fromTable: c.table,
        fromColumns: [c.name],
        toTable: table.name,
        toColumns: [keyCol],
        kind: 'inferred-key-match',
        label: INFERRED_LABEL,
        direction: 'incoming',
        prov: { source: catalogKind, confidence: 'INFERRED', detail: `column ${c.name} matches the key of ${table.name}` },
      });
    }

    // 2b. incoming, dictionary: fields whose type points to this table
    out.push(...(await incomingFromDictionary(table, keyCol, provider)));
  }

  return dedupe(out);
}

async function incomingFromDictionary(table: X3Table, keyCol: string, provider: CatalogMetadataProvider): Promise<X3Relation[]> {
  if (!(await provider.dict.isUsable('fields')) || !(await provider.dict.isUsable('types'))) return [];
  const typeRows = await provider.dict.select('types', ['type', 'linkedTable'], [{ col: 'linkedTable', op: 'eq', value: table.name }]);
  const types = typeRows.map((r) => asCode(r.type)).filter((t): t is string => t !== undefined);
  if (types.length === 0) return [];
  const rows = await provider.dict.select('fields', ['table', 'field', 'x3Type'], [{ col: 'x3Type', op: 'in', values: types }], MAX_INCOMING);
  const out: X3Relation[] = [];
  for (const r of rows) {
    const t = asCode(r.table);
    const f = asCode(r.field);
    if (!t || !f) continue;
    const from = await provider.getTable(t);
    const field = from?.fields.find((x) => x.name.toUpperCase() === f.toUpperCase());
    const col = field?.columns[0]?.name;
    if (!from || !col || from.name.toUpperCase() === table.name.toUpperCase()) continue;
    out.push({
      fromTable: from.name,
      fromColumns: [col],
      toTable: table.name,
      toColumns: [keyCol],
      kind: 'dictionary-type-link',
      label: `X3 dictionary (type ${asCode(r.x3Type) ?? '?'} -> ${table.name})`,
      direction: 'incoming',
      prov: { source: 'x3-dictionary', confidence: 'METADATA', detail: `field ${t}.${parseColumnName(f).field} typed ${asCode(r.x3Type)}` },
    });
  }
  return out;
}

/** Keeps one relation per (direction, tables, columns), preferring dictionary over inference. */
function dedupe(rels: X3Relation[]): X3Relation[] {
  const best = new Map<string, X3Relation>();
  for (const r of rels) {
    const k = [r.direction, r.fromTable, r.fromColumns.join('+'), r.toTable, r.toColumns.join('+')].join('|').toUpperCase();
    const prev = best.get(k);
    if (!prev || (prev.kind === 'inferred-key-match' && r.kind === 'dictionary-type-link')) best.set(k, r);
  }
  return [...best.values()].sort(
    (a, b) =>
      (a.direction === b.direction ? 0 : a.direction === 'outgoing' ? -1 : 1) ||
      (a.kind === b.kind ? 0 : a.kind === 'dictionary-type-link' ? -1 : 1) ||
      (a.direction === 'outgoing' ? a.toTable.localeCompare(b.toTable) : a.fromTable.localeCompare(b.fromTable)),
  );
}
