import { NextResponse } from 'next/server';
import { requireModerationActor } from '@/lib/team/moderation/access';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireModerationActor(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await createServerClient()
    .from('machine_clients')
    .select('id, name')
    .eq('status', 'active')
    .order('name', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ hunters: [] });
  return NextResponse.json({
    hunters: (data ?? []).map((row) => ({
      id: String((row as { id: string }).id),
      name: String((row as { name?: string }).name ?? 'Hunter'),
    })),
  });
}
