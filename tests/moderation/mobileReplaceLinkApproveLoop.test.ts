/**
 * Regresión P0: loop móvil REPLACE LINK → SAVE → READY → APPROVE.
 * Reproduce el contrato completo sin I/O de red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateAffiliateReadiness,
  shouldPersistLinkModOk,
} from '@/lib/moderation/affiliateReadinessContract';
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { validateAffiliatePaste } from '@/lib/affiliate/validateAffiliatePaste';
import { assessOfferAffiliateLink } from '@/lib/affiliate/assessOfferAffiliateLink';

const ML_TAG = 'aventa';
const ML_TOOL = '97583635';
const ML_WORD = 'aventa';

const ORIGINAL =
  'https://www.mercadolibre.com.mx/celular-motorola-edge-60-neo-12256-grisaille/p/MLM61500237?wid=MLM61500237';
const TAGGED = `${ORIGINAL}&tag=${ML_TAG}&matt_word=${ML_WORD}&matt_tool=${ML_TOOL}`;

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
  afterEach(() => {
    // no-op: withMlEnv restores
  });

  it('pending tagged + link_mod_ok null → prepare persiste READY → approve OK', () => {
    withMlEnv(() => {
      // 1) Estado inicial (pre-backfill / pre-save): tagged pero flag null
      const before = evaluateAffiliateReadiness({
        offerUrl: TAGGED,
        originalOfferUrl: ORIGINAL,
        linkModOk: null,
      });
      expect(before.ready).toBe(true);
      expect(before.source).toBe('platform_tagged');

      // 2) update-offer contract: debe persistir link_mod_ok
      expect(
        shouldPersistLinkModOk({
          offerUrl: TAGGED,
          originalOfferUrl: ORIGINAL,
          linkModOk: false,
        })
      ).toBe(true);

      const paste = validateAffiliatePaste(ORIGINAL, TAGGED);
      expect(paste.valid).toBe(true);

      // 3) Tras persistir (DB: link_mod_ok=true + tagged URL)
      const after = evaluateAffiliateReadiness({
        offerUrl: TAGGED,
        originalOfferUrl: ORIGINAL,
        linkModOk: true,
      });
      expect(after.ready).toBe(true);
      expect(computeMonetizationReadiness({
        offerUrl: TAGGED,
        originalOfferUrl: ORIGINAL,
        linkModOk: true,
      }).status).toBe('ready');
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: TAGGED,
          linkModOk: true,
          originalProductUrl: ORIGINAL,
        }).ok
      ).toBe(true);
    });
  });

  it('replace link → approve immediately (moderator_confirmed sin re-gate isTagged)', () => {
    withMlEnv(() => {
      // URL canónica + link_mod_ok, aunque assessment secundario fuera estricto:
      // el approve SOLO usa el contrato canónico.
      const ready = assertOfferReadyForAffiliateApproval({
        offerUrl: TAGGED,
        linkModOk: true,
        originalProductUrl: ORIGINAL,
      });
      expect(ready.ok).toBe(true);

      // Caso que el gate competidor rompía: link_mod_ok true + isTagged false
      // (p.ej. env distinto / shortlink). Contrato sigue READY.
      const untaggedCanonical =
        'https://www.mercadolibre.com.mx/celular-motorola-edge-60-neo-12256-grisaille/p/MLM61500237?wid=MLM61500237';
      const live = assessOfferAffiliateLink(untaggedCanonical);
      expect(live.isTagged).toBe(false);
      const contract = evaluateAffiliateReadiness({
        offerUrl: untaggedCanonical,
        originalOfferUrl: ORIGINAL,
        linkModOk: true,
      });
      expect(contract.ready).toBe(true);
      expect(contract.source).toBe('moderator_confirmed');
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: untaggedCanonical,
          linkModOk: true,
          originalProductUrl: ORIGINAL,
        }).ok
      ).toBe(true);
    });
  });

  it('replace link → refresh mental model: readiness permanece READY', () => {
    withMlEnv(() => {
      const persisted = {
        offerUrl: TAGGED,
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

  it('meli.la tagged + link_mod_ok: contrato READY (approve no debe exigir paste match)', () => {
    withMlEnv(() => {
      const short =
        'https://meli.la/1uLAo65?tag=aventa&matt_word=aventa&matt_tool=97583635';
      const original =
        'https://www.mercadolibre.com.mx/pack-x5/p/MLM36799011';
      const paste = validateAffiliatePaste(original, short);
      expect(paste.valid).toBe(false); // fingerprint distinto — gate viejo fallaba aquí
      const contract = evaluateAffiliateReadiness({
        offerUrl: short,
        originalOfferUrl: original,
        linkModOk: true,
      });
      expect(contract.ready).toBe(true);
      expect(
        assertOfferReadyForAffiliateApproval({
          offerUrl: short,
          linkModOk: true,
          originalProductUrl: original,
        }).ok
      ).toBe(true);
    });
  });
});
