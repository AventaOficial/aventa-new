/**
 * Ids de autores máquina configurados por entorno.
 * Incluye los bots de ingesta y los autores de clientes MCP (`MCP_BOT_AUTHOR_USER_IDS`, lista separada por comas).
 */
export function configuredBotUserIds(): string[] {
  const single = [process.env.BOT_INGEST_USER_ID, process.env.BOT_INGEST_USER_ID_TECH, process.env.BOT_INGEST_USER_ID_STAPLES];
  const mcp = (process.env.MCP_BOT_AUTHOR_USER_IDS ?? '').split(',');
  return [...single, ...mcp].map((v) => v?.trim()).filter((v): v is string => Boolean(v));
}

/** True si el user id es un autor máquina (ingesta o MCP). */
export function isBotUserId(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return false;
  return configuredBotUserIds().includes(userId.trim());
}

export const BOT_AUTHOR_DISPLAY_NAME = 'Aventa Bot';
