/**
 * Padding superior para páginas que conviven con la navbar pública flotante
 * (`aventa-public-navbar`: absolute top-0 right-0, no reserva espacio en el flujo).
 *
 * Alto de la navbar:
 * - móvil: max(0.75rem, safe-area-inset-top) + avatar h-11 (2.75rem) + pb-3 (0.75rem)
 * - md+:   p-4 (1rem) + avatar h-14 (3.5rem) + p-4 (1rem) = 5.5rem
 *
 * El offset suma 1rem de separación visual sobre ese alto.
 * Si cambia el alto de la navbar, este valor debe cambiar con ella.
 */
export const PUBLIC_NAVBAR_OFFSET_CLASS =
  'pt-[calc(max(0.75rem,env(safe-area-inset-top))+4.5rem)] md:pt-[6.5rem]';
