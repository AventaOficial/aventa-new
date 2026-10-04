export const USER_SEARCH_DEFAULT_LIMIT = 20;
export const USER_SEARCH_MAX_LIMIT = 50;
export const USER_SEARCH_MAX_QUERY = 80;
export const USER_SEARCH_MAX_OFFSET = 10000;

export type UserSearchParams = {
  ok: true;
  query: string;
  limit: number;
  page: number;
  offset: number;
};

function readInteger(value: string | null, fallback: number): number | null {
  if (value === null || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

/**
 * q vacío o ausente devuelve la primera página. El tamaño de página tiene tope:
 * nunca se piden todos los usuarios.
 */
export function readUserSearchParams(params: URLSearchParams): UserSearchParams | { ok: false } {
  const query = (params.get('q') ?? '').trim();
  if (query.length > USER_SEARCH_MAX_QUERY) return { ok: false };
  const limit = readInteger(params.get('limit'), USER_SEARCH_DEFAULT_LIMIT);
  const page = readInteger(params.get('page'), 0);
  if (limit === null || page === null) return { ok: false };
  if (limit < 1 || limit > USER_SEARCH_MAX_LIMIT) return { ok: false };
  const offset = page * limit;
  if (offset > USER_SEARCH_MAX_OFFSET) return { ok: false };
  return { ok: true, query, limit, page, offset };
}
