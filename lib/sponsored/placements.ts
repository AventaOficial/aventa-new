/**
 * Inventario patrocinado del Home: qué campaña aparece, dónde y cuántas veces.
 * Lógica pura (sin red ni base): el feed solo pregunta "¿qué va después de la oferta N?".
 */

export type SponsoredSurface = 'feed' | 'rail';

export type SponsoredCampaign = {
  id: string;
  /** `house`: espacio propio de Aventa sin anunciante que pague. `paid`: campaña vendida. */
  kind: 'house' | 'paid';
  /** Tienda anunciada; el destino es su página en Aventa o, si no existe, la búsqueda. */
  store: string;
  creative: { title: string; cta: string };
  surfaces: SponsoredSurface[];
  /** Mayor primero. Desempata el orden de aparición. */
  priority: number;
  /** ISO. Fuera de la ventana la campaña no se muestra. */
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  /** Frequency cap por vista de feed. */
  maxPerFeed: number;
};

export type FeedPlacementPolicy = {
  /** Primer espacio después de esta cantidad de ofertas. */
  firstAfter: number;
  /** Ofertas entre un espacio y el siguiente. */
  every: number;
  /** Tope de espacios por vista, aunque haya campañas de sobra. */
  maxSlots: number;
};

/** 3 ofertas → bloque → 3 ofertas → bloque. La frecuencia vive aquí, no en cada página. */
export const DEFAULT_FEED_POLICY: FeedPlacementPolicy = { firstAfter: 3, every: 3, maxSlots: 40 };

/** Etiqueta visible del espacio: solo una campaña pagada se presenta como publicidad. */
export function sponsoredDisclosure(kind: SponsoredCampaign['kind']): string {
  return kind === 'paid' ? 'Patrocinado' : 'Destacado por AVENTA';
}

function inWindow(c: SponsoredCampaign, now: number): boolean {
  const start = c.startsAt ? Date.parse(c.startsAt) : NaN;
  const end = c.endsAt ? Date.parse(c.endsAt) : NaN;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now >= end) return false;
  return true;
}

/** Campañas activas, vigentes y para esta superficie; pagadas antes que house, luego por prioridad. */
export function eligibleCampaigns(
  campaigns: readonly SponsoredCampaign[],
  surface: SponsoredSurface,
  now: number,
): SponsoredCampaign[] {
  return campaigns
    .filter((c) => c.active && c.maxPerFeed > 0 && c.surfaces.includes(surface) && inWindow(c, now))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'paid' ? -1 : 1) || b.priority - a.priority || a.id.localeCompare(b.id));
}

/**
 * Mapa índice-de-oferta → campaña que va justo después de esa oferta.
 * Rota entre campañas elegibles respetando `maxPerFeed`; si se agotan, no hay más espacios.
 */
export function planFeedPlacements(
  itemCount: number,
  campaigns: readonly SponsoredCampaign[],
  policy: FeedPlacementPolicy,
  now: number,
): Map<number, SponsoredCampaign> {
  const plan = new Map<number, SponsoredCampaign>();
  const pool = eligibleCampaigns(campaigns, 'feed', now);
  if (pool.length === 0 || policy.firstAfter < 1 || policy.maxSlots < 1) return plan;

  const used = new Map<string, number>();
  let cursor = 0;
  const step = Math.max(1, policy.every);

  for (let after = policy.firstAfter; after <= itemCount && plan.size < policy.maxSlots; after += step) {
    let picked: SponsoredCampaign | null = null;
    for (let tries = 0; tries < pool.length; tries++) {
      const candidate = pool[(cursor + tries) % pool.length];
      if ((used.get(candidate.id) ?? 0) < candidate.maxPerFeed) {
        picked = candidate;
        cursor = (cursor + tries + 1) % pool.length;
        break;
      }
    }
    if (!picked) break;
    used.set(picked.id, (used.get(picked.id) ?? 0) + 1);
    plan.set(after - 1, picked);
  }
  return plan;
}
