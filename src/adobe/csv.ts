import fs from 'node:fs';
import path from 'node:path';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        const next = text[index + 1];
        if (next === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function appendCsvRow(filePath: string, headers: readonly string[], row: readonly string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const headerLine = `${headers.map(csvEscape).join(',')}\n`;
    fs.writeFileSync(filePath, headerLine, 'utf8');
  }

  const line = `${row.map((value) => csvEscape(value ?? '')).join(',')}\n`;
  fs.appendFileSync(filePath, line, 'utf8');
}

export function writeCsvFile(filePath: string, headers: readonly string[], rows: readonly (readonly string[])[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map((value) => csvEscape(value ?? '')).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}
