/**
 * Kill switch de escritura MCP. Apagado por defecto.
 * Sólo `MCP_INGEST_ENABLED=true` (o `1`) habilita submit_deal_candidates.
 * Las herramientas de lectura siguen disponibles con el switch apagado.
 */
export function isMcpIngestEnabled(): boolean {
  const raw = process.env.MCP_INGEST_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}
