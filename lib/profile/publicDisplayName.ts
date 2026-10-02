/**
 * Nombre visible en superficies públicas.
 * No modifica el registro ni el nombre guardado.
 */
const INTERNAL_PUBLIC_NAME = /machine\s*supply|\bstaging\b/i;

export function publicDisplayName(raw: string | null | undefined, fallback = 'Usuario'): string {
  const name = raw?.trim() ?? '';
  if (!name) return fallback;
  if (INTERNAL_PUBLIC_NAME.test(name)) return 'Aventa';
  return name;
}
