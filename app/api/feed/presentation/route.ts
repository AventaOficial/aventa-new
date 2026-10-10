import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_FEED_PRESENTATION } from '@/lib/control/schema';
import { readFeedPresentation } from '@/lib/control/store';

/** Parámetros públicos de presentación. Si la tabla no existe, devuelve el valor en código. */
export async function GET() {
  try {
    const presentation = await readFeedPresentation(createServerClient());
    return NextResponse.json(presentation);
  } catch {
    return NextResponse.json(DEFAULT_FEED_PRESENTATION);
  }
}
