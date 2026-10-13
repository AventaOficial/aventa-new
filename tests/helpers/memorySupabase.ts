import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase en memoria para tests de dominio.
 * Soporta select/eq/neq/in/is/gt/gte/lt/lte/like/ilike/or/order/limit/maybeSingle/single,
 * insert, update, delete y rpc (con handlers opcionales),
 * con índices únicos declarados por tabla (incluidos parciales).
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type UniqueIndex = { columns: string[]; where?: (row: Row) => boolean };

export type MemoryDb = {
  tables: Record<string, Row[]>;
  unique: Record<string, UniqueIndex[]>;
  failOn: Record<string, { op: 'select' | 'insert' | 'update' | 'delete'; error: { code?: string; message: string } } | undefined>;
  rpcCalls: Array<{ fn: string; args: unknown }>;
  /** Escrituras realizadas (insert/update/delete) por tabla, en orden. */
  writes?: Array<{ table: string; op: 'insert' | 'update' | 'delete' }>;
  /** Columnas que «no existen» (migración sin aplicar): un select que las pida falla con 42703. */
  missingColumns?: Record<string, string[]>;
  /** Implementación de funciones RPC; sin handler, `rpc` devuelve `{ data: null, error: null }`. */
  rpcHandlers?: Record<string, (args: Record<string, unknown>, db: MemoryDb) => { data: unknown; error: unknown }>;
};

let seq = 0;
function uuid(): string {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export function createMemoryDb(init: Partial<Pick<MemoryDb, 'tables' | 'unique'>> = {}): MemoryDb {
  return { tables: { ...(init.tables ?? {}) }, unique: { ...(init.unique ?? {}) }, failOn: {}, rpcCalls: [], writes: [] };
}

function violates(db: MemoryDb, table: string, candidate: Row, ignore?: Row): boolean {
  const rows = db.tables[table] ?? [];
  for (const idx of db.unique[table] ?? []) {
    if (idx.where && !idx.where(candidate)) continue;
    if (idx.columns.some((c) => candidate[c] == null)) continue;
    const clash = rows.some(
      (r) => r !== ignore && (!idx.where || idx.where(r)) && idx.columns.every((c) => r[c] === candidate[c]),
    );
    if (clash) return true;
  }
  return false;
}

const UNIQUE_ERROR = { code: '23505', message: 'duplicate key value violates unique constraint' };

function splitOr(expr: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of expr) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function likeRegex(pattern: string, insensitive: boolean): RegExp {
  const body = pattern
    .split(/[*%]/)
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`, insensitive ? 'is' : 's');
}

function compare(col: string, op: string, val: string): Filter {
  switch (op) {
    case 'is':
      return (r) => (val === 'null' ? r[col] == null : String(r[col]) === val);
    case 'eq':
      return (r) => r[col] != null && String(r[col]) === val;
    case 'neq':
      return (r) => r[col] != null && String(r[col]) !== val;
    case 'gt':
      return (r) => r[col] != null && String(r[col]) > val;
    case 'gte':
      return (r) => r[col] != null && String(r[col]) >= val;
    case 'lt':
      return (r) => r[col] != null && String(r[col]) < val;
    case 'lte':
      return (r) => r[col] != null && String(r[col]) <= val;
    case 'like':
    case 'ilike': {
      const re = likeRegex(val, op === 'ilike');
      return (r) => r[col] != null && re.test(String(r[col]));
    }
    default:
      throw new Error(`memorySupabase: operador no soportado «${op}»`);
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private returning = false;
  private limitN: number | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private withCount = false;

  constructor(private db: MemoryDb, private table: string) {}

  private columns: string[] = [];

  select(columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.op !== 'select') this.returning = true;
    if (opts?.count) this.withCount = true;
    if (columns) this.columns = columns.split(',').map((c) => c.trim());
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => String(r[col] ?? '') >= val);
    return this;
  }
  lte(col: string, val: string) {
    this.filters.push((r) => String(r[col] ?? '') <= val);
    return this;
  }
  gt(col: string, val: string) {
    this.filters.push((r) => r[col] != null && String(r[col]) > val);
    return this;
  }
  lt(col: string, val: string) {
    this.filters.push((r) => r[col] != null && String(r[col]) < val);
    return this;
  }
  like(col: string, pattern: string) {
    this.filters.push(compare(col, 'like', pattern));
    return this;
  }
  ilike(col: string, pattern: string) {
    this.filters.push(compare(col, 'ilike', pattern));
    return this;
  }
  /** Subconjunto de la sintaxis PostgREST `or`: `col.op.valor` separados por comas, sin anidar. */
  or(expr: string) {
    const parts = splitOr(expr).map((p) => {
      const m = /^([a-z_]+)\.(is|eq|neq|gt|gte|lt|lte|like|ilike)\.(.*)$/.exec(p);
      if (!m) throw new Error(`memorySupabase.or: expresión no soportada «${p}»`);
      const raw = m[3].startsWith('"') && m[3].endsWith('"') ? m[3].slice(1, -1) : m[3];
      return compare(m[1], m[2], raw);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this.run();
  }
  single() {
    this.mode = 'single';
    return this.run();
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private shape(rows: Row[]): { data: unknown; error: unknown } {
    if (this.mode === 'many') return { data: rows.map((r) => ({ ...r })), error: null };
    if (rows.length === 0) {
      return this.mode === 'single' ? { data: null, error: { code: 'PGRST116', message: 'no rows' } } : { data: null, error: null };
    }
    return { data: { ...rows[0] }, error: null };
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    const fail = this.db.failOn[this.table];
    if (fail && fail.op === this.op) return { data: null, error: fail.error };
    const missing = this.db.missingColumns?.[this.table] ?? [];
    const asked = this.op === 'select' ? this.columns : this.op === 'insert' || this.op === 'update' ? Object.keys((Array.isArray(this.payload) ? this.payload[0] : this.payload) ?? {}) : [];
    const absent = asked.find((c) => missing.includes(c));
    if (absent) return { data: null, error: { code: '42703', message: `column ${this.table}.${absent} does not exist` } };
    const rows = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op !== 'select') (this.db.writes ??= []).push({ table: this.table, op: this.op });

    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: raw.id ?? uuid(), created_at: raw.created_at ?? new Date().toISOString(), ...raw };
        if (violates(this.db, this.table, row)) return { data: null, error: UNIQUE_ERROR };
        rows.push(row);
        inserted.push(row);
      }
      return this.returning ? this.shape(inserted) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const targets = rows.filter(match);
      for (const r of targets) {
        const next = { ...r, ...(this.payload as Row) };
        if (violates(this.db, this.table, next, r)) return { data: null, error: UNIQUE_ERROR };
        Object.assign(r, this.payload);
      }
      return this.returning ? this.shape(targets) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    let out = rows.filter(match);
    const total = out.length;
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    const shaped = this.shape(out);
    return this.withCount ? { ...shaped, count: total } : shaped;
  }
}

export function memorySupabase(db: MemoryDb): SupabaseClient {
  return {
    from: (table: string) => new Query(db, table),
    rpc: async (fn: string, args: unknown) => {
      db.rpcCalls.push({ fn, args });
      const handler = db.rpcHandlers?.[fn];
      return handler ? handler((args ?? {}) as Record<string, unknown>, db) : { data: null, error: null };
    },
  } as unknown as SupabaseClient;
}

const OPEN_ITEM_STATUSES = new Set(['INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR', 'APPROVED']);

/** Índices únicos reales del lane de lotes y de clientes MCP. */
export function mcpUniqueIndexes(): MemoryDb['unique'] {
  return {
    machine_clients: [{ columns: ['token_prefix'] }],
    offer_batches: [{ columns: ['machine_client_id', 'mcp_idempotency_key'], where: (r) => r.machine_client_id != null }],
    offer_batch_items: [
      { columns: ['batch_id', 'identity_key'] },
      { columns: ['identity_key'], where: (r) => OPEN_ITEM_STATUSES.has(String(r.status)) },
    ],
    offers: [{ columns: ['ingestion_identity_key'], where: (r) => r.ingestion_identity_key != null && r.deleted_at == null }],
    ingest_cycle_locks: [{ columns: ['lock_key'] }],
  };
}
