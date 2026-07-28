/**
 * Hand-rolled CSV parser — quoted fields, embedded commas/newlines, escaped
 * quotes ("" inside a quoted field), CRLF or LF line endings. No dependency:
 * admin-uploaded files are a trusted-user input (same trust boundary as any
 * other admin form), and this is a simple bounded state machine, not a regex
 * — no ReDoS surface.
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): ParsedCsv {
  const rows = tokenizeCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim());
  const objectRows = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows: objectRows };
}
