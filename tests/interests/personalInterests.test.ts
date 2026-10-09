import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { interestBodySchema } from '@/lib/interests/schema';
import { interestIdentity, normalizeInterestDraft } from '@/lib/interests/normalize';
import { matchInterestToOffer, pickDiscoveryOffers, type MatchableOffer } from '@/lib/interests/match';
import {
  canIncludeInterestInDigest,
  claimDeliveryKeys,
  exceptionalInterestAlertsEnabled,
  planExceptionalInterestAlerts,
  selectDigestMatches,
  settleDeliveries,
} from '@/lib/interests/delivery';
import type { NormalizedInterest } from '@/lib/interests/normalize';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const now = new Date('2026-10-09T18:00:00.000Z');

function interest(input: Parameters<typeof normalizeInterestDraft>[0]): NormalizedInterest {
  const normalized = normalizeInterestDraft(input);
  if ('error' in normalized) throw new Error(normalized.error);
  return normalized;
}

function offer(partial: Partial<MatchableOffer> & Pick<MatchableOffer, 'id' | 'title'>): MatchableOffer {
  return { status: 'approved', expiresAt: null, upvotes: 8, rankingBlend: 12, category: 'tecnologia', ...partial };
}

describe('intereses personales', () => {
  it('la migración aísla cada usuario y la API no acepta un user_id ajeno', () => {
    const sql = read('docs/supabase-migrations/20261009_personal_product_interests.sql');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/WITH CHECK \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/REVOKE ALL ON public\.user_product_interests FROM PUBLIC, anon, authenticated/);
    const route = read('app/api/me/interests/route.ts');
    expect(route).toContain('requireBearerMeUser');
    expect(route).toContain("'user_id' in raw");
    expect(route).toContain('insertInterest(supabase, user.id');
    const update = read('app/api/me/interests/[id]/route.ts');
    expect(update).toContain('opened.auth.user.id');
    const store = read('lib/interests/store.ts');
    expect(store).toContain(".eq('user_id', userId)");
  });

  it('rechaza entradas inválidas', () => {
    expect(interestBodySchema.safeParse({ label: 'a' }).success).toBe(false);
    expect(interestBodySchema.safeParse({ label: 'x'.repeat(81) }).success).toBe(false);
    expect(normalizeInterestDraft({ label: 'iPhone', category: 'no-existe' })).toEqual({ error: 'Esa categoría no existe.' });
  });

  it('normaliza duplicados equivalentes', () => {
    const first = interest({ label: 'Café', brand: 'Árabe' });
    const second = interest({ label: '  cafe ', brand: 'arabe' });
    expect(interestIdentity(first)).toBe(interestIdentity(second));
  });

  it('coincide el producto exacto', () => {
    const match = matchInterestToOffer(interest({ label: 'iPhone 15' }), offer({ id: '1', title: 'Apple iPhone 15 128 GB' }), now);
    expect(match?.kind).toBe('exact');
    expect(match?.confidence).toBe('high');
  });

  it('coincide marca y modelo aunque el nombre sea genérico', () => {
    const match = matchInterestToOffer(
      interest({ label: 'Teléfono', brand: 'Apple', model: 'iPhone 15' }),
      offer({ id: '2', title: 'Apple iPhone 15 256 GB' }),
      now,
    );
    expect(match?.kind).toBe('brand_model');
  });

  it('no confunde una funda con el iPhone', () => {
    const match = matchInterestToOffer(
      interest({ label: 'iPhone' }),
      offer({ id: '3', title: 'Funda para iPhone 15' }),
      now,
    );
    expect(match).toBeNull();
  });

  it('no recomienda rechazadas, expiradas ni pendientes', () => {
    const saved = interest({ label: 'Detergente' });
    expect(matchInterestToOffer(saved, offer({ id: '4', title: 'Detergente líquido', status: 'rejected' }), now)).toBeNull();
    expect(matchInterestToOffer(saved, offer({ id: '5', title: 'Detergente líquido', status: 'pending' }), now)).toBeNull();
    expect(matchInterestToOffer(saved, offer({ id: '6', title: 'Detergente líquido', status: 'expired' }), now)).toBeNull();
    expect(
      matchInterestToOffer(
        saved,
        offer({ id: '7', title: 'Detergente líquido', expiresAt: '2020-01-01T00:00:00.000Z' }),
        now,
      ),
    ).toBeNull();
  });

  it('no presenta una coincidencia débil como exacta', () => {
    const weak = matchInterestToOffer(
      interest({ label: 'Promo', category: 'tecnologia' }),
      offer({ id: '8', title: 'Pantalla genérica', upvotes: 1, rankingBlend: 0 }),
      now,
    );
    expect(weak).toBeNull();
    const categoryOnly = matchInterestToOffer(
      interest({ label: 'Cafetera', category: 'tecnologia' }),
      offer({ id: '9', title: 'Monitor 27 pulgadas', category: 'tecnologia', upvotes: 9 }),
      now,
    );
    expect(categoryOnly?.kind).toBe('category');
    expect(categoryOnly?.kind).not.toBe('exact');
  });

  it('descubre ofertas de calidad aunque no haya intereses', () => {
    const found = pickDiscoveryOffers(
      [
        offer({ id: 'low', title: 'Algo nuevo', upvotes: 0, rankingBlend: 0 }),
        offer({ id: 'good', title: 'Audífonos con apoyo', upvotes: 12 }),
      ],
      new Set(),
      now,
    );
    expect(found.map((item) => item.id)).toEqual(['good']);
  });

  it('no reserva dos veces la misma notificación', () => {
    const reserved = new Set<string>();
    const first = claimDeliveryKeys(reserved, ['daily:user:offer:2026-10-09']);
    const second = claimDeliveryKeys(reserved, ['daily:user:offer:2026-10-09']);
    expect(first.claimed).toHaveLength(1);
    expect(second.skipped).toEqual(['daily:user:offer:2026-10-09']);
    expect(second.claimed).toHaveLength(0);
  });

  it('respeta el resumen global y el aviso de cada interés', () => {
    expect(canIncludeInterestInDigest({ digestEnabled: false, interestNotify: true })).toBe(false);
    expect(canIncludeInterestInDigest({ digestEnabled: true, interestNotify: false })).toBe(false);
    expect(canIncludeInterestInDigest({ digestEnabled: true, interestNotify: true })).toBe(true);
    const chosen = selectDigestMatches({
      interests: [interest({ label: 'iPhone', notify: false })],
      offers: [offer({ id: '1', title: 'iPhone 15' })],
      now,
    });
    expect(chosen).toHaveLength(0);
  });

  it('limita las ofertas personales de un correo', () => {
    const offers = Array.from({ length: 8 }, (_, index) =>
      offer({ id: String(index), title: `Café de origen ${index}` }),
    );
    const chosen = selectDigestMatches({
      interests: [interest({ label: 'Café' })],
      offers,
      now,
    });
    expect(chosen.length).toBeLessThanOrEqual(3);
  });

  it('un fallo de correo no bloquea el feed ni la publicación', () => {
    expect(settleDeliveries({ reserved: ['daily:user:offer:2026-10-09'], sent: false }).feedBlocked).toBe(false);
    expect(read('app/api/offers/route.ts')).not.toContain('reserveDigestBatch');
    expect(read('app/api/feed/home/route.ts')).not.toContain('reserveDigestBatch');
    expect(read('app/api/feed/for-you/route.ts')).toContain('[for-you] interests');
  });

  it('la migración cubre las columnas que usa la aplicación', () => {
    const sql = read('docs/supabase-migrations/20261009_personal_product_interests.sql');
    for (const column of ['label_norm', 'brand_norm', 'model_norm', 'alias_norms', 'cadence', 'notify', 'dedupe_key']) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('interest_saved');
    expect(sql).not.toMatch(/REWARDS_PROGRAM_ACTIVE|payout_intents|creator_rewards/i);
  });

  it('la sección declara estados de carga, error y vacío en móvil y escritorio', () => {
    const page = read('app/me/intereses/page.tsx');
    expect(page).toContain('grid-cols-1');
    expect(page).toContain('sm:grid-cols-2');
    expect(page).toContain('Cargando intereses');
    expect(page).toContain('No se pudo cargar tu lista');
    expect(page).toContain('INTERESTS_SECTION.emptyTitle');
    expect(page).toContain('INTERESTS_SECTION.personalHeading');
    expect(page).toContain('INTERESTS_SECTION.discoveryHeading');
    const copy = read('lib/interests/copy.ts');
    expect(copy).toContain('Todavía no hay intereses');
    expect(copy).toContain('Por tus intereses');
    expect(copy).toContain('Para descubrir');
  });

  it('mantiene apagada la alerta inmediata', () => {
    expect(exceptionalInterestAlertsEnabled()).toBe(false);
    expect(planExceptionalInterestAlerts()).toEqual([]);
  });
});
