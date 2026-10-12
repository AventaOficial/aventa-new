import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { assertSupabaseUrlForProcess } from '@/lib/supabase/projectRefs'
import { createBoundedFetch } from '@/lib/supabase/boundedFetch'

/** Lecturas de páginas y APIs públicas. Holgado frente al p95 normal (~0,1 s) y por debajo del abandono del usuario. */
export const INTERACTIVE_SUPABASE_TIMEOUT_MS = 4_000
/** Escrituras de analítica esperadas dentro del request (beacon de page_view). No usar dentro de `after()`. */
export const ANALYTICS_SUPABASE_TIMEOUT_MS = 3_000

/**
 * Cliente Supabase con service_role. Solo para uso en servidor (API routes, server actions).
 * No exponer en el cliente.
 * Fail-closed: local/preview → staging ref; production deploy → production ref.
 * Sin `timeoutMs` no hay plazo: crons y tareas largas (hasta 300 s) siguen usando este modo.
 */
export function createServerClient(options?: { timeoutMs?: number }): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  assertSupabaseUrlForProcess(url)
  const timeoutMs = options?.timeoutMs
  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
    ...(timeoutMs ? { global: { fetch: createBoundedFetch({ timeoutMs }) } } : {}),
  })
}

/** Para rutas que responden a un usuario. No usar en crons ni procesos por lotes. */
export function createInteractiveServerClient(timeoutMs: number = INTERACTIVE_SUPABASE_TIMEOUT_MS): SupabaseClient {
  return createServerClient({ timeoutMs })
}
