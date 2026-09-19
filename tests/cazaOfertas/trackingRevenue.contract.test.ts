/**
 * CazaOfertasss — FASE 0. Contratos de identidad de tracking y ledger de
 * ingresos de afiliación.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_PUBLICATION_METRICS,
  affiliateRevenueIdempotencyKey,
  assertAventaMoneyPathUntouched,
  buildAffiliateRevenueEvent,
  buildPublicationRecord,
  createInMemoryAffiliateRevenueLedger,
  createInMemoryDealPublicationRepository,
  markPublicationPublished,
  publicationIdentityKey,
  type BuildAffiliateRevenueEventInput,
} from '@/lib/cazaOfertas';

import { NOW_ISO, publicationInputWithSnapshot } from './fixtures';

/** Input coherente con snapshot; dealId viene del candidato sintético. */
const BASE_PUBLICATION = publicationInputWithSnapshot({
  trackingLabel: 'caza_0f1e2d3c_20260919',
  telegramChannel: '@cazaofertasss',
});

const FIXED_IDENTITY = {
  dealId: 'caza_amazon_mx_abcd1234',
  affiliateNetwork: 'amazon_associates_mx' as const,
  telegramChannel: '@cazaofertasss',
  trackingLabel: 'caza_0f1e2d3c_20260919',
};

describe('identidad de tracking', () => {
  it('es determinista y compuesta por deal + red + canal + label', () => {
    const key = publicationIdentityKey(FIXED_IDENTITY);
    expect(key).toBe(
      'caza_amazon_mx_abcd1234|amazon_associates_mx|@cazaofertasss|caza_0f1e2d3c_20260919'
    );
    expect(publicationIdentityKey(FIXED_IDENTITY)).toBe(key);
  });

  it('cambia si cambia cualquiera de sus componentes', () => {
    const base = publicationIdentityKey(FIXED_IDENTITY);
    expect(publicationIdentityKey({ ...FIXED_IDENTITY, telegramChannel: '@otro_canal' })).not.toBe(
      base
    );
    expect(
      publicationIdentityKey({ ...FIXED_IDENTITY, trackingLabel: 'caza_ffffffff_20260920' })
    ).not.toBe(base);
  });
});

describe('buildPublicationRecord', () => {
  it('nace PREPARED, sin messageId, sin publishedAt y sin métricas inventadas', () => {
    const r = buildPublicationRecord(BASE_PUBLICATION);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('PREPARED');
    expect(r.value.telegramMessageId).toBeNull();
    expect(r.value.publishedAt).toBeNull();
    expect(r.value.metrics).toEqual(EMPTY_PUBLICATION_METRICS);
  });

  it('las métricas ausentes son null, nunca 0', () => {
    for (const [field, value] of Object.entries(EMPTY_PUBLICATION_METRICS)) {
      expect(value, `métrica ${field}`).toBeNull();
    }
  });

  it('rechaza dealId, tracking label, canal y fecha inválidos', () => {
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, dealId: 'offer-123' }).ok).toBe(false);
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, trackingLabel: 'NOPE' }).ok).toBe(false);
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, telegramChannel: 'cazaofertasss' }).ok).toBe(
      false
    );
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, telegramChannel: 'https://t.me/x' }).ok).toBe(
      false
    );
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, preparedAt: 'hoy' }).ok).toBe(false);
  });

  it('rechaza affiliateUrl o publishedRevision inválidos', () => {
    expect(
      buildPublicationRecord({ ...BASE_PUBLICATION, affiliateUrl: 'http://insecure.example' }).ok
    ).toBe(false);
    expect(buildPublicationRecord({ ...BASE_PUBLICATION, publishedRevision: 0 }).ok).toBe(false);
  });
});

describe('markPublicationPublished', () => {
  it('PREPARED → PUBLISHED con messageId válido', () => {
    const prepared = buildPublicationRecord(BASE_PUBLICATION);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const published = markPublicationPublished(prepared.value, '4242', NOW_ISO);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.status).toBe('PUBLISHED');
    expect(published.value.telegramMessageId).toBe('4242');
    expect(published.value.publishedAt).toBe(NOW_ISO);
  });

  it('rechaza transición doble y messageId inválido', () => {
    const prepared = buildPublicationRecord(BASE_PUBLICATION);
    if (!prepared.ok) throw new Error('fixture inválido');
    const published = markPublicationPublished(prepared.value, '4242', NOW_ISO);
    if (!published.ok) throw new Error('fixture inválido');

    expect(markPublicationPublished(published.value, '4243', NOW_ISO).ok).toBe(false);
    expect(markPublicationPublished(prepared.value, 'abc', NOW_ISO).ok).toBe(false);
  });

  it('el repositorio recupera por identidad, no por scan', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const prepared = buildPublicationRecord(BASE_PUBLICATION);
    if (!prepared.ok) throw new Error('fixture inválido');
    await repo.save(prepared.value);

    const found = await repo.findByIdentityKey(publicationIdentityKey(BASE_PUBLICATION));
    expect(found?.dealId).toBe(BASE_PUBLICATION.dealId);
    expect(await repo.findByIdentityKey('inexistente')).toBeNull();
  });
});

describe('AffiliateRevenueEvent', () => {
  function input(
    overrides: Partial<BuildAffiliateRevenueEventInput> = {}
  ): BuildAffiliateRevenueEventInput {
    return {
      network: 'amazon_associates_mx',
      externalReference: 'ORDER-9988776655',
      dealId: 'caza_amazon_mx_abcd1234',
      trackingLabel: 'caza_0f1e2d3c_20260919',
      eventType: 'COMMISSION',
      amountValue: 120.5,
      currency: 'MXN',
      occurredAt: NOW_ISO,
      status: 'PENDING',
      recordedAt: NOW_ISO,
      ...overrides,
    };
  }

  it('la clave de idempotencia es red + tipo + referencia externa', () => {
    expect(
      affiliateRevenueIdempotencyKey({
        network: 'amazon_associates_mx',
        externalReference: 'ORDER-1',
        eventType: 'COMMISSION',
      })
    ).toBe('amazon_associates_mx:COMMISSION:ORDER-1');
  });

  it('acepta los cinco tipos de evento con su forma correcta', () => {
    const click = buildAffiliateRevenueEvent(
      input({ eventType: 'CLICK', amountValue: null, currency: null, status: 'CONFIRMED' })
    );
    expect(click.ok).toBe(true);
    if (click.ok) expect(click.value.amount).toBeNull();

    expect(buildAffiliateRevenueEvent(input({ eventType: 'ORDER', status: 'PENDING' })).ok).toBe(true);
    expect(
      buildAffiliateRevenueEvent(input({ eventType: 'APPROVED_ORDER', status: 'CONFIRMED' })).ok
    ).toBe(true);
    expect(buildAffiliateRevenueEvent(input({ eventType: 'COMMISSION' })).ok).toBe(true);
    expect(
      buildAffiliateRevenueEvent(
        input({ eventType: 'REVERSAL', status: 'REVERSED', reversesEventId: 'prev-1' })
      ).ok
    ).toBe(true);
  });

  it('un CLICK no puede portar monto', () => {
    const r = buildAffiliateRevenueEvent(
      input({ eventType: 'CLICK', status: 'CONFIRMED', amountValue: 10 })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('revenue.amount_not_allowed_for_type:CLICK');
  });

  it('una COMMISSION exige monto', () => {
    const r = buildAffiliateRevenueEvent(input({ amountValue: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('revenue.amount_required_for_type:COMMISSION');
  });

  it('un REVERSAL exige el evento que revierte', () => {
    const r = buildAffiliateRevenueEvent(input({ eventType: 'REVERSAL', status: 'REVERSED' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('revenue.reversal_requires_reverses_event_id');
  });

  it('rechaza status incoherente con el tipo', () => {
    const r = buildAffiliateRevenueEvent(input({ eventType: 'APPROVED_ORDER', status: 'PENDING' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('revenue.status_invalid_for_type:APPROVED_ORDER/PENDING');
  });

  it('rechaza montos negativos, cero y moneda no soportada', () => {
    expect(buildAffiliateRevenueEvent(input({ amountValue: -5 })).ok).toBe(false);
    expect(buildAffiliateRevenueEvent(input({ amountValue: 0 })).ok).toBe(false);
    expect(buildAffiliateRevenueEvent(input({ currency: 'USD' })).ok).toBe(false);
  });

  it('rechaza referencia externa y fechas malformadas', () => {
    expect(buildAffiliateRevenueEvent(input({ externalReference: 'x' })).ok).toBe(false);
    expect(buildAffiliateRevenueEvent(input({ externalReference: 'ORDER 1;DROP' })).ok).toBe(false);
    expect(buildAffiliateRevenueEvent(input({ occurredAt: 'ayer' })).ok).toBe(false);
    expect(buildAffiliateRevenueEvent(input({ trackingLabel: 'NO-VALE' })).ok).toBe(false);
  });

  it('el ledger es idempotente por eventId', async () => {
    const ledger = createInMemoryAffiliateRevenueLedger();
    const event = buildAffiliateRevenueEvent(input());
    if (!event.ok) throw new Error('fixture inválido');

    expect(await ledger.append(event.value)).toEqual({ appended: true, duplicate: false });
    expect(await ledger.append(event.value)).toEqual({ appended: false, duplicate: true });

    const found = await ledger.findByEventId(event.value.eventId);
    expect(found?.amount).toEqual({ value: 120.5, currency: 'MXN' });
    expect(await ledger.listByDealId('caza_amazon_mx_abcd1234', 10)).toHaveLength(1);
  });

  it('el ledger no toca el money path de Aventa', () => {
    expect(() => assertAventaMoneyPathUntouched()).not.toThrow();
  });
});
