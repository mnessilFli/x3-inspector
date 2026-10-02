/**
 * Parsers for the Syracuse classic page protocol, as observed on X3 Cloud V12
 * (snouestboissons.em.cloud-by-sage.fr, function GESBPC, HAR capture of 2026-10-02):
 *
 * - GET /sdata/syracuse/collaboration/syracuse/pages('x3.erp.<DATASET>.<WINDOW>.$fusion,trans,')
 *   -> $prototype.$properties: one entry per field, keyed by an internal id (xid, e.g. "AA4"):
 *      { "$X3Name": "BPC0_BPCNUM", "$keyword": "BPCNUM", "$type": "application/x-string",
 *        "$title": "{@F_BPC0_BPCNUM}", "$maxLength": 15, "$mnu": "1", "$X3Fmt": "K:15c" }
 *   -> $prototype.$localization: { "@F_BPC0_BPCNUM": "Client", ... }
 * - POST /trans/x3/erp/<DATASET>/$sessions?f=<FUNCTION>/...
 *   -> sap.func.open.<WIN>.name = window code (B -> OBPC), sap.wins.<WIN>.entities.<xid>.v = values
 * - PUT .../requestSvc?act=1172 (Esc + F6 "field properties") body { fld: { ist: { win, xid } } }
 *   -> sap.target = { type: "box", box: { tit: "Champ BPCNUM / Ecran BPC0 [BPC0]", li: ["BPCNUM : Client\nType de donnees : BPN ..."] } }
 * - PUT /trans/x3/erp/<DATASET>/$sessions('<id>')/requestSvc?act=1044
 *   body { fld: { ist: { win, xid } } = field left, param: { target: { win, xid } } = field entered }
 *
 * None of this is a documented Sage API: parsers return null instead of guessing when the shape differs.
 */

export interface SyracuseFieldDef {
  xid: string;
  /** "<SCREEN>_<FIELD>" as sent by Syracuse, e.g. BPC0_BPCNUM, BPRBPC_BPRNAM_1. */
  x3Name: string;
  screen: string | null;
  field: string | null;
  keyword: string | null;
  type: string | null;
  label: string | null;
  localMenu: number | null;
  maxLength: number | null;
  format: string | null;
  readOnly: boolean;
}

export interface SyracuseWindowDictionary {
  dataset: string;
  window: string;
  /** X3 object code of the window ($prototype.$object, e.g. BPC). */
  object: string | null;
  /** Record key as X3 names ($prototype.$key "{BPC0_BPCNUM}" -> ["BPC0_BPCNUM"]). */
  keyX3Names: string[];
  fields: Record<string, SyracuseFieldDef>;
}

export interface SyracuseFieldRef {
  win: string;
  xid: string;
}

const PAGES_URL = /\/sdata\/syracuse\/collaboration\/syracuse\/pages\('x3\.erp\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\.\$fusion([^']*)'/;
const SESSIONS_URL = /\/trans\/x3\/erp\/([A-Za-z0-9_]+)\/\$sessions/;

/** facet: what follows $fusion in the page id, e.g. ",trans," (several descriptions may exist per window). */
export function parsePagesUrl(url: string): { dataset: string; window: string; facet: string } | null {
  const m = PAGES_URL.exec(safeDecode(url));
  return m ? { dataset: m[1] as string, window: m[2] as string, facet: m[3] ?? '' } : null;
}

export function parseSessionsUrl(url: string): { dataset: string } | null {
  const m = SESSIONS_URL.exec(safeDecode(url));
  return m ? { dataset: m[1] as string } : null;
}

/** BPC0_BPCNUM -> screen BPC0, field BPCNUM. Screen codes contain no underscore; the field keeps the rest. */
export function parseX3Name(x3Name: string): { screen: string | null; field: string | null } {
  const i = x3Name.indexOf('_');
  if (i <= 0 || i === x3Name.length - 1) return { screen: null, field: null };
  return { screen: x3Name.slice(0, i), field: x3Name.slice(i + 1) };
}

export function parsePrototype(json: unknown, dataset: string, window: string): SyracuseWindowDictionary | null {
  const proto = obj(obj(json)?.$prototype);
  const props = obj(proto?.$properties);
  if (!props) return null;
  const loc = obj(proto?.$localization) ?? {};
  const fields: Record<string, SyracuseFieldDef> = {};
  for (const [xid, raw] of Object.entries(props)) {
    const p = obj(raw);
    const x3Name = str(p?.$X3Name);
    if (!p || !x3Name) continue;
    const { screen, field } = parseX3Name(x3Name);
    const title = str(p.$title);
    const labelKey = title && /^\{@.+\}$/.test(title) ? title.slice(1, -1) : null;
    const mnu = Number(p.$mnu);
    const max = Number(p.$maxLength);
    fields[xid] = {
      xid,
      x3Name,
      screen,
      field,
      keyword: str(p.$keyword),
      type: str(p.$type),
      label: labelKey ? (str(loc[labelKey]) ?? null) : title || null,
      localMenu: Number.isInteger(mnu) && mnu > 0 ? mnu : null,
      maxLength: Number.isFinite(max) && max > 0 ? max : null,
      format: str(p.$X3Fmt),
      readOnly: p.$isReadOnly === true,
    };
  }
  const key = str(proto?.$key) ?? '';
  const keyX3Names = [...key.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
  return { dataset, window, object: str(proto?.$object), keyX3Names, fields };
}

export interface SessionResponseInfo {
  /** Window letter -> window code, e.g. { B: "OBPC" }. */
  windows: Record<string, string>;
  functionCode: string | null;
  focus: SyracuseFieldRef | null;
  /** Message box shown by X3 (e.g. Esc + F6 field properties). */
  box: { title: string; lines: string[] } | null;
}

export function parseSessionResponse(json: unknown): SessionResponseInfo | null {
  const sap = obj(obj(json)?.sap);
  if (!sap) return null;
  const windows: Record<string, string> = {};
  let functionCode: string | null = null;
  for (const [letter, w] of Object.entries(obj(obj(sap.func)?.open) ?? {})) {
    const name = str(obj(w)?.name);
    if (name) windows[letter] = name;
    functionCode ??= str(obj(w)?.func);
  }
  const ist = obj(obj(sap.target)?.ist);
  const focus = ist && str(ist.win) && str(ist.xid) ? { win: str(ist.win) as string, xid: str(ist.xid) as string } : null;
  const boxObj = obj(obj(sap.target)?.box);
  const li = Array.isArray(boxObj?.li) ? (boxObj?.li as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const box = boxObj && str(boxObj.tit) ? { title: str(boxObj.tit) as string, lines: li.flatMap((l) => l.split('\n')).map((l) => l.trim()).filter(Boolean) } : null;
  return { windows, functionCode, focus, box };
}

export interface SessionRequestInfo {
  /** Action code (1044 = field change, 1172 = Esc + F6 field properties). */
  act: number | null;
  left: SyracuseFieldRef | null;
  entered: SyracuseFieldRef | null;
}

export function parseSessionRequest(body: unknown): SessionRequestInfo | null {
  const b = obj(typeof body === 'string' ? tryJson(body) : body);
  if (!b) return null;
  const ref = (o: Record<string, unknown> | null): SyracuseFieldRef | null => {
    const win = str(o?.win);
    const xid = str(o?.xid);
    return win && xid ? { win, xid } : null;
  };
  const act = Number(b.act);
  return { act: Number.isInteger(act) ? act : null, left: ref(obj(obj(b.fld)?.ist)), entered: ref(obj(obj(b.param)?.target)) };
}

export const ACT_FIELD_CHANGE = 1044;
export const ACT_FIELD_PROPERTIES = 1172;

export interface FieldPropertiesBox {
  /** Field and screen read from the title "Champ BPCNUM / Ecran BPC0 [BPC0]" (language independent: first two codes). */
  field: string | null;
  screen: string | null;
  title: string;
  entries: Array<{ key: string; value: string }>;
}

/** Parses the Esc + F6 box. Lines "Key : value" become entries; other lines are kept with an empty key. */
export function parseFieldPropertiesBox(box: { title: string; lines: string[] }): FieldPropertiesBox {
  const codes = box.title.match(/\b[A-Z][A-Z0-9_]{1,19}\b/g) ?? [];
  const entries = box.lines.map((l) => {
    const i = l.indexOf(' : ');
    return i > 0 ? { key: l.slice(0, i).trim(), value: l.slice(i + 3).trim() } : { key: '', value: l };
  });
  return { field: codes[0] ?? null, screen: codes[1] ?? null, title: box.title, entries };
}

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
