/**
 * La reputación del autor solo cambia cuando esta llamada fue la que movió el estado.
 * Un 409 (otro moderador ganó), un error o un `idempotent` (ya estaba así) no cuentan:
 * contarlos duplicaría +1 en dobles clics o en lotes que se cruzan.
 */
export function moderationDecisionApplied(httpOk: boolean, data: unknown): boolean {
  if (!httpOk || !data || typeof data !== 'object') return false;
  const d = data as { ok?: unknown; idempotent?: unknown };
  return d.ok === true && d.idempotent !== true;
}

/** Resumen para el moderador cuando parte de un lote no se aplicó (lock ajeno, ya moderada…). */
export function batchFailureMessage(errors: readonly string[], total: number): string | null {
  if (errors.length === 0) return null;
  const first = errors.find((e) => e && e !== 'error');
  return `${errors.length} de ${total} no se aplicaron${first ? ` (${first})` : ''}.`;
}
