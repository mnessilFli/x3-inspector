/** RFC 4180 CSV parser (quotes, doubled quotes, CRLF, separators inside quotes). Returns header + rows. */
export function parseCsv(text: string, separator = ','): { header: string[]; rows: string[][] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (!(record.length === 1 && record[0] === '')) records.push(record);
    record = [];
  };

  for (; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === separator) endField();
    else if (c === '\n') endRecord();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRecord();
    } else field += c;
  }
  if (field !== '' || record.length) endRecord();

  const [header = [], ...rows] = records;
  return { header, rows };
}

/** Rows as objects keyed by header. */
export function csvObjects(text: string): { header: string[]; objects: Array<Record<string, string>> } {
  const { header, rows } = parseCsv(text);
  return { header, objects: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
