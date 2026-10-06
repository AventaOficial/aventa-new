/**
 * Temporada visual activa. Una sola fuente para Home.
 * No reemplaza marca, navegación ni el calendario de logros.
 */

export type SeasonModule = 'hero' | 'banner' | 'featured' | 'categories' | 'hunter';

export type SeasonHero = {
  kicker: string;
  line: string;
  accent: string;
  sub: string;
};

export type SeasonDefinition = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  accent: string;
  hero: SeasonHero;
  banner: string;
  modules: SeasonModule[];
  categories: string[];
  hunterNote: string | null;
};

/** Fechas en America/Mexico_City. Growth cambia esta lista, no Home. */
export const SEASONS: readonly SeasonDefinition[] = [
  {
    id: 'dia-de-muertos',
    name: 'Día de Muertos',
    startAt: '2026-11-01T00:00:00-06:00',
    endAt: '2026-11-03T00:00:00-06:00',
    accent: '#7c3aed',
    hero: {
      kicker: 'Día de Muertos',
      line: 'Descubre ofertas que',
      accent: 'valen la pena',
      sub: 'La comunidad sigue votando. Esta temporada solo cambia la decoración y el mensaje.',
    },
    banner: 'Temporada Día de Muertos. Mismo Aventa, acento de temporada.',
    modules: ['hero', 'banner', 'featured', 'categories', 'hunter'],
    categories: ['Hogar', 'Entretenimiento', 'Moda'],
    hunterNote: 'En Día de Muertos, un hallazgo claro de hogar o entretenimiento ayuda más que un título genérico.',
  },
  {
    id: 'buen-fin',
    name: 'Buen Fin',
    startAt: '2026-11-13T00:00:00-06:00',
    endAt: '2026-11-17T00:00:00-06:00',
    accent: '#6d28d9',
    hero: {
      kicker: 'Buen Fin',
      line: 'Descubre ofertas que',
      accent: 'valen la pena',
      sub: 'Buen Fin es una capa de temporada. El ranking sigue siendo de la comunidad.',
    },
    banner: 'Temporada Buen Fin. Revisa precio y votos antes de abrir la tienda.',
    modules: ['hero', 'banner', 'featured', 'categories', 'hunter'],
    categories: ['Tecnología', 'Moda', 'Hogar'],
    hunterNote: 'En Buen Fin conviene publicar el precio real y la tienda en el título.',
  },
  {
    id: 'navidad',
    name: 'Navidad',
    startAt: '2026-12-01T00:00:00-06:00',
    endAt: '2026-12-26T00:00:00-06:00',
    accent: '#5b21b6',
    hero: {
      kicker: 'Navidad',
      line: 'Descubre ofertas que',
      accent: 'valen la pena',
      sub: 'Navidad suma un mensaje de temporada. La marca de Aventa no cambia.',
    },
    banner: 'Temporada Navidad. Ofertas de la comunidad, con acento de fin de año.',
    modules: ['hero', 'banner', 'featured', 'categories', 'hunter'],
    categories: ['Hogar', 'Entretenimiento', 'Moda'],
    hunterNote: 'En Navidad, una foto clara y el precio final ayudan a que la comunidad vote.',
  },
];

export function seasonWindowsOverlap(catalog: readonly SeasonDefinition[] = SEASONS): boolean {
  const windows = catalog
    .map((season) => ({ id: season.id, start: Date.parse(season.startAt), end: Date.parse(season.endAt) }))
    .sort((a, b) => a.start - b.start);
  for (let index = 1; index < windows.length; index += 1) {
    const prev = windows[index - 1];
    const next = windows[index];
    if (!(prev && next)) continue;
    if (next.start < prev.end) return true;
  }
  return false;
}

export function resolveActiveSeason(now: Date, catalog: readonly SeasonDefinition[] = SEASONS): SeasonDefinition | null {
  const time = now.getTime();
  const active = catalog.filter((season) => {
    const start = Date.parse(season.startAt);
    const end = Date.parse(season.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && time >= start && time < end;
  });
  if (active.length > 1) {
    throw new Error('temporada duplicada');
  }
  return active[0] ?? null;
}
