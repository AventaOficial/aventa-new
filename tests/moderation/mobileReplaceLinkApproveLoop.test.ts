/**
 * Regresión P0: loop móvil REPLACE LINK → SAVE → READY → APPROVE.
 * Reproduce el contrato completo sin I/O de red.
 *
 * Mercado Libre: el único enlace que deja la oferta lista es el meli.la de la cuenta de Aventa,
 * verificado en servidor y confirmado por moderación (link_mod_ok). Los parámetros tag/matt_*
 * que la plataforma escribe en una URL larga no certifican cuenta.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateAffiliateReadiness,
  shouldPersistLinkModOk,
} from '@/lib/moderation/affiliateReadinessContract';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { MELI_LA_REQUIRED_REASON, validateAffiliatePaste } from '@/lib/affiliate/validateAffiliatePaste';
import { assessOfferAffiliateLink } from '@/lib/affiliate/assessOfferAffiliateLink';

const ML_TAG = 'aventa';
const ML_TOOL = '97583635';
const ML_WORD = 'aventa';

const ORIGINAL =
  'https://www.mercadolibre.com.mx/celular-motorola-edge-60-neo-12256-grisaille/p/MLM61500237?wid=MLM61500237';
const TAGGED = `${ORIGINAL}&tag=${ML_TAG}&matt_word=${ML_WORD}&matt_tool=${ML_TOOL}`;
const MELI_LA = 'https://meli.la/2vWwBNv';

function withMlEnv(run: () => void) {
  const backup = { ...process.env };
  process.env.ML_AFFILIATE_TAG = ML_TAG;
  process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = ML_TAG;
  process.env.ML_MATT_TOOL = ML_TOOL;
  process.env.NEXT_PUBLIC_ML_MATT_TOOL = ML_TOOL;
  process.env.ML_MATT_WORD = ML_WORD;
  process.env.NEXT_PUBLIC_ML_MATT_WORD = ML_WORD;
  try {
    run();
  } finally {
    process.env = backup;
  }
}

describe('mobile replace-link → approve loop regression', () => {
  it('pending con URL larga etiquetada → pegar meli.la → persistir link_mod_ok → approve OK', () => {
    withMlEnv(() => {
      // 1) URL larga con tag/matt_* de plataforma: no está lista y no persiste link_mod_ok.
      const before = evaluateAffiliateReadiness({
        offerUrl: TAGGED,
        originalOfferUrl: ORIGINAL,
        linkModOk: null,
      });
      expect(before.ready).toBe(false);
      expect(
        shouldPersistLinkModOk({ offerUrl: TAGGED, originalOfferUrl: ORIGINAL, linkModOk: false })
      ).toBe(false);
      const longPaste = validateAffiliatePaste(ORIGINAL, TAGGED);
      expect(longPaste.valid).toBe(false);
      expect(longPaste.reason).toBe(MELI_LA_REQUIRED_REASON);

      // 2) meli.la pegado: válido localmente, la cuenta y el producto los verifica el servidor.
      const paste = validateAffiliatePaste(ORIGINAL, MELI_LA);
      expect(paste.valid).toBe(true);
      expect(paste.needsServerVerification).toBe(true);
      expect(paste.normalizedUrl).toBe(MELI_LA);

      // 3) Tras persistir (DB: link_mod_ok=true + meli.la tal cual)
      const after = { offerUrl: MELI_LA, originalOfferUrl: ORIGINAL, linkModOk: true as const };
      expect(evaluateAffiliateReadiness(after).ready).toBe(true);
      expect(computeMonetizationReadiness(after).status).toBe('ready');
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: MELI_LA,
          linkModOk: true,
          originalProductUrl: ORIGINAL,
        }).ok
      ).toBe(true);
    });
  });

  it('link_mod_ok heredado sobre URL larga de ML ya no aprueba', () => {
    withMlEnv(() => {
      const live = assessOfferAffiliateLink(ORIGINAL);
      expect(live.isTagged).toBe(false);
      const contract = evaluateAffiliateReadiness({
        offerUrl: TAGGED,
        originalOfferUrl: ORIGINAL,
        linkModOk: true,
      });
      expect(contract.ready).toBe(false);
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: TAGGED,
          linkModOk: true,
          originalProductUrl: ORIGINAL,
        }).ok
      ).toBe(false);
    });
  });

  it('replace link → refresh mental model: readiness permanece READY', () => {
    withMlEnv(() => {
      const persisted = {
        offerUrl: MELI_LA,
        originalOfferUrl: ORIGINAL,
        linkModOk: true as const,
      };
      const a = evaluateAffiliateReadiness(persisted);
      const b = evaluateAffiliateReadiness(persisted);
      expect(a.ready).toBe(true);
      expect(b.ready).toBe(true);
      expect(a.source).toBe(b.source);
      expect(computeMonetizationReadiness(persisted).status).toBe('ready');
    });
  });

  it('moderate-offer ya no tiene gate competidor post-assert', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8'
    );
    expect(src).toContain('assertOfferReadyForAffiliateApproval');
    expect(src).toContain('readiness.error');
    expect(src).not.toMatch(/validateAffiliatePaste\(/);
    expect(src).not.toMatch(/assessOfferAffiliateLink\(/);
    expect(src).not.toMatch(/live\.needsAffiliate && !live\.isTagged/);
  });

  it('Focus prepareAffiliateLink sincroniza history y confía en link_mod_ok del server', () => {
    const hook = readFileSync(
      join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'),
      'utf8'
    );
    expect(hook).toContain('applyOfferUrlWrite');
    expect(hook).toContain('setHistory');
    expect(hook).toMatch(/data\?\.link_mod_ok === true/);
    expect(hook).not.toMatch(/data\?\.link_mod_ok === true \|\| affiliatePaste/);
    expect(hook).toMatch(
      /offerRequiresAffiliateValidation\(\s*trustedOriginal \|\| offer\.original_offer_url/
    );
  });

  it('meli.la + link_mod_ok: contrato READY (approve no exige paste match offline)', () => {
    withMlEnv(() => {
      const original = 'https://www.mercadolibre.com.mx/pack-x5/p/MLM36799011';
      const paste = validateAffiliatePaste(original, MELI_LA);
      expect(paste.valid).toBe(true);
      expect(paste.needsServerVerification).toBe(true);
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: MELI_LA,
          linkModOk: true,
          originalProductUrl: original,
        }).ok
      ).toBe(true);
    });
  });
});
