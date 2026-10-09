/**
 * Crea o reutiliza cuentas sintéticas y dos ofertas públicas solo en staging.
 * No imprime secretos. Rechaza el ref de producción.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { assertIsolatedBaseUrl, assertIsolatedDeployment } from '../e2e/cases.mjs';

const url = assertIsolatedBaseUrl(process.env.E2E_SUPABASE_URL);
assertIsolatedDeployment({ health: { resolved_supabase_ref: url.hostname.split('.')[0] } });
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!key) throw new Error('e2e provision refused: missing service role');

const admin = createClient(url.toString(), key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = process.env.E2E_USER_PASSWORD;
const modPassword = process.env.E2E_MOD_PASSWORD;
if (!password || !modPassword) throw new Error('e2e provision refused: missing passwords');

async function findUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const user = listed.data?.users?.find((row) => row.email === email);
    if (user) return user;
    if ((listed.data?.users?.length ?? 0) < 200) return null;
  }
  return null;
}

async function ensureUser(email, userPassword, role) {
  const created = await admin.auth.admin.createUser({
    email,
    password: userPassword,
    email_confirm: true,
  });
  const user = created.data.user ?? await findUser(email);
  if (!user) throw new Error('e2e provision failed: user');
  if (!created.data.user) {
    const updated = await admin.auth.admin.updateUserById(user.id, { password: userPassword, email_confirm: true });
    if (updated.error) throw new Error('e2e provision failed: password');
  }
  const profile = await admin.from('profiles').upsert({
    id: user.id,
    onboarding_completed: true,
    terms_accepted_at: new Date().toISOString(),
    privacy_accepted_at: new Date().toISOString(),
    legal_consent_version: '2026-08-30',
  }, { onConflict: 'id' });
  if (profile.error) throw new Error('e2e provision failed: profile');
  if (role) {
    const existing = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', role).maybeSingle();
    if (!existing.data) {
      const inserted = await admin.from('user_roles').insert({ user_id: user.id, role });
      if (inserted.error) throw new Error('e2e provision failed: moderator role');
    }
  }
  return { id: user.id, fresh: Boolean(created.data.user) };
}

async function ensureOffer(createdBy, status) {
  const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const inserted = await admin.from('offers').insert({
    title: `qa-e2e ${status} ${stamp}`,
    price: 100,
    original_price: 150,
    image_url: 'https://example.com/qa-e2e.png',
    store: 'Mercado Libre',
    status,
    offer_url: `https://www.mercadolibre.com.mx/qa-e2e-${status}-${stamp}`,
    created_by: createdBy,
  }).select('id').single();
  if (inserted.error || !inserted.data?.id) throw new Error(`e2e provision failed: ${status} offer`);
  return inserted.data.id;
}

const userEmail = process.env.E2E_USER_EMAIL ?? 'qa-e2e-user@aventa.test';
const modEmail = process.env.E2E_MOD_EMAIL ?? 'qa-e2e-moderator@aventa.test';
const user = await ensureUser(userEmail, password, null);
const moderator = await ensureUser(modEmail, modPassword, 'moderator');
const approvedId = await ensureOffer(user.id, 'approved');
const publishedId = await ensureOffer(user.id, 'published');
const fresh = user.fresh || moderator.fresh;

writeFileSync(new URL('../e2e/.fixture.json', import.meta.url), JSON.stringify({
  E2E_APPROVED_OFFER_ID: approvedId,
  E2E_PUBLISHED_OFFER_ID: publishedId,
}));

if (fresh && process.env.E2E_SKIP_AGE_WAIT !== '1') {
  await new Promise((resolve) => setTimeout(resolve, 125_000));
}

console.log(JSON.stringify({
  provisioned: true,
  project: url.hostname.split('.')[0],
  fresh,
  users: [userEmail, modEmail],
  offers: { approved: approvedId, published: publishedId },
}));
