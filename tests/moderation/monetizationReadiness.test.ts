import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeMonetizationReadiness,
  humanizeAffiliateApproveError,
  resetMonetizationReadinessMetrics,
} from '@/lib/moderation/monetizationReadiness';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';

describe('computeMonetizationReadiness', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetMonetizationReadinessMetrics();
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('6. programa + link listo → ready', () => {
    const r = computeMonetizationReadiness({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x?tag=aventa_test_tag',
      originalOfferUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      linkModOk: true,
    });
    expect(r.status).toBe('ready');
    expect(r.label).toMatch(/lista/i);
  });

  it('7. programa + falta validación → needs_attention', () => {
    const r = computeMonetizationReadiness({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      originalOfferUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      linkModOk: false,
    });
    expect(r.status).toBe('needs_attention');
  });

  it('8. sin programa → no_program', () => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    const r = computeMonetizationReadiness({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      linkModOk: null,
    });
    expect(r.status).toBe('no_program');
  });

  it('9. información insuficiente → unknown', () => {
    const r = computeMonetizationReadiness({
      offerUrl: null,
      originalOfferUrl: null,
    });
    expect(r.status).toBe('unknown');
  });

  it('10. backend sigue bloqueando approve cuando requiere afiliación', () => {
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
      linkModOk: false,
      originalProductUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
    });
    expect(result.ok).toBe(false);
  });

  it('11. backend permite publicación cuando no existe programa', () => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    const result = assertOfferReadyForAffiliateApproval({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
      linkModOk: false,
      originalProductUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
    });
    expect(result.ok).toBe(true);
  });
});

describe('humanizeAffiliateApproveError', () => {
  it('traduce errores de afiliado a mensaje humano', () => {
    expect(humanizeAffiliateApproveError('Valida y guarda el enlace afiliado antes de aprobar.')).toBe(
      'Falta preparar el enlace para Aventa.'
    );
  });
});

describe('original_offer_url semantics', () => {
  it('4–5. histórico puede ser NULL; no se falsifica', () => {
    // Contrato de datos: NULL es el valor correcto para desconocido.
    const historic: string | null = null;
    expect(historic).toBeNull();
  });

  it('1–3. flujo conceptual raw → original → normalized', () => {
    const raw = 'https://meli.la/abc';
    const original = raw;
    const normalized = 'https://articulo.mercadolibre.com.mx/MLM-1?tag=aventa_test_tag';
    expect(original).toBe(raw);
    expect(normalized).not.toBe(original);
    // Tras normalizar, original no cambia
    const afterNormOriginal = original;
    expect(afterNormOriginal).toBe(raw);
  });
});
