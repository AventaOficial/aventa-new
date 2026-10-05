/**
 * Tabla `machine_clients` vacía para mocks de Supabase.
 * El firewall económico consulta esta tabla; vacía = ningún autor es cliente MCP (autor humano).
 */
export function emptyMachineClientsTable() {
  const result = { data: [] as unknown[], error: null };
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.in = () => query;
  query.limit = async () => result;
  query.maybeSingle = async () => ({ data: null, error: null });
  query.then = (resolve: (value: typeof result) => unknown) => resolve(result);
  return query;
}

/** Tabla `machine_clients` con un autor MCP registrado. */
export function machineClientsTableWithAuthor(authorProfileId: string) {
  const query: Record<string, unknown> = {};
  let filteredAuthor: string | null = null;
  const result = () => ({
    data: filteredAuthor === authorProfileId ? [{ id: 'mc-1' }] : [],
    error: null,
  });
  query.select = () => query;
  query.eq = (column: string, value: string) => {
    if (column === 'author_profile_id') filteredAuthor = value;
    return query;
  };
  query.limit = async () => result();
  query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => resolve(result());
  return query;
}
