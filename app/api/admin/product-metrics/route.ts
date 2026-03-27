import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireMetrics } from '@/lib/server/requireAdmin';

/** GET: métricas de producto (retención 48h, activos, nuevos por día, mejor hora). Solo roles con acceso a métricas. */
export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const now = new Date();
  // "Hoy" en zona México para que los números cuadren con lo que ve el equipo (MX).
  const tz = 'America/Mexico_City';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  const todayStart = new Date(`${y}-${m}-${d}T06:00:00.000Z`).toISOString(); // 00:00 MX = 06:00 UTC
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Usuarios nuevos hoy (profiles creados hoy)
  const { count: newUsersToday } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart);

  // Usuarios activos en últimas 24h (user_activity.last_seen_at)
  let activeUsers24h = 0;
  try {
    const { count } = await supabase
      .from('user_activity')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_seen_at', last24h);
    activeUsers24h = count ?? 0;
  } catch {
    // user_activity puede no existir aún
  }

  // Retención 48h: de usuarios con first_seen >= 48h atrás, % que tienen last_seen > first_seen + 5 min y last_seen <= first_seen + 48h
  let retention48hPct: number | null = null;
  let avg_duration_minutes_retention_48h: number | null = null;
  try {
    const { data: activity } = await supabase
      .from('user_activity')
      .select('user_id, first_seen_at, last_seen_at')
      .lt('first_seen_at', fortyEightHoursAgo);
    const cohort = (activity ?? []) as { user_id: string; first_seen_at: string; last_seen_at: string }[];
    const returned = cohort.filter((r) => {
      const first = new Date(r.first_seen_at).getTime();
      const last = new Date(r.last_seen_at).getTime();
      const fiveMin = 5 * 60 * 1000;
      const fortyEight = 48 * 60 * 60 * 1000;
      return last - first >= fiveMin && last <= first + fortyEight;
    });
    retention48hPct = cohort.length > 0 ? Math.round((returned.length / cohort.length) * 10000) / 100 : null;
    // Tiempo est. dentro: media (last_seen - first_seen) en minutos para los retornados 48h
    if (returned.length > 0) {
      const sumMinutes = returned.reduce((acc, r) => {
        const first = new Date(r.first_seen_at).getTime();
        const last = new Date(r.last_seen_at).getTime();
        return acc + (last - first) / (60 * 1000);
      }, 0);
      avg_duration_minutes_retention_48h = Math.round(sumMinutes / returned.length);
    }
  } catch {
    // ignore
  }

  // Mejor hora: hora del día (0-23) con más last_seen_at en user_activity (últimos 7 días)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let bestHour: number | null = null;
  let bestHourCount = 0;
  try {
    const { data: rows } = await supabase
      .from('user_activity')
      .select('last_seen_at')
      .gte('last_seen_at', weekAgo);
    const byHour = new Map<number, number>();
    for (const r of (rows ?? []) as { last_seen_at: string }[]) {
      const h = new Date(r.last_seen_at).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }
    for (const [h, c] of byHour) {
      if (c > bestHourCount) {
        bestHourCount = c;
        bestHour = h;
      }
    }
  } catch {
    // ignore
  }

  // Crecimiento semanal: usuarios nuevos últimos 7 días vs 7 días anteriores.
  // Fórmula: ((actual - previo) / max(previo,1)) * 100
  let growthWeeklyPct: number | null = null;
  try {
    const [currentWindow, previousWindow] = await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString()),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fourteenDaysAgo.toISOString())
        .lt('created_at', sevenDaysAgo.toISOString()),
    ]);

    const current = currentWindow.count ?? 0;
    const previous = previousWindow.count ?? 0;
    growthWeeklyPct = Math.round((((current - previous) / Math.max(previous, 1)) * 100) * 100) / 100;
  } catch {
    // ignore
  }

  return NextResponse.json({
    new_users_today: newUsersToday ?? 0,
    active_users_24h: activeUsers24h,
    retention_48h_pct: retention48hPct,
    avg_duration_minutes_retention_48h: avg_duration_minutes_retention_48h,
    best_hour_utc: bestHour,
    best_hour_count: bestHourCount,
    growth_weekly_pct: growthWeeklyPct,
  });
}
