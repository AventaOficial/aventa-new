/**
 * CazaOfertasss — FASE 1. Cliente Supabase duck-typed.
 *
 * No importamos `@supabase/supabase-js` dentro del bounded context para
 * mantener el aislamiento de dependencias; el llamador inyecta el cliente
 * service_role desde fuera (p. ej. `createServerClient()`).
 */

export type CazaDbError = { message: string; code?: string };

export type CazaDbResult<T> = {
  data: T;
  error: CazaDbError | null;
};

/**
 * Superficie mínima usada por los repos. Compatible con SupabaseClient
 * vía structural typing (cast en el borde de la aplicación).
 *
 * `from` queda sin tipar estrictamente: el query builder de supabase-js es
 * un fluent API demasiado profundo para duplicar aquí sin acoplarnos al SDK.
 */
export type CazaSupabaseClient = {
  // Query builder fluent — tipado estructural laxo a propósito.
  from: (table: string) => CazaQueryBuilder;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<CazaDbResult<unknown>>;
};

/** Fluent builder mínimo que usan los repos (subset de PostgREST). */
export type CazaQueryBuilder = {
  select: (columns: string) => CazaQueryBuilder;
  eq: (column: string, value: string) => CazaQueryBuilder;
  in: (column: string, values: readonly string[]) => CazaQueryBuilder;
  gt: (column: string, value: string) => CazaQueryBuilder;
  lte: (column: string, value: string) => CazaQueryBuilder;
  or: (filters: string) => CazaQueryBuilder;
  order: (column: string, opts: { ascending: boolean }) => CazaQueryBuilder;
  limit: (n: number) => CazaQueryBuilder & PromiseLike<CazaDbResult<unknown>>;
  maybeSingle: () => Promise<CazaDbResult<unknown>>;
  upsert: (
    row: Record<string, unknown>,
    opts: { onConflict: string }
  ) => Promise<CazaDbResult<unknown>>;
};
