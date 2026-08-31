import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { buildModerationOpsStats } from '@/lib/moderation/moderationOpsStats';

/** GET — métricas operativas mínimas de moderación (read-only). */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServerClient();
    const stats = await buildModerationOpsStats(supabase);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudieron cargar métricas';
    console.error('[moderation-ops-stats]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
