import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertIsolatedBaseUrl, assertIsolatedDeployment } from './cases.mjs';

function fixtureIds(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'e2e', '.fixture.json'), 'utf8'));
  } catch {
    return {};
  }
}

const fixture = fixtureIds();

const required = [
  'E2E_BASE_URL',
  'E2E_USER_EMAIL',
  'E2E_USER_PASSWORD',
  'E2E_MOD_EMAIL',
  'E2E_MOD_PASSWORD',
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
] as const;

const missing = required.filter((name) => !process.env[name]);
const skipReason = missing.length
  ? `Faltan secretos: ${missing.join(', ')}`
  : '';

function baseUrl() {
  return assertIsolatedBaseUrl(process.env.E2E_BASE_URL);
}

async function assertTarget(request: APIRequestContext) {
  const res = await request.get(new URL('/api/health/distribution-env', baseUrl()).toString());
  expect(res.status()).toBe(200);
  assertIsolatedDeployment(await res.json());
}

async function tokenFor(email: string, password: string) {
  const url = assertIsolatedBaseUrl(process.env.E2E_SUPABASE_URL);
  assertIsolatedDeployment({ health: { resolved_supabase_ref: url.hostname.split('.')[0] } });
  const res = await fetch(new URL('/auth/v1/token?grant_type=password', url), {
    method: 'POST',
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || typeof body.access_token !== 'string') {
    throw new Error('No se pudo iniciar sesión de prueba');
  }
  return body.access_token as string;
}

async function monthOfferId(request: APIRequestContext) {
  const res = await request.get(
    new URL('/api/feed/home?limit=5&view=top&period=month', baseUrl()).toString(),
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const row = (body?.data ?? []).find((item: { id?: string; title?: string }) => {
    const title = item.title ?? '';
    return item.id && !title.startsWith('qa-e2e') && item.id !== fixture.E2E_APPROVED_OFFER_ID && item.id !== fixture.E2E_PUBLISHED_OFFER_ID;
  });
  const id = row?.id;
  expect(typeof id).toBe('string');
  return id as string;
}

async function openHome(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('guestOnboardingDismissed', 'true');
  });
  await page.goto('/');
  const cookies = page.getByRole('button', { name: 'Entendido' });
  if (await cookies.isVisible().catch(() => false)) await cookies.click();
}

async function signIn(page: Page, email: string, password: string) {
  await openHome(page);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByRole('button', { name: '¿Ya tienes cuenta? Iniciar sesión' }).click();
  await page.getByPlaceholder('Email').last().fill(email);
  await page.getByPlaceholder('Contraseña').last().fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear cuenta', exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ request }) => {
  test.skip(Boolean(skipReason), skipReason);
  await assertTarget(request);
});

test('discover-offers', async ({ page }) => {
  await openHome(page);
  const openOffer = page
    .getByRole('button', { name: 'Ver oferta', exact: true })
    .or(page.locator('article').filter({ hasText: 'Ver oferta' }));
  await page.locator('button:visible', { hasText: /^Top$/ }).click();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  try {
    await expect(openOffer.first()).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload();
    await page.locator('button:visible', { hasText: /^Top$/ }).click();
    await page.getByRole('button', { name: 'Mes', exact: true }).click();
    await expect(openOffer.first()).toBeVisible();
  }
  await openOffer.first().click();
  await expect(page).toHaveURL(/\/oferta\//);
});

test('open-offer', async ({ page, request }) => {
  const id = await monthOfferId(request);
  const response = await page.goto(`/oferta/${id}`);
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`/oferta/.*${id}$`));
});

test('publish-pending', async ({ request }) => {
  const token = await tokenFor(process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  const payload = () => ({
    title: `qa-e2e ${Date.now()}`,
    store: 'Mercado Libre',
    price: 100,
    original_price: 150,
    hasDiscount: true,
    description: 'Oferta sintetica de prueba qa-e2e para validar que queda pending.',
    offer_url: `https://www.mercadolibre.com.mx/qa-e2e-${Date.now()}`,
  });
  const post = () => request.post(new URL('/api/offers', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: payload(),
  });
  let res = await post();
  if (res.status() === 429) {
    const retry = await res.json();
    const seconds = Math.min(30, Number(retry.remainingSeconds ?? 5) + 1);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    res = await post();
  }
  const raw = await res.text();
  expect(res.status(), raw).toBe(200);
  const body = JSON.parse(raw);
  expect(body.status).toBe('pending');
});

test('vote', async ({ request }) => {
  const token = await tokenFor(process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  const offerId = await monthOfferId(request);
  const res = await request.post(new URL('/api/votes', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: { offerId, direction: 'up' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
});

test('comment', async ({ request }) => {
  const token = await tokenFor(process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  const offerId = await monthOfferId(request);
  const res = await request.post(new URL(`/api/offers/${offerId}/comments`, baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: { content: 'qa-e2e comentario sintetico' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
});

test('favorite', async ({ request }) => {
  const offerId = await monthOfferId(request);
  const supabase = createClient(process.env.E2E_SUPABASE_URL ?? '', process.env.E2E_SUPABASE_ANON_KEY ?? '');
  const auth = await supabase.auth.signInWithPassword({
    email: process.env.E2E_USER_EMAIL ?? '',
    password: process.env.E2E_USER_PASSWORD ?? '',
  });
  expect(auth.error).toBeNull();
  const inserted = await supabase.from('offer_favorites').insert({
    offer_id: offerId,
    user_id: auth.data.user?.id,
  });
  expect(inserted.error == null || inserted.error.code === '23505').toBeTruthy();
});

test('takedown-approved', async ({ request }) => {
  const approvedId = process.env.E2E_APPROVED_OFFER_ID || fixture.E2E_APPROVED_OFFER_ID;
  test.skip(!approvedId, 'Falta E2E_APPROVED_OFFER_ID sintética en staging');
  const token = await tokenFor(process.env.E2E_MOD_EMAIL ?? '', process.env.E2E_MOD_PASSWORD ?? '');
  const res = await request.post(new URL('/api/admin/moderate-offer', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      id: approvedId,
      status: 'rejected',
      reason: 'qa-e2e retiro approved',
      surface: 'feed',
    },
  });
  expect(res.ok()).toBeTruthy();
});

test('takedown-published', async ({ request }) => {
  const publishedId = process.env.E2E_PUBLISHED_OFFER_ID || fixture.E2E_PUBLISHED_OFFER_ID;
  test.skip(!publishedId, 'Falta E2E_PUBLISHED_OFFER_ID sintética en staging');
  const token = await tokenFor(process.env.E2E_MOD_EMAIL ?? '', process.env.E2E_MOD_PASSWORD ?? '');
  const res = await request.post(new URL('/api/admin/moderate-offer', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      id: publishedId,
      status: 'rejected',
      reason: 'qa-e2e retiro published',
      surface: 'feed',
    },
  });
  expect(res.ok()).toBeTruthy();
});

async function feedIds(request: APIRequestContext) {
  const ids: string[] = [];
  let cursor = '';
  for (let page = 0; page < 8; page += 1) {
    const path = `/api/feed/home?limit=20&view=top&period=month${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await request.get(new URL(path, baseUrl()).toString());
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    ids.push(...(body.data ?? []).map((row: { id?: string }) => row.id).filter(Boolean));
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return ids;
}

test('second-client', async ({ browser, request }) => {
  const id = process.env.E2E_APPROVED_OFFER_ID || fixture.E2E_APPROVED_OFFER_ID;
  test.skip(!id, 'Falta la oferta retirada para el segundo cliente');
  const context = await browser.newContext();
  const page = await context.newPage();
  expect(await feedIds(request)).not.toContain(id);
  await page.goto(`/oferta/${id}`);
  await context.close();
});

test('refresh-and-pagination', async ({ page, request }) => {
  const id = process.env.E2E_APPROVED_OFFER_ID || fixture.E2E_APPROVED_OFFER_ID;
  test.skip(!id, 'Falta la oferta retirada para el refresco');
  await page.goto('/');
  await page.reload();
  expect(await feedIds(request)).not.toContain(id);
});

test('moderation-forbidden', async ({ request }) => {
  const token = await tokenFor(process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  const offerId = await monthOfferId(request);
  const res = await request.post(new URL('/api/admin/moderate-offer', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    data: { id: offerId, status: 'rejected', reason: 'qa-e2e no autorizado', surface: 'feed' },
  });
  expect([401, 403]).toContain(res.status());
  expect(await feedIds(request)).toContain(offerId);
});

test('paused-rewards', async ({ page }) => {
  await signIn(page, process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  await page.goto('/me/recompensas');
  await expect(page.getByText('Las recompensas monetarias y los pagos no están disponibles.')).toBeVisible();
});

test('no-money-movement', async ({ request }) => {
  test.skip(!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, 'Falta E2E_SUPABASE_SERVICE_ROLE_KEY para leer el ledger de prueba');
  const url = assertIsolatedBaseUrl(process.env.E2E_SUPABASE_URL);
  const admin = createClient(url.toString(), process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  const userToken = await tokenFor(process.env.E2E_USER_EMAIL ?? '', process.env.E2E_USER_PASSWORD ?? '');
  const who = await fetch(new URL('/auth/v1/user', url), {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${userToken}` },
  });
  const user = await who.json();
  const before = await admin.from('creator_rewards').select('id', { count: 'exact', head: true }).eq('creator_id', user.id);
  const offerId = await monthOfferId(request);
  await request.post(new URL('/api/votes', baseUrl()).toString(), {
    headers: { Authorization: `Bearer ${userToken}` },
    data: { offerId, direction: 'up' },
  });
  const after = await admin.from('creator_rewards').select('id', { count: 'exact', head: true }).eq('creator_id', user.id);
  expect(after.count ?? 0).toBe(before.count ?? 0);
});
