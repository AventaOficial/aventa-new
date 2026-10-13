import { describe, expect, it } from 'vitest';
import type { MeliLaPasteVerification } from '@/lib/affiliate/verifyMeliLaPaste';
import {
  isMeliLaPasteVerification,
  summarizeAffiliateVerification,
} from '@/lib/moderation/affiliateVerificationUi';

const base: MeliLaPasteVerification = {
  status: 'verified',
  reason: null,
  accountVerified: true,
  productVerified: true,
  affiliateWord: 'aventa',
  affiliateTool: '97583635',
  destinationUrl: 'https://www.mercadolibre.com.mx/social/x?matt_tool=97583635',
};

describe('summarizeAffiliateVerification', () => {
  it('verificado: cuenta de Aventa y producto coinciden, sin confirmación manual', () => {
    const s = summarizeAffiliateVerification(base);
    expect(s.tone).toBe('ok');
    expect(s.headline).toBe('Verificado automáticamente');
    expect(s.requiresManualConfirmation).toBe(false);
    expect(s.lines.map((l) => l.value).join(' ')).toContain('Aventa');
  });

  it('revisión manual: nunca dice verificado y exige confirmación', () => {
    const s = summarizeAffiliateVerification({
      ...base,
      status: 'needs_manual_review',
      reason: 'Mercado Libre no dejó leer la página',
      productVerified: false,
    });
    expect(s.tone).toBe('warn');
    expect(s.headline).not.toMatch(/verificado/i);
    expect(s.headline).toContain('Mercado Libre no dejó leer la página');
    expect(s.requiresManualConfirmation).toBe(true);
    expect(s.lines.find((l) => l.label === 'Producto')?.tone).toBe('warn');
  });

  it('sin acceso al enlace: cuenta y producto quedan sin comprobar', () => {
    const s = summarizeAffiliateVerification({
      ...base,
      status: 'needs_manual_review',
      reason: 'No se pudo abrir el enlace',
      accountVerified: false,
      productVerified: false,
      affiliateWord: null,
      affiliateTool: null,
      destinationUrl: null,
    });
    expect(s.lines.every((l) => l.tone === 'warn')).toBe(true);
  });

  it('otra cuenta: rechazo con la cuenta visible', () => {
    const s = summarizeAffiliateVerification({
      ...base,
      status: 'rejected',
      reason: 'Este meli.la es de otra cuenta de afiliado (otro)',
      accountVerified: false,
      productVerified: false,
      affiliateWord: 'otro',
      affiliateTool: '12345678',
    });
    expect(s.tone).toBe('bad');
    const account = s.lines.find((l) => l.label === 'Cuenta afiliada');
    expect(account?.tone).toBe('bad');
    expect(account?.value).toContain('12345678');
  });

  it('otro producto con la cuenta correcta', () => {
    const s = summarizeAffiliateVerification({
      ...base,
      status: 'rejected',
      reason: 'El meli.la muestra otro producto',
      productVerified: false,
    });
    expect(s.lines.find((l) => l.label === 'Producto')?.tone).toBe('bad');
    expect(s.lines.find((l) => l.label === 'Cuenta afiliada')?.tone).toBe('ok');
  });
});

describe('isMeliLaPasteVerification', () => {
  it('acepta el contrato del servidor y rechaza formas viejas', () => {
    expect(isMeliLaPasteVerification(base)).toBe(true);
    expect(isMeliLaPasteVerification({ status: 'unverified', reason: 'x' })).toBe(false);
    expect(isMeliLaPasteVerification(null)).toBe(false);
  });
});
