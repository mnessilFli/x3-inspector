/**
 * SOAP calls to X3 web services, exactly as the Salesforce connector (package sfco) builds them.
 * Source: skill connecteur-sfco-fli, reference/requetes-soap-envoi.md (read in the Apex code):
 * envelope SOAP 1.1, namespace wss = http://www.adonix.com/WSS, callContext { codeLang, poolAlias },
 * publicName, inputXml in CDATA; headers SOAPAction "", Authorization = Basic token as is,
 * Content-Type text/xml;charset=UTF-8. Response: runResponse / getDescriptionResponse with
 * status (1 = OK, 0 = KO), messages (multiRef CAdxMessage type 1 info, 2 warning, 3 error), resultXml.
 */

export type SoapMethod = 'getDescription' | 'run';

export interface SoapCall {
  method: SoapMethod;
  codeLang: string;
  poolAlias: string;
  publicName: string;
  /** run only: the <PARAM>...</PARAM> document. */
  inputXml?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildSoapEnvelope(c: SoapCall): string {
  const ctx = `<callContext xsi:type="wss:CAdxCallContext"><codeLang xsi:type="xsd:string">${esc(c.codeLang)}</codeLang><poolAlias xsi:type="xsd:string">${esc(c.poolAlias)}</poolAlias></callContext>`;
  const name = `<publicName xsi:type="xsd:string">${esc(c.publicName)}</publicName>`;
  const input =
    c.method === 'run'
      ? `<inputXml xsi:type="xsd:string"><![CDATA[${(c.inputXml ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]></inputXml>`
      : '';
  return [
    '<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"',
    ' xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wss="http://www.adonix.com/WSS"',
    ' xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/">',
    '<soapenv:Header/><soapenv:Body>',
    `<wss:${c.method} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">${ctx}${name}${input}</wss:${c.method}>`,
    '</soapenv:Body></soapenv:Envelope>',
  ].join('');
}

export function soapHeaders(authorization: string): Record<string, string> {
  return { SOAPAction: '""', Authorization: authorization, 'Content-Type': 'text/xml;charset=UTF-8' };
}

/** "user:password" -> "Basic base64" (what Basic_Token__c must contain on the Salesforce side). */
export function basicToken(user: string, password: string): string {
  return `Basic ${base64Utf8(`${user}:${password}`)}`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of the UTF-8 bytes of a string (no DOM / Node dependency). */
export function base64Utf8(s: string): string {
  const bytes: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0) as number;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return out;
}

export interface SoapMessage {
  type: number | null;
  message: string;
}

export interface SoapResult {
  fault: string | null;
  status: number | null;
  messages: SoapMessage[];
  resultXml: string | null;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

function inner(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tag}>)`).exec(xml);
  if (!m) return null;
  return m[1] ?? '';
}

/** Tolerant parser (namespace prefixes ignored); no DOM so it also runs in Node tests. */
export function parseSoapResponse(xml: string): SoapResult {
  const fault = inner(xml, 'faultstring');
  const statusText = inner(xml, 'status');
  const status = statusText !== null && /^\s*-?\d+\s*$/.test(statusText) ? Number(statusText) : null;
  const messages: SoapMessage[] = [];
  const re = /<(?:[A-Za-z0-9_]+:)?(?:multiRef|messages)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:multiRef|messages)>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[1] ?? '';
    const msg = inner(body, 'message');
    if (msg === null) continue;
    const t = inner(body, 'type');
    messages.push({ type: t !== null && /^\s*\d+\s*$/.test(t) ? Number(t) : null, message: decode(msg.trim()) });
  }
  let resultXml: string | null = null;
  const rx = /<(?:[A-Za-z0-9_]+:)?resultXml\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?resultXml>)/.exec(xml);
  if (rx && !/xsi:nil="true"/.test(rx[1] ?? '')) {
    const raw = rx[2] ?? '';
    const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(raw);
    resultXml = cdata ? (cdata[1] as string) : decode(raw);
  }
  return { fault: fault === null ? null : decode(fault.trim()), status, messages, resultXml };
}

/**
 * What the Salesforce connector concludes from this answer (skill connecteur-sfco-fli,
 * reponses-retour-logs.md §2.1): with at least one message, success = no message of type 3 or 4,
 * whatever the X3 status; without message, success = status 1. The SF user sees the LAST message.
 */
export function salesforceVerdict(r: SoapResult, httpStatus: number): { success: boolean; shownMessage: string; reason: string } {
  if (httpStatus < 200 || httpStatus >= 300) return { success: false, shownMessage: '', reason: `HTTP ${httpStatus}: Salesforce does not parse the answer` };
  const last = r.messages[r.messages.length - 1]?.message ?? '';
  if (r.messages.length) {
    const blocking = r.messages.some((m) => m.type === 3 || m.type === 4);
    return {
      success: !blocking,
      shownMessage: last,
      reason: blocking ? 'a message of type 3 (error) is present' : `only messages of type 1 / 2: shown as success even with status ${r.status ?? '?'}`,
    };
  }
  return { success: r.status === 1, shownMessage: '', reason: r.status === 1 ? 'status 1, no message' : 'status 0 without message: failure with an empty message' };
}

export interface WsGroup {
  name: string;
  dim: number | null;
  /** GRP = single block, TAB = table (dim > 1). */
  kind: 'GRP' | 'TAB';
  fields: Array<{ name: string; attrs: Record<string, string> }>;
}

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/g)) out[m[1] as string] = decode(m[2] as string);
  return out;
}

/**
 * Groups and fields of a getDescription resultXml. Attribute names are read as they come
 * (GRP NAM / DIM are used by the SF connector; field attributes are kept raw).
 */
export function parseWsDescription(resultXml: string): WsGroup[] {
  const groups: WsGroup[] = [];
  for (const g of resultXml.matchAll(/<(GRP|TAB)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a = attrsOf(g[2] ?? '');
    const dim = a.DIM !== undefined && /^\d+$/.test(a.DIM) ? Number(a.DIM) : null;
    const fields = [...(g[3] ?? '').matchAll(/<FLD\b([^>]*?)\/?>/g)].map((f) => {
      const fa = attrsOf(f[1] ?? '');
      return { name: fa.NAM ?? fa.NAME ?? '?', attrs: fa };
    });
    groups.push({ name: a.NAM ?? a.ID ?? a.NAME ?? '?', dim, kind: g[1] === 'TAB' || (dim !== null && dim > 1) ? 'TAB' : 'GRP', fields });
  }
  return groups;
}

/** Empty <PARAM> document shaped like the SF connector sends it, from a WS description. */
export function inputXmlTemplate(groups: WsGroup[]): string {
  const lines = ['<PARAM>'];
  for (const g of groups) {
    if (g.kind === 'TAB') {
      lines.push(`  <TAB DIM="${g.dim ?? 1}" ID="${g.name}" SIZE="1">`, '    <LIN NUM="1">');
      for (const f of g.fields) lines.push(`      <FLD NAME="${f.name}"></FLD>`);
      lines.push('    </LIN>', '  </TAB>');
    } else {
      lines.push(`  <GRP ID="${g.name}">`);
      for (const f of g.fields) lines.push(`    <FLD NAME="${f.name}"></FLD>`);
      lines.push('  </GRP>');
    }
  }
  lines.push('</PARAM>');
  return lines.join('\n');
}

/** Problems the SF connector also hits: unescaped & or <, unbalanced tags, missing PARAM root. */
export function checkInputXml(xml: string): string[] {
  const problems: string[] = [];
  const t = xml.trim();
  if (!t) return ['inputXml is empty'];
  if (!/^(<\?xml[^>]*\?>\s*)?<PARAM\b/.test(t)) problems.push('the document should start with <PARAM> (optionally after <?xml ...?>)');
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(t)) problems.push('unescaped "&": write &amp; (the SF connector does not escape values, X3 then rejects the XML)');
  const stack: string[] = [];
  for (const m of t.matchAll(/<(\/?)([A-Za-z_][A-Za-z0-9_:-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m as unknown as [string, string, string, string];
    if (name.startsWith('?') || self) continue;
    if (!close) stack.push(name);
    else if (stack.pop() !== name) {
      problems.push(`tag </${name}> does not close the last opened tag`);
      break;
    }
  }
  if (stack.length) problems.push(`unclosed tag(s): ${stack.join(', ')}`);
  return problems;
}
