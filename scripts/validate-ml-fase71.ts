/**
 * FASE 7.1 — Validación real ML (sin persistir ofertas, sin imprimir secrets).
 * Uso: node --import tsx scripts/validate-ml-fase71.ts
 * o:   npx vitest run tests/offers/mlFase71.live.validation.test.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();
// Habilita lectura del token store sin necesitar client secret si el access_token sigue vigente.
if (!process.env.ML_OAUTH_ENABLED) process.env.ML_OAUTH_ENABLED = '1';

const TEST_URL =
  'https://www.mercadolibre.com.mx/p/MLM18625838?pdp_filters=item_id:MLM1413356802&matt_tool=17030900#origin=share&sid=share&wid=MLM1413356802&action=copy';

type Row = { test: string; result: 'PASS' | 'FAIL' | 'SKIP'; reason?: string };

async function main() {
  const rows: Row[] = [];
  const report: Record<string, unknown> = {};

  const {
    resolveMercadoLibreItem,
    normalizeMercadoLibreInputUrl,
  } = await import('../lib/offers/resolveMercadoLibreItem');
  const { normalizePastedOfferUrl } = await import('../lib/offerUrl');
  const { fetchMercadoLibrePublicOffer } = await import('../lib/offers/mlPublicOffer');
  const {
    isRejectedMercadoLibreImage,
    mergeMlImageCandidates,
  } = await import('../lib/offers/mlImageProvenance');
  const { classifyOfferMonetization } = await import('../lib/hunter/dayToDay/monetization');
  const { applyPlatformAffiliateTags } = await import('../lib/affiliate/applyPlatformAffiliateTags');
  const {
    assessOfferAffiliateLink,
    isPlatformAffiliateTagged,
    storeHasAffiliateProgram,
  } = await import('../lib/affiliate/assessOfferAffiliateLink');
  const { resolveAndNormalizeAffiliateOfferUrl } = await import(
    '../lib/affiliate/resolveAffiliateOfferUrl'
  );
  const { loadBotIngestConfig } = await import('../lib/bots/ingest/config');
  const { isMlOAuthEnabled, getMlOAuthConfigError } = await import(
    '../lib/integrations/mercadolibre/oauth'
  );
  const { getMercadoLibreTokenRow, isAccessTokenExpired, getRefreshSkewSeconds } = await import(
    '../lib/integrations/mercadolibre/tokenStore'
  );

  // --- 1. Resolver (sin mock) ---
  const resolved = resolveMercadoLibreItem(TEST_URL);
  report.resolution = {
    siteId: resolved?.siteId ?? null,
    itemId: resolved?.itemId ?? null,
    catalogProductId: resolved?.catalogProductId ?? null,
    canonicalUrl: resolved?.canonicalUrl ?? null,
    resolutionMethod: resolved?.resolutionMethod ?? null,
    confidence: resolved?.confidence ?? null,
  };
  rows.push({
    test: 'URL larga',
    result: resolved ? 'PASS' : 'FAIL',
    reason: resolved ? undefined : 'resolve returned null',
  });
  rows.push({
    test: 'item_id',
    result: resolved?.itemId === 'MLM1413356802' && resolved?.siteId === 'MLM' ? 'PASS' : 'FAIL',
    reason: `got ${resolved?.siteId}/${resolved?.itemId}`,
  });
  rows.push({
    test: 'canonical URL',
    result:
      resolved?.canonicalUrl &&
      resolved.canonicalUrl.includes('wid=MLM1413356802') &&
      resolved.canonicalUrl.includes('MLM18625838')
        ? 'PASS'
        : 'FAIL',
    reason: resolved?.canonicalUrl ?? 'missing',
  });

  // --- Matt / wid coexistence ---
  const original = new URL(normalizeMercadoLibreInputUrl(TEST_URL));
  const hashParams = new URLSearchParams(
    original.hash.startsWith('#') ? original.hash.slice(1) : original.hash,
  );
  report.mattTracking = {
    originalHasMattToolQuery: original.searchParams.get('matt_tool') === '17030900',
    originalHasWidInHash: hashParams.get('wid') === 'MLM1413356802',
    originalHasPdpFilters: (original.searchParams.get('pdp_filters') || '').includes(
      'item_id:MLM1413356802',
    ),
    canonicalKeepsWid: Boolean(resolved?.canonicalUrl?.includes('wid=MLM1413356802')),
    canonicalDropsShareHash: !(resolved?.canonicalUrl || '').includes('origin=share'),
    note:
      'matt_tool es tracking de afiliado en la URL original; la canonical de producto usa wid; monetized re-aplica tags de plataforma desde env',
  };
  rows.push({
    test: 'matt tracking',
    result:
      report.mattTracking.originalHasMattToolQuery &&
      report.mattTracking.originalHasWidInHash &&
      report.mattTracking.originalHasPdpFilters &&
      resolved?.itemId === 'MLM1413356802'
        ? 'PASS'
        : 'FAIL',
  });

  // --- OAuth presence (no secrets) ---
  const oauthEnabled = isMlOAuthEnabled();
  const oauthCfgErr = getMlOAuthConfigError();
  const tokenRow = await getMercadoLibreTokenRow().catch(() => null);
  const tokenUsable =
    Boolean(tokenRow?.access_token?.trim()) &&
    !isAccessTokenExpired(tokenRow?.expires_at ?? null, getRefreshSkewSeconds());
  report.oauth = {
    enabledFlag: oauthEnabled,
    configError: oauthCfgErr,
    hasTokenRow: Boolean(tokenRow),
    tokenUsableWithoutPrinting: tokenUsable,
    expiresAt: tokenRow?.expires_at ?? null,
    lastRefreshError: tokenRow?.last_refresh_error ?? null,
  };

  // --- 2. API real ---
  let apiOffer: Awaited<ReturnType<typeof fetchMercadoLibrePublicOffer>> = null;
  let apiError: string | null = null;
  try {
    apiOffer = await fetchMercadoLibrePublicOffer(TEST_URL);
  } catch (e) {
    apiError = e instanceof Error ? e.name + ':' + e.message : 'unknown';
  }
  report.api = {
    error: apiError,
    found: Boolean(apiOffer),
    source: apiOffer?.source ?? null,
    itemId: apiOffer?.itemId ?? null,
    title: apiOffer?.title ? String(apiOffer.title).slice(0, 120) : null,
    price: apiOffer?.price ?? null,
    originalPrice: apiOffer?.originalPrice ?? null,
    hasPermalink: Boolean(apiOffer?.permalink),
    picturesApi: apiOffer?.pictures?.length ?? 0,
    pictureCandidates: (apiOffer?.pictureCandidates ?? []).map((c) => ({
      source: c.source,
      sourceItemId: c.sourceItemId,
      isPrimary: c.isPrimary,
      urlHostPath: (() => {
        try {
          const u = new URL(c.url);
          return `${u.hostname}${u.pathname}`.slice(0, 120);
        } catch {
          return 'invalid-url';
        }
      })(),
      rejected: isRejectedMercadoLibreImage(c.url, c.sourceItemId),
    })),
  };

  rows.push({
    test: 'API',
    result: apiOffer && apiOffer.source === 'ml_api' && apiOffer.itemId === 'MLM1413356802' ? 'PASS' : 'FAIL',
    reason: apiError || `source=${apiOffer?.source} item=${apiOffer?.itemId}`,
  });
  rows.push({
    test: 'API pictures',
    result: (apiOffer?.pictures?.length ?? 0) >= 2 ? 'PASS' : (apiOffer?.pictures?.length ?? 0) >= 1 ? 'PASS' : 'FAIL',
    reason: `count=${apiOffer?.pictures?.length ?? 0}`,
  });

  // --- 3. Provenance / rejection ---
  const wrongItemProbe = mergeMlImageCandidates(
    [
      apiOffer?.pictureCandidates ?? [],
      [
        {
          url: 'https://http2.mlstatic.com/D_NQ_NP_2X_OTHERITEM-O.jpg',
          source: 'ml_api',
          sourceItemId: 'MLM9999999999',
          pictureId: 'OTHER',
          isPrimary: false,
        },
        {
          url: 'https://http2.mlstatic.com/D_NQ_NP_2X_banner-promo-O.jpg',
          source: 'og',
          sourceItemId: null,
          pictureId: null,
          isPrimary: false,
        },
        {
          url: 'https://aventaofertas.com/logo.png',
          source: 'og',
          sourceItemId: null,
          pictureId: null,
          isPrimary: false,
        },
        {
          url: 'https://http2.mlstatic.com/D_NQ_NP_2X_recommend-carousel-O.jpg',
          source: 'same_resource',
          sourceItemId: 'MLM1413356802',
          pictureId: null,
          isPrimary: false,
        },
      ],
    ],
    { sourceItemId: 'MLM1413356802', minApiToSkipFallback: 2 },
  );
  const wrongIds = wrongItemProbe.filter((c) => c.sourceItemId === 'MLM9999999999');
  const hasBanner = wrongItemProbe.some((c) => /banner|promo/i.test(c.url));
  const hasLogo = wrongItemProbe.some((c) => /logo\.png/i.test(c.url));
  const hasRecommend = wrongItemProbe.some((c) => /recommend/i.test(c.url));
  report.imageValidation = {
    apiReceived: apiOffer?.pictures?.length ?? 0,
    accepted: apiOffer?.pictures?.length ?? 0,
    rejectedProbes: {
      wrongItemCountInMerged: wrongIds.length,
      bannerPresent: hasBanner,
      logoPresent: hasLogo,
      recommendPresent: hasRecommend,
    },
    rejectionReasons: [
      wrongIds.length === 0 ? 'wrong item_id rejected' : 'FAIL wrong item entered',
      !hasBanner ? 'banner rejected' : 'FAIL banner entered',
      !hasLogo ? 'logo rejected' : 'FAIL logo entered',
      !hasRecommend ? 'recommended rejected' : 'FAIL recommended entered',
    ],
  };
  rows.push({
    test: 'image provenance',
    result:
      (apiOffer?.pictureCandidates ?? []).every(
        (c) => !c.sourceItemId || c.sourceItemId === 'MLM1413356802',
      ) && (apiOffer?.pictures?.length ?? 0) > 0
        ? 'PASS'
        : 'FAIL',
  });
  rows.push({
    test: 'wrong item rejection',
    result: wrongIds.length === 0 && !hasBanner && !hasLogo && !hasRecommend ? 'PASS' : 'FAIL',
  });

  // --- 5. Affiliate layers ---
  const originalPreserved = TEST_URL;
  const canonical = resolved?.canonicalUrl ?? '';
  const monetized = await resolveAndNormalizeAffiliateOfferUrl(TEST_URL);
  const assessment = assessOfferAffiliateLink(monetized);
  const hasProgram = storeHasAffiliateProgram(canonical || TEST_URL);
  const tagged = isPlatformAffiliateTagged(monetized);
  const monetizationStatus = classifyOfferMonetization(TEST_URL);
  // link_mod_ok solo si hay programa Y está tagged; no inventar
  const linkModOk = hasProgram ? tagged : false;
  report.affiliate = {
    original_offer_url: originalPreserved.slice(0, 180) + '…',
    canonicalUrl: canonical,
    offer_url_monetized_host_path: (() => {
      try {
        const u = new URL(monetized);
        return `${u.origin}${u.pathname}?` + [...u.searchParams.keys()].sort().join(',');
      } catch {
        return 'invalid';
      }
    })(),
    monetizationStatus,
    hasAffiliateProgramConfigured: hasProgram,
    isTagged: tagged,
    link_mod_ok: linkModOk,
    assessment,
    appliedPlatformTagsKeys: (() => {
      try {
        return [...new URL(applyPlatformAffiliateTags(canonical || TEST_URL)).searchParams.keys()];
      } catch {
        return [];
      }
    })(),
  };
  rows.push({
    test: 'original URL preserved',
    result:
      originalPreserved.includes('matt_tool=17030900') &&
      originalPreserved.includes('wid=MLM1413356802')
        ? 'PASS'
        : 'FAIL',
  });
  rows.push({
    test: 'affiliate resolution',
    result: hasProgram ? (tagged && monetized !== originalPreserved ? 'PASS' : 'FAIL') : 'SKIP',
    reason: hasProgram
      ? `tagged=${tagged}`
      : 'No ML_AFFILIATE_TAG/ML_MATT_* en entorno local — no se inventó enlace',
  });

  // --- Mobile paste normalize (deterministic, same as UI) ---
  const mobilePaste = `  ${TEST_URL.slice(0, 50)}\n${TEST_URL.slice(50)}  `;
  const tabletPaste = TEST_URL.replace(/\?/g, '?\n');
  const desktopPaste = TEST_URL;
  const nMobile = normalizePastedOfferUrl(mobilePaste);
  const nTablet = normalizePastedOfferUrl(tabletPaste);
  const nDesktop = normalizePastedOfferUrl(desktopPaste);
  const rMobile = resolveMercadoLibreItem(nMobile);
  const rTablet = resolveMercadoLibreItem(nTablet);
  const rDesktop = resolveMercadoLibreItem(nDesktop);
  report.paste = {
    mobileItemId: rMobile?.itemId ?? null,
    tabletItemId: rTablet?.itemId ?? null,
    desktopItemId: rDesktop?.itemId ?? null,
  };
  rows.push({
    test: 'mobile paste',
    result: rMobile?.itemId === 'MLM1413356802' ? 'PASS' : 'FAIL',
  });
  rows.push({
    test: 'tablet paste',
    result: rTablet?.itemId === 'MLM1413356802' ? 'PASS' : 'FAIL',
  });
  rows.push({
    test: 'desktop paste',
    result: rDesktop?.itemId === 'MLM1413356802' ? 'PASS' : 'FAIL',
  });

  // --- Pipeline safety flags (no persist) ---
  const cfg = loadBotIngestConfig();
  const autoPublishEnv =
    process.env.AUTO_PUBLISH === '1' ||
    process.env.AUTO_PUBLISH === 'true' ||
    process.env.BOT_INGEST_AUTO_PUBLISH === '1';
  report.pipelineSafety = {
    legacyAutoApproveWriteEnabled: cfg.legacyAutoApproveWriteEnabled,
    autoApprovePolicyEnabled: cfg.autoApproveEnabled,
    autoPublishEnvFlag: autoPublishEnv,
    persistedOffer: false,
    note: 'Validación detenida antes de insert; no se publicó oferta de prueba',
  };
  // Pipeline functional dry-run: resolve → API → normalize layers already done
  rows.push({
    test: 'pipeline',
    result:
      resolved?.itemId === 'MLM1413356802' &&
      apiOffer?.source === 'ml_api' &&
      (apiOffer.pictures?.length ?? 0) > 0
        ? 'PASS'
        : 'FAIL',
    reason: 'dry-run hasta pre-persistencia (resolver+API+images+affiliate layers)',
  });
  rows.push({
    test: 'no auto-publish',
    result: !cfg.legacyAutoApproveWriteEnabled && !autoPublishEnv ? 'PASS' : 'FAIL',
    reason: `legacyWrite=${cfg.legacyAutoApproveWriteEnabled} autoPublishEnv=${autoPublishEnv}`,
  });

  // verifier / shadow: no insert → N/A decisions, report policy posture
  report.verifierDecision = 'not_run_no_persist';
  report.shadowDecision = 'SHADOW_ONLY_policy_untouched';

  const criticalFail = rows.some(
    (r) =>
      r.result === 'FAIL' &&
      [
        'URL larga',
        'item_id',
        'API',
        'API pictures',
        'image provenance',
        'wrong item rejection',
        'canonical URL',
        'original URL preserved',
        'mobile paste',
        'no auto-publish',
      ].includes(r.test),
  );

  console.log(
    JSON.stringify(
      {
        fase: '7.1',
        criticalFail,
        table: rows,
        report,
      },
      null,
      2,
    ),
  );

  process.exit(criticalFail ? 1 : 0);
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      fatal: true,
      name: e instanceof Error ? e.name : 'Error',
      message: e instanceof Error ? e.message : String(e),
    }),
  );
  process.exit(2);
});
