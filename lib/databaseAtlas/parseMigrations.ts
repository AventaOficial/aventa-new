export type DeclaredColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
};

export type DeclaredForeignKey = {
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
  evidence: 'migration';
};

export type DeclaredObject = {
  schema: string;
  name: string;
  kind: 'table' | 'view' | 'materialized_view' | 'function' | 'trigger';
  columns: DeclaredColumn[];
  primaryKey: string[];
  foreignKeys: DeclaredForeignKey[];
  indexes: string[];
  rlsEnabled: boolean | null;
  policies: { name: string; command: string }[];
  migrationFile: string;
  /** Null cuando el SQL no trae un COMMENT ON con una finalidad explícita. */
  purpose: string | null;
};

export type MigrationFile = { name: string; sql: string };

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(/gi;
const CREATE_VIEW = /create\s+(or\s+replace\s+)?(materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)/gi;
const CREATE_FUNCTION = /create\s+(?:or\s+replace\s+)?function\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)/gi;
const CREATE_TRIGGER = /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([a-zA-Z_][\w]*)\s+(?:before|after|instead\s+of)\s+[^\n;]+?\s+on\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)/gi;
const CREATE_INDEX = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w]*)\s+on\s+(?:(?:[a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)/gi;
const ENABLE_RLS = /alter\s+table\s+(?:only\s+)?(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s+enable\s+row\s+level\s+security/gi;
const CREATE_POLICY = /create\s+policy\s+"?([a-zA-Z0-9_]+)"?\s+on\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s+for\s+([a-zA-Z]+)/gi;
const COMMENT_TABLE = /comment\s+on\s+table\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s+is\s+'([^']*)'/gi;

function keyOf(schema: string, name: string): string {
  return `${schema}.${name}`.toLowerCase();
}

function extractParen(sql: string, openIndex: number): string | null {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return null;
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseColumn(part: string): { column: DeclaredColumn | null; foreignKey: DeclaredForeignKey | null; primaryKey: string[] } {
  const lower = part.toLowerCase();
  if (/^(constraint|unique|check|exclude|primary\s+key|foreign\s+key)\b/.test(lower)) {
    const pk = lower.startsWith('primary key') ? [...part.matchAll(/([a-zA-Z_][\w]*)/g)].slice(2).map((m) => m[1]!).filter((n) => n !== 'key') : [];
    return { column: null, foreignKey: null, primaryKey: pk };
  }
  const match = part.match(/^"?([a-zA-Z_][\w]*)"?\s+([\s\S]+)$/);
  if (!match) return { column: null, foreignKey: null, primaryKey: [] };
  const name = match[1]!;
  const rest = match[2]!.replace(/\s+/g, ' ').trim();
  const type = rest.split(/\s+/)[0] ?? 'unknown';
  const ref = rest.match(/references\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(\s*([a-zA-Z_][\w]*)\s*\)/i);
  return {
    column: { name, dataType: type.replace(/,$/, ''), nullable: !/\bnot\s+null\b/i.test(rest) },
    foreignKey: ref
      ? { columns: [name], refSchema: (ref[1] ?? 'public').toLowerCase(), refTable: ref[2]!, refColumns: [ref[3]!], evidence: 'migration' }
      : null,
    primaryKey: /\bprimary\s+key\b/i.test(rest) ? [name] : [],
  };
}

function ensure(map: Map<string, DeclaredObject>, schema: string, name: string, kind: DeclaredObject['kind'], file: string): DeclaredObject {
  const id = keyOf(schema, name);
  const existing = map.get(id);
  if (existing) return existing;
  const created: DeclaredObject = {
    schema,
    name,
    kind,
    columns: [],
    primaryKey: [],
    foreignKeys: [],
    indexes: [],
    rlsEnabled: null,
    policies: [],
    migrationFile: file,
    purpose: null,
  };
  map.set(id, created);
  return created;
}

/** Inventario declarado por el texto de las migraciones. No consulta una base. */
export function parseMigrationFiles(files: MigrationFile[]): DeclaredObject[] {
  const map = new Map<string, DeclaredObject>();
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of ordered) {
    const sql = file.sql;
    for (const match of sql.matchAll(CREATE_TABLE)) {
      const schema = (match[1] ?? 'public').toLowerCase();
      const name = match[2]!;
      const open = (match.index ?? 0) + match[0].length - 1;
      const body = extractParen(sql, open);
      const object = ensure(map, schema, name, 'table', file.name);
      object.kind = 'table';
      if (!body) continue;
      for (const part of splitTopLevel(body)) {
        const parsed = parseColumn(part);
        if (parsed.column && !object.columns.some((column) => column.name === parsed.column!.name)) object.columns.push(parsed.column);
        if (parsed.foreignKey) object.foreignKeys.push(parsed.foreignKey);
        for (const column of parsed.primaryKey) {
          if (!object.primaryKey.includes(column)) object.primaryKey.push(column);
        }
      }
    }
    for (const match of sql.matchAll(CREATE_VIEW)) {
      const schema = (match[3] ?? 'public').toLowerCase();
      ensure(map, schema, match[4]!, match[2] ? 'materialized_view' : 'view', file.name);
    }
    for (const match of sql.matchAll(CREATE_FUNCTION)) {
      ensure(map, (match[1] ?? 'public').toLowerCase(), match[2]!, 'function', file.name);
    }
    for (const match of sql.matchAll(CREATE_TRIGGER)) {
      const object = ensure(map, (match[2] ?? 'public').toLowerCase(), match[1]!, 'trigger', file.name);
      object.kind = 'trigger';
      object.purpose = object.purpose ?? `Asociado a ${match[3]}`;
    }
    for (const match of sql.matchAll(CREATE_INDEX)) {
      const table = map.get(keyOf('public', match[2]!));
      if (table && !table.indexes.includes(match[1]!)) table.indexes.push(match[1]!);
    }
    for (const match of sql.matchAll(ENABLE_RLS)) {
      const object = map.get(keyOf((match[1] ?? 'public').toLowerCase(), match[2]!));
      if (object) object.rlsEnabled = true;
    }
    for (const match of sql.matchAll(CREATE_POLICY)) {
      const object = map.get(keyOf((match[2] ?? 'public').toLowerCase(), match[3]!));
      if (object && !object.policies.some((policy) => policy.name === match[1])) {
        object.policies.push({ name: match[1]!, command: match[4]!.toLowerCase() });
      }
    }
    for (const match of sql.matchAll(COMMENT_TABLE)) {
      const object = map.get(keyOf((match[1] ?? 'public').toLowerCase(), match[2]!));
      if (object) object.purpose = match[3]!.trim() || null;
    }
  }
  return [...map.values()].sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
}
