import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase con service_role. Solo para uso en servidor (API routes, server actions).
 * No exponer en el cliente.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}
