import { describe, expect, it } from 'vitest';
import {
  extractMercadoLibreItemId,
  extractMercadoLibreUserProductId,
  isMercadoLibreApiItemId,
  isMercadoLibreUserProductId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import {
  firstUrlFromSrcset,
  isMercadoLibreApiItemId as workerIsApiItemId,
  pickBestCardImageUrl,
  inferItemId,
} from '../../workers/mercadolibre-worker/src/ml.mjs';

describe('worker card image extraction', () => {
  it('elige img src https de mlstatic', () => {
    const url = pickBestCardImageUrl([
      'https://http2.mlstatic.com/D_NQ_NP_2X_ABC123-MLM-O.webp',
    ]);
    expect(url).toContain('mlstatic.com');
  });

  it('prefiere data-src / srcset sobre placeholder', () => {
    const fromSrcset = firstUrlFromSrcset(
      'https://http2.mlstatic.com/D_NQ_NP_ABC-O.webp 1x, https://http2.mlstatic.com/D_NQ_NP_2X_ABC-O.webp 2x'
    );
    expect(fromSrcset).toContain('2X_ABC');

    const best = pickBestCardImageUrl([
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'https://http2.mlstatic.com/placeholder-lazy.gif',
      fromSrcset,
    ]);
    expect(best).toContain('2X_ABC');
  });

  it('fallback cuando no existe imagen válida → null', () => {
    expect(pickBestCardImageUrl([])).toBeNull();
    expect(pickBestCardImageUrl([null, '', 'data:image/png;base64,aaa'])).toBeNull();
    expect(pickBestCardImageUrl(['https://cdn.example.com/placeholder-lazy.gif'])).toBeNull();
  });
});

describe('/up/MLMU resolución (sin falso item_id)', () => {
  const UP_ONLY =
    'https://www.mercadolibre.com.mx/tenis-adidas/up/MLMU2916452044?wid=MLMU2916452044';
  const UP_RESOLVABLE =
    'https://www.mercadolibre.com.mx/tenis-adidas/up/MLMU2916452044?wid=MLM1413356802';

  it('MLMU no es item API', () => {
    expect(isMercadoLibreUserProductId('MLMU2916452044')).toBe(true);
    expect(isMercadoLibreApiItemId('MLMU2916452044')).toBe(false);
    expect(isMercadoLibreApiItemId('MLM1413356802')).toBe(true);
    expect(isMercadoLibreApiItemId('MLU123456789')).toBe(true); // Uruguay item
    expect(workerIsApiItemId('MLMU2916452044')).toBe(false);
  });

  it('URL /up/MLMU sin item real → no inventa item_id', () => {
    const r = resolveMercadoLibreItem(UP_ONLY);
    expect(r?.itemId).toBeNull();
    expect(r?.resolutionMethod).toBe('unresolved');
    expect(extractMercadoLibreItemId(UP_ONLY)).toBeNull();
    expect(inferItemId(UP_ONLY)).toBeNull();
    expect(extractMercadoLibreUserProductId(UP_ONLY)).toBe('MLMU2916452044');
    // Fingerprint estable para dedupe, sin promover a API item.
    expect(offerUrlFingerprint(UP_ONLY)).toBe('ml:MLMU2916452044');
  });

  it('URL /up/MLMU resoluble con wid MLM real', () => {
    const r = resolveMercadoLibreItem(UP_RESOLVABLE);
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.resolutionMethod).toBe('query_wid');
    expect(extractMercadoLibreItemId(UP_RESOLVABLE)).toBe('MLM1413356802');
    expect(inferItemId(UP_RESOLVABLE)).toBe('MLM1413356802');
  });
});
