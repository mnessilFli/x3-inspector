import type { GqlNode, GqlProp, GqlSchemaIndex } from '../graphql/schemaIndex';

/**
 * Finds the GraphQL nodes publishing the connector tables, whatever their names, from the X3 field
 * codes of their properties (GraphQL descriptions "Label (CODE)"). Columns verified on the PREPROD
 * table dictionary (exports of 2026-10-02):
 *   YINDEXAPI: CODFIC (table), CLE (X3 key "k1~k2~k3"), NUMIDD (remote / Salesforce id), NUMLOG (last log)
 *   YLAPI: YCOMPT (counter, index YLAPI0), YTYPFLUX, YACT, YNAMWS, YCLEF1..3, YDATE, YHEURE, YSTA, YMESS, YOBJ, YFLUX, YTEX
 */

export interface DetectedNode {
  node: GqlNode;
  /** X3 field code -> property path usable in X3QL (reference -> "prop._id"). */
  paths: Record<string, string>;
}

function pathOf(p: GqlProp): string {
  return p.kind === 'reference' ? `${p.name}._id` : p.name;
}

function detect(index: GqlSchemaIndex, required: string[], wanted: string[]): DetectedNode | null {
  for (const node of index.nodes) {
    const byCode = new Map<string, GqlProp>();
    for (const p of node.props) if (p.x3Field && !byCode.has(p.x3Field)) byCode.set(p.x3Field, p);
    if (!required.every((c) => byCode.has(c))) continue;
    const paths: Record<string, string> = {};
    for (const c of wanted) {
      const p = byCode.get(c);
      if (p) paths[c] = pathOf(p);
    }
    return { node, paths };
  }
  return null;
}

export function detectIndexNode(index: GqlSchemaIndex): DetectedNode | null {
  return detect(index, ['NUMIDD', 'CLE'], ['CODFIC', 'CLE', 'NUMIDD', 'NUMLOG', 'UPDDATMOD', 'UPDTIMMOD']);
}

export function detectLogNode(index: GqlSchemaIndex): DetectedNode | null {
  return detect(index, ['YCOMPT', 'YNAMWS'], ['YCOMPT', 'YTYPFLUX', 'YACT', 'YNAMWS', 'YFLUX', 'YOBJ', 'YCLEF1', 'YCLEF2', 'YCLEF3', 'YDATE', 'YHEURE', 'YSTA', 'YMESS']);
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** X3QL to find index lines by Salesforce id, or by X3 key (prefix) and optional table code. */
export function indexQuery(d: DetectedNode, search: { salesforceId?: string; x3Key?: string; table?: string }, limit = 50): string {
  const where: string[] = [];
  if (search.salesforceId?.trim() && d.paths.NUMIDD) where.push(`${d.paths.NUMIDD} = ${lit(search.salesforceId.trim())}`);
  if (search.x3Key?.trim() && d.paths.CLE) where.push(`${d.paths.CLE} LIKE ${lit(`${search.x3Key.trim()}%`)}`);
  if (search.table?.trim() && d.paths.CODFIC) where.push(`${d.paths.CODFIC} = ${lit(search.table.trim().toUpperCase())}`);
  return `SELECT * FROM ${d.node.node}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} LIMIT ${limit}`;
}

/** X3QL for the last Log API lines, newest first, with optional filters. */
export function logQuery(d: DetectedNode, f: { flow?: string; webService?: string; key1?: string; status?: string }, limit = 50): string {
  const where: string[] = [];
  if (f.flow?.trim() && d.paths.YFLUX) where.push(`${d.paths.YFLUX} = ${lit(f.flow.trim())}`);
  if (f.webService?.trim() && d.paths.YNAMWS) where.push(`${d.paths.YNAMWS} = ${lit(f.webService.trim())}`);
  if (f.key1?.trim() && d.paths.YCLEF1) where.push(`${d.paths.YCLEF1} LIKE ${lit(`${f.key1.trim()}%`)}`);
  if (f.status?.trim() && d.paths.YSTA) where.push(`${d.paths.YSTA} = ${lit(f.status.trim())}`);
  const order = [d.paths.YDATE, d.paths.YHEURE].filter((x): x is string => !!x && !x.includes('.')).map((x) => `${x} DESC`);
  return `SELECT * FROM ${d.node.node}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${order.length ? ` ORDER BY ${order.join(', ')}` : ''} LIMIT ${limit}`;
}

/** SQL for the same searches on-premise (physical columns FIELD_0, verified dictionary). */
export const CONNECTOR_SQL = {
  indexBySalesforceId: (id: string) => `SELECT * FROM YINDEXAPI WHERE NUMIDD_0 = ${lit(id)}`,
  indexByX3Key: (key: string) => `SELECT * FROM YINDEXAPI WHERE CLE_0 LIKE ${lit(`${key}%`)}`,
  lastLogs: (n = 100) => `SELECT TOP ${n} * FROM YLAPI ORDER BY YDATE_0 DESC, YHEURE_0 DESC`,
};
