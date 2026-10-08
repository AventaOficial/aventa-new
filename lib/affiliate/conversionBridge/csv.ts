/** CSV determinista. La primera fila es encabezado. No infiere columnas. */

export function parseCsvTable(text: string): { headers: string[]; records: Array<Record<string, string>>; rowNumbers: number[] } | null {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  const headers = splitCsvLine(lines[0]!).map((cell) => cell.trim());
  if (headers.length === 0 || headers.some((header) => !header)) return null;
  const records: Array<Record<string, string>> = [];
  const rowNumbers: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]!);
    const record: Record<string, string> = {};
    headers.forEach((header, cell) => {
      record[header] = (cells[cell] ?? '').trim();
    });
    records.push(record);
    rowNumbers.push(index + 1);
  }
  return { headers, records, rowNumbers };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function sameHeaders(actual: string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((header, index) => header === expected[index]);
}
