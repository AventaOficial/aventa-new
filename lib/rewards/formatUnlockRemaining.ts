/** Mensaje de requisitos pendientes para desbloquear el programa de recompensas. */
export function formatRewardsUnlockRemaining(missingOffers: number, missingVotes: number): string {
  const parts: string[] = [];
  if (missingOffers > 0) {
    parts.push(
      `${missingOffers} ${missingOffers === 1 ? 'oferta aprobada' : 'ofertas aprobadas'}`,
    );
  }
  if (missingVotes > 0) {
    parts.push(`${missingVotes} ${missingVotes === 1 ? 'voto positivo' : 'votos positivos'}`);
  }
  if (parts.length === 0) {
    return 'Cumpliste los requisitos de ofertas y votos. Revisa el estado de tu desbloqueo abajo.';
  }
  if (parts.length === 1) {
    const pluralVerb = missingOffers > 1 || missingVotes > 1 ? 'faltan' : 'falta';
    return `Te ${pluralVerb} ${parts[0]} para abrir tu panel de recompensas.`;
  }
  return `Te faltan ${parts.join(' y ')} para abrir tu panel de recompensas.`;
}
