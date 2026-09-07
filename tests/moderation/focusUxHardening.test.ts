import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  focusOriginalProductUrlForRequest,
  originalOfferUrlToPersistOnAffiliatePaste,
} from '@/lib/moderation/originalOfferUrlPolicy';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { humanizeAffiliateApproveError } from '@/lib/moderation/monetizationReadiness';

describe('Focus layout — fixed action bar', () => {
  const ws = readFileSync(
    join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
    'utf8'
  );

  it('barra de acciones fija con safe-area', () => {
    expect(ws).toMatch(/data-focus-actions-bar/);
    expect(ws).toMatch(/fixed inset-x-0 bottom-0/);
    expect(ws).toMatch(/safe-area-inset-bottom/);
    expect(ws).not.toMatch(/md:static/);
  });

  it('padding inferior suficiente para no tapar contenido', () => {
    expect(ws).toMatch(/pb-\[calc\(8\.5rem\+env\(safe-area-inset-bottom/);
    expect(ws).toMatch(/pb-\[calc\(14rem\+env\(safe-area-inset-bottom/);
  });

  it('CTA preparar enlace + panel presentes', () => {
    expect(ws).toMatch(/FocusAffiliatePrepare/);
    expect(ws).toMatch(/prepareAffiliateLink/);
    const stage = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusOfferStage.tsx'),
      'utf8'
    );
    expect(stage).toMatch(/Preparar enlace/);
    expect(stage).toMatch(/Monetización/);
  });
});

describe('prepareAffiliateLink / original policy', () => {
  it('no inventa original desde offer_url operativo', () => {
    expect(
      originalOfferUrlToPersistOnAffiliatePaste({
        existingOriginal: null,
        bodyOriginalProductUrl: undefined,
      })
    ).toBeNull();
    expect(
      focusOriginalProductUrlForRequest({
        originalOfferUrl: null,
        refOriginal: null,
      })
    ).toBeUndefined();
  });

  it('hook prepare usa affiliate_paste sin fallback offer_url→original', () => {
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    expect(hook).toMatch(/prepareAffiliateLink/);
    expect(hook).toMatch(/affiliate_paste:\s*true/);
    expect(hook).not.toMatch(
      /original_product_url:\s*[^\n]*\?\?\s*offer\.offer_url/
    );
  });

  it('400 humanizado abre ruta de preparación', () => {
    expect(humanizeAffiliateApproveError('Valida y guarda el enlace afiliado')).toBe(
      'Falta preparar el enlace para Aventa.'
    );
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    expect(hook).toMatch(/Falta preparar el enlace para Aventa/);
    expect(hook).toMatch(/setNeedsAffiliateConfirm\(true\)/);
  });
});

describe('affiliate gate authority', () => {
  const envBackup = { ...process.env };

  it('bloquea approve sin link_mod_ok', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
    const r = assertOfferReadyForAffiliateApproval({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
      linkModOk: false,
    });
    expect(r.ok).toBe(false);
    process.env = { ...envBackup };
  });

  it('permite approve con link_mod_ok', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test_tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa_test_tag';
    const r = assertOfferReadyForAffiliateApproval({
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1?tag=aventa_test_tag',
      linkModOk: true,
    });
    expect(r.ok).toBe(true);
    process.env = { ...envBackup };
  });
});
