import { createClient } from "@supabase/supabase-js";
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from("mercadolibre_oauth_tokens").select("provider,expires_at,updated_at").limit(3);
  console.log(JSON.stringify({ error, rows: data }, null, 2));
  const probe = await fetch("https://api.mercadolibre.com/sites/MLM/search?q=perfume&limit=1", { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  console.log("anon_search", probe.status);
}
main();
