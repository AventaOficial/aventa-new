/**
 * Formatea un valor numérico como precio en MXN (solo presentación, sin conversión).
 * Acepta number o string (p. ej. numeric de Supabase) y convierte a number antes de formatear.
 */
const formatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

export function formatPriceMXN(value: number | string): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return formatter.format(0) + ' MXN';
  }
  return formatter.format(amount) + ' MXN';
}
