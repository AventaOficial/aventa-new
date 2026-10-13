/**
 * Una corrida manual de la captura de precios de Canasta Básica, para validar en un entorno
 * autorizado (local o staging). Rechaza el proyecto de producción.
 *
 *   npx tsx --env-file=.env.local scripts/price-capture-run-once.ts --target=staging --dry-run
 *   npx tsx --env-file=.env.local scripts/price-capture-run-once.ts --target=staging --confirm-write
 *
 * Sin --confirm-write siempre es dry-run (lee fuentes y valida, no escribe nada).
 * Respeta app_config.despensa_price_capture: si no hay fila con enabled=true, no hace nada.
 * Imprime solo el reporte estructurado; nunca credenciales.
 */
import { createClient } from '@supabase/supabase-js';
import { runPriceCaptureCycle } from '@/lib/offers/priceObservations/capture';
import { extractSupabaseProjectRef, isProductionSupabaseRef, STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const target = arg('target');
  const ref = extractSupabaseProjectRef(url);
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);

  if (!url || !key) {
    console.error('ABORT: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }
  if (isProductionSupabaseRef(ref)) {
    console.error('ABORT: este script no corre contra producción.');
    process.exit(2);
  }
  if (target === 'staging' && ref !== STAGING_SUPABASE_REF) {
    console.error(`ABORT: --target=staging pero el proyecto es "${ref ?? 'desconocido'}".`);
    process.exit(2);
  }
  if (target === 'local' && !isLocal) {
    console.error('ABORT: --target=local pero la URL no es local.');
    process.exit(2);
  }
  if (target !== 'staging' && target !== 'local') {
    console.error('ABORT: indica --target=local o --target=staging.');
    process.exit(2);
  }

  const dryRun = arg('confirm-write') !== 'true';
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const report = await runPriceCaptureCycle({ supabase, dryRun, log: () => undefined });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'failed' ? 1 : 0);
}

main().catch(() => {
  console.error('price-capture-run-once: error inesperado');
  process.exit(1);
});
