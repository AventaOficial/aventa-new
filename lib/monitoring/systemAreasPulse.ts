import { createServerClient } from '@/lib/supabase/server';

export type PulseAreaStatus = 'ok' | 'error';

export type PulseArea = {
  key: string;
  /** Título corto para la tarjeta */
  title: string;
  /** Una frase que cualquiera entienda */
  plain: string;
  /** Qué significa en la app */
  whatFor: string;
  status: PulseAreaStatus;
  /** Resumen legible (números o error corto) */
  summary: string;
  /** Detalle técnico solo si falló */
  technical?: string;
};

export type SystemsAreasPulseResult = {
  checkedAt: string;
  /** Tiempo total de las comprobaciones en el servidor (no es “velocidad del sitio”, solo esta lectura) */
  checkDurationMs: number;
  areas: PulseArea[];
};

/**
 * Comprobaciones ligeras por “área” del producto: misma idea que /api/health pero desglosada.
 * Usa service role; no sustituye pruebas E2E ni carga real.
 */
export async function runSystemsAreasPulse(): Promise<SystemsAreasPulseResult> {
  const checkedAt = new Date().toISOString();
  const t0 = Date.now();
  const supabase = createServerClient();

  const [offersRes, feedRes, votesRes, commentsRes] = await Promise.all([
    supabase.from('offers').select('id', { count: 'exact', head: true }),
    supabase.from('ofertas_ranked_general').select('id').limit(1),
    supabase.from('offer_votes').select('id', { count: 'exact', head: true }),
    supabase.from('comments').select('id').limit(1),
  ]);

  const checkDurationMs = Date.now() - t0;

  const areas: PulseArea[] = [];

  areas.push({
    key: 'offers',
    title: 'Ofertas guardadas',
    plain: offersRes.error ? 'No pudimos leer la tabla de ofertas.' : 'La base de datos responde y podemos contar ofertas.',
    whatFor: 'Todo lo que la gente sube vive aquí. Si falla, no hay producto.',
    status: offersRes.error ? 'error' : 'ok',
    summary: offersRes.error
      ? 'Error al consultar'
      : `Hay ${offersRes.count ?? 0} oferta(s) registradas (todas, no solo publicadas).`,
    technical: offersRes.error?.message,
  });

  areas.push({
    key: 'feed_ranking',
    title: 'Lista del home (ranking)',
    plain: feedRes.error
      ? 'La vista que ordena el feed no responde.'
      : 'El ranking del feed se puede leer bien.',
    whatFor: 'Es lo que usa la página principal para mostrar ofertas ordenadas.',
    status: feedRes.error ? 'error' : 'ok',
    summary: feedRes.error ? 'Error al consultar' : 'La vista `ofertas_ranked_general` contesta.',
    technical: feedRes.error?.message,
  });

  areas.push({
    key: 'votes',
    title: 'Votos',
    plain: votesRes.error
      ? 'No pudimos leer la tabla de votos.'
      : 'Los votos se pueden leer desde el servidor.',
    whatFor: 'Cuando alguien da like/dislike a una oferta, queda aquí.',
    status: votesRes.error ? 'error' : 'ok',
    summary: votesRes.error
      ? 'Error al consultar'
      : `Hay ${votesRes.count ?? 0} voto(s) guardados en total.`,
    technical: votesRes.error?.message,
  });

  areas.push({
    key: 'comments',
    title: 'Comentarios',
    plain: commentsRes.error
      ? 'No pudimos leer comentarios.'
      : 'Los comentarios se pueden leer.',
    whatFor: 'Debajo de cada oferta, la gente escribe aquí.',
    status: commentsRes.error ? 'error' : 'ok',
    summary: commentsRes.error ? 'Error al consultar' : 'La tabla `comments` contesta.',
    technical: commentsRes.error?.message,
  });

  return { checkedAt, checkDurationMs, areas };
}
