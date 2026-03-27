import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { persistSystemIntegrityResult, runSystemIntegrityChecks, type SystemIntegrityResult } from '@/lib/server/systemIntegrity';

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const runNow = searchParams.get('run') === '1';

  if (runNow) {
    const result = await runSystemIntegrityChecks();
    await persistSystemIntegrityResult(result);
    return NextResponse.json({ source: 'live', result });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'system_integrity_last')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (data as { value?: unknown } | null)?.value as SystemIntegrityResult | undefined;
  return NextResponse.json({
    source: 'cached',
    result: result ?? null,
    hasData: !!result,
  });
}

