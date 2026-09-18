import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatMsiCardLabel,
  isValidMsiMonths,
  parseOfferEditMsiMonths,
} from '@/lib/offers/msiDisplay';
import { buildHumanVerdict } from '@/lib/moderation/humanVerdict';
import { parseOfferEditMoney, isMaterialOfferEdit } from '@/lib/moderation/offerEditContract';
import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';
import { DEAL_INTELLIGENCE_ECONOMY_BOUNDARY } from '@/lib/dealIntelligence/constants';

describe('msiDisplay', () => {
  it('null/0/invalid → no label', () => {
    expect(formatMsiCardLabel(null)).toBeNull();
    expect(formatMsiCardLabel(undefined)).toBeNull();
    expect(formatMsiCardLabel(0)).toBeNull();
    expect(formatMsiCardLabel(25)).toBeNull();
    expect(formatMsiCardLabel(12.5)).toBeNull();
    expect(isValidMsiMonths(0)).toBe(false);
  });

  it('valid → Hasta N MSI', () => {
    expect(formatMsiCardLabel(12)).toBe('Hasta 12 MSI');
    expect(isValidMsiMonths(3)).toBe(true);
  });

  it('parseOfferEditMsiMonths validates range', () => {
    expect(parseOfferEditMsiMonths(null)).toEqual({ ok: true, value: null });
    expect(parseOfferEditMsiMonths('')).toEqual({ ok: true, value: null });
    expect(parseOfferEditMsiMonths(12)).toEqual({ ok: true, value: 12 });
    expect(parseOfferEditMsiMonths(99).ok).toBe(false);
    expect(parseOfferEditMsiMonths('abc').ok).toBe(false);
  });
});

describe('OfferCard MSI + CTA contracts', () => {
  const card = readFileSync(join(process.cwd(), 'app/components/OfferCard.tsx'), 'utf8');
  const modal = readFileSync(join(process.cwd(), 'app/components/OfferModal.tsx'), 'utf8');
  const detail = readFileSync(
    join(process.cwd(), 'app/oferta/[id]/OfferPageContent.tsx'),
    'utf8',
  );

  it('OfferCard renders msiLabel helper', () => {
    expect(card).toContain('formatMsiCardLabel');
    expect(card).toContain('msiLabel');
    expect(card).toContain('msiMonths');
  });

  it('merchant CTA is Cazar oferta and keeps trackAndOpenOfferUrl', () => {
    expect(modal).toContain('Cazar oferta');
    expect(modal).not.toContain('Ver si sigue disponible');
    expect(modal).toContain('trackAndOpenOfferUrl');
    expect(detail).toContain('Cazar oferta');
    expect(detail).not.toContain('Ver si sigue disponible');
    expect(detail).toContain('trackAndOpenOfferUrl');
  });
});

describe('update-offer MSI surface', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/api/admin/update-offer/route.ts'),
    'utf8',
  );

  it('acepta msi_months vía parseOfferEditMsiMonths', () => {
    expect(src).toContain('parseOfferEditMsiMonths');
    expect(src).toContain('msi_months');
    expect(src).toContain("action: 'edited'");
  });

  it('msi no es material demote', () => {
    expect(isMaterialOfferEdit(['msi_months'])).toBe(false);
    expect(isMaterialOfferEdit(['price'])).toBe(true);
  });
});

describe('ModerationFixSheet mobile-first', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/components/ModerationFixSheet.tsx'),
    'utf8',
  );

  it('tiene dirty, double-submit lock, MSI y sticky Guardar', () => {
    expect(src).toContain('dirty');
    expect(src).toContain('saveLockRef');
    expect(src).toContain('msi_months');
    expect(src).toMatch(/Precio (actual|detectado|publicado)/);
    expect(src).toContain('Guardar');
    expect(src).toContain('Cancelar');
    expect(src).not.toMatch(/\bautosave\b/i);
  });
});

describe('humanVerdict insufficient ≠ bad deal', () => {
  it('sin historial / sin ahorro verificable → evidencia insuficiente', () => {
    const v = buildHumanVerdict({
      price: 1000,
      original_price: 1200,
      image_url: 'https://x/y.jpg',
      category: 'tecnologia',
      risk_score: 5,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=40 (moderación)',
      bot_meta: {
        signals: {
          historyReady: false,
          effectiveDiscountPercent: null,
          suspectedArtificialListPrice: false,
        },
      },
    });
    expect(v.headline.toLowerCase()).toMatch(/evidencia insuficiente/);
    expect(v.headline).not.toMatch(/No parece una oferta suficientemente buena/);
    expect(v.detail.toLowerCase()).toMatch(/historial|ahorro/);
    expect(v.tone).toBe('caution');
  });

  it('sin foto sigue siendo defecto básico', () => {
    const v = buildHumanVerdict({
      price: 100,
      original_price: 200,
      image_url: null,
      category: 'tecnologia',
      risk_score: 10,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=85 (moderación)',
    });
    expect(v.detail.toLowerCase()).toMatch(/foto/);
    expect(v.tone).toBe('poor');
  });
});

describe('P0.3a money/supply safety', () => {
  it('boundaries untouched', () => {
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    expect(DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.settlementEnabled).toBe(false);
    expect(parseOfferEditMoney('10').ok).toBe(true);
    const write = (process.env.SUPPLY_ENGINE_WRITE ?? '').trim();
    expect(write === '1' || write === 'true').toBe(false);
  });
});
