/**
 * Antes de cualquier escritura: el sitio bajo prueba y la Supabase de setup deben ser staging.
 * Imprime solo los refs de Supabase; ni URLs ni credenciales.
 */
import { assertIsolatedBaseUrl, assertIsolatedDeployment } from '../e2e/cases.mjs';

const base = assertIsolatedBaseUrl(process.env.E2E_BASE_URL);
const supabase = assertIsolatedBaseUrl(process.env.E2E_SUPABASE_URL);
const setupRef = assertIsolatedDeployment({ health: { resolved_supabase_ref: supabase.hostname.split('.')[0] } });

const res = await fetch(new URL('/api/health/distribution-env', base), { redirect: 'error' });
if (res.status !== 200) throw new Error(`e2e refused: health ${res.status}`);
const targetRef = assertIsolatedDeployment(await res.json());

console.log(JSON.stringify({ target_supabase_ref: targetRef, setup_supabase_ref: setupRef }));
