import { ALL_CATEGORIES } from '@/lib/categories';
import { createOfferBatch, listOfferBatches } from '@/lib/offers/batch';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const batches = await listOfferBatches(auth.supabase, 40);
  const ids = batches.map((row) => row.id);
  const authorIds = [...new Set(batches.map((row) => row.created_by).filter(Boolean))];
  const names = new Map<string, string>();
  const kindsByBatch = new Map<string, string[]>();

  if (authorIds.length > 0) {
    const { data: profiles } = await auth.supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', authorIds);
    for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      if (row.display_name?.trim()) names.set(row.id, row.display_name.trim());
    }
  }

  if (ids.length > 0) {
    const { data: items } = await auth.supabase
      .from('offer_batch_items')
      .select('batch_id, category')
      .in('batch_id', ids);
    const grouped = new Map<string, Set<string>>();
    for (const row of (items ?? []) as { batch_id: string; category: string | null }[]) {
      const label = ALL_CATEGORIES.find((cat) => cat.value === row.category)?.label;
      const vital = ALL_CATEGORIES.find((cat) => cat.value === row.category)?.vital;
      if (!label) continue;
      const set = grouped.get(row.batch_id) ?? new Set<string>();
      if (vital) set.add('Día a día');
      set.add(label);
      grouped.set(row.batch_id, set);
    }
    for (const [batchId, set] of grouped) {
      const list = [...set];
      list.sort((a, b) => (a === 'Día a día' ? -1 : b === 'Día a día' ? 1 : a.localeCompare(b, 'es')));
      kindsByBatch.set(batchId, list.slice(0, 4));
    }
  }

  return jsonOk({
    ok: true,
    batches: batches.map((row) => ({
      ...row,
      author_name: names.get(row.created_by) ?? null,
      kinds: kindsByBatch.get(row.id) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text : '';
  const name = typeof body?.name === 'string' ? body.name : null;
  const result = await createOfferBatch({
    supabase: auth.supabase,
    createdBy: auth.user.id,
    name,
    text,
  });
  if (!result.ok) return jsonError(result.error, result.httpStatus);
  if (!result.batch) {
    return jsonError('Esas ofertas ya están en un lote abierto.', 409);
  }
  return jsonOk({
    ok: true,
    batch: result.batch,
    inserted: result.inserted,
    duplicatesInText: result.duplicatesInText,
    truncated: result.truncated,
    openConflicts: result.openConflicts,
  });
}
