/**
 * Título corto para la cola de moderación: una línea legible, sin cola de marketing del bot.
 */
export function shortModerationQueueTitle(raw: string | null | undefined): string {
  const title = (raw ?? '').trim();
  if (!title) return 'Sin título';

  // "Producto — Ahorra ~42% en Mercado Libre"
  const ahorraSplit = title.split(/\s*[—–]\s*/);
  if (ahorraSplit.length >= 2) {
    const tail = ahorraSplit.slice(1).join(' — ');
    if (/ahorra\s*~?\d+%/i.test(tail) || /\ben\s+(mercado\s*libre|amazon|walmart|liverpool)\b/i.test(tail)) {
      return ahorraSplit[0].trim() || title;
    }
  }

  // Fallback: corta en el primer guión largo si el resto parece tienda
  const dash = title.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (dash && /\b(mercado\s*libre|amazon|ml)\b/i.test(dash[2])) {
    return dash[1].trim();
  }

  return title;
}
