import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCardEditBody, editPatchFromResponse } from '@/lib/moderation/cardEditPayload';
import { HISTORY_PAGE_SIZE, historySearchFilter, mergeHistoryPage } from '@/lib/moderation/historyPagination';
import { botMetaWithHunterCode, hunterCodeFromBotMeta, presentAuthor } from '@/lib/product/hunters/identity';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ORIGINAL = {
  title: 'Lenovo LOQ 15.6&#34; FHD',
  offer_url: 'https://www.amazon.com.mx/dp/B0TEST?tag=x-20',
  description: 'Descripción',
  image_url: 'https://m.media-amazon.com/images/I/a.jpg',
  category: 'tecnologia',
};
const UNCHANGED = {
  title: ORIGINAL.title,
  offer_url: ORIGINAL.offer_url,
  description: ORIGINAL.description,
  image_url: ORIGINAL.image_url,
  category: 'tecnologia',
};

describe('editar desde la tarjeta de Aprobadas', () => {
  it('sólo envía lo que cambió: corregir título o categoría no reenvía URL ni imagen', () => {
    expect(buildCardEditBody('o1', ORIGINAL, { ...UNCHANGED, title: 'Lenovo LOQ 15.6" FHD' })).toEqual({
      id: 'o1',
      title: 'Lenovo LOQ 15.6" FHD',
    });
    expect(buildCardEditBody('o1', ORIGINAL, { ...UNCHANGED, category: 'gaming' })).toEqual({
      id: 'o1',
      category: 'gaming',
    });
  });

  it('sin cambios no hay nada que guardar; un campo vaciado no borra', () => {
    expect(buildCardEditBody('o1', ORIGINAL, UNCHANGED)).toEqual({ id: 'o1' });
    expect(buildCardEditBody('o1', ORIGINAL, { ...UNCHANGED, description: '  ', category: '' })).toEqual({ id: 'o1' });
  });

  it('categoría heredada con alias no cuenta como cambio si el moderador no la toca', () => {
    expect(buildCardEditBody('o1', { ...ORIGINAL, category: 'electronics' }, UNCHANGED)).toEqual({ id: 'o1' });
  });

  it('la respuesta del servidor se aplica en sitio, incluido un demote a pending', () => {
    expect(editPatchFromResponse({ ok: true, title: 'Nuevo', category: 'hogar', status: 'approved' })).toEqual({
      title: 'Nuevo',
      category: 'hogar',
      status: 'approved',
    });
    expect(editPatchFromResponse({ ok: true, status: 'pending' })).toEqual({ status: 'pending' });
    expect(editPatchFromResponse(null)).toEqual({});
  });

  it('el modal de la tarjeta tiene selector de categoría del catálogo y usa el PATCH auditado', () => {
    const card = read('app/admin/components/ModerationOfferCard.tsx');
    expect(card).toMatch(/moderation-card-category-/);
    expect(card).toMatch(/ALL_CATEGORIES\.map/);
    expect(card).toContain("'/api/admin/update-offer'");
    expect(card).toContain('buildCardEditBody(');
  });
});

describe('Aprobadas: paginación y búsqueda en servidor', () => {
  it('la búsqueda es un filtro or sobre título y tienda, sin romper la sintaxis de PostgREST', () => {
    expect(historySearchFilter('  ')).toBeNull();
    expect(historySearchFilter('JBL Grip')).toBe('title.ilike.%JBL Grip%,store.ilike.%JBL Grip%');
    expect(historySearchFilter('a,b (c)*%')).toBe('title.ilike.%a b c%,store.ilike.%a b c%');
  });

  it('la página siguiente descarta las repetidas del cursor', () => {
    const merged = mergeHistoryPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
    expect(merged.offers.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(merged.added).toBe(1);
  });

  it('el panel ya no corta en 100: pagina por created_at y busca en servidor', () => {
    const panel = read('app/admin/moderation/panels/ModerationOffersHistoryPanel.tsx');
    expect(panel).not.toMatch(/\.limit\(100\)/);
    expect(panel).toContain('.limit(HISTORY_PAGE_SIZE)');
    expect(panel).toContain(".lte('created_at', before)");
    expect(panel).toContain('historySearchFilter(debouncedSearch)');
    expect(panel).toContain("count: before ? undefined : 'exact'");
    expect(HISTORY_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('autor en moderación tras cambiar el hunter', () => {
  it('botMetaWithHunterCode conserva la metadata y cambia sólo el hunter', () => {
    const meta = botMetaWithHunterCode({ price_policy: { v: 1 }, hunter_code: 'ximena' }, 'kai');
    expect(meta).toEqual({ price_policy: { v: 1 }, hunter_code: 'kai' });
    expect(botMetaWithHunterCode(null, 'kai')).toEqual({ hunter_code: 'kai' });
    expect(hunterCodeFromBotMeta(meta)).toBe('kai');
  });

  it('un autor MCP de machine_clients (no BOT_INGEST_USER_ID) se presenta con su hunter_code', () => {
    const presented = presentAuthor({
      userId: '55555555-5555-4555-8555-555555555555',
      displayName: 'Aventa MCP Supply',
      hunterCode: hunterCodeFromBotMeta({ hunter_code: 'kai' }),
    });
    expect(presented.kind === 'hunter' && presented.hunter.code).toBe('kai');
  });

  it.each(['app/admin/components/ModerationOfferCard.tsx', 'app/admin/components/ModerationOfferDetail.tsx'])(
    '%s usa bot_meta.hunter_code siempre y aplica el guardado de HunterLaneReview',
    (path) => {
      const src = read(path);
      expect(src).not.toMatch(/hunterCode: isBotOffer \?/);
      expect(src).toContain('hunterCodeFromBotMeta(botMeta)');
      expect(src).toContain('botMetaWithHunterCode(offer.bot_meta, hunterOverride.code)');
      expect(src).toMatch(/onSaved=\{\(code\) =>/);
      expect(src).toContain('botMeta={botMeta}');
    }
  );

  it('HunterLaneReview avisa al padre y se sincroniza si el padre cambia bot_meta', () => {
    const src = read('app/components/moderation/HunterLaneReview.tsx');
    expect(src).toContain('onSaved?.(code)');
    expect(src).toContain('if (initial !== syncedInitial)');
  });

  it('la vista móvil y el panel de pendientes propagan el nuevo hunter al estado de la oferta', () => {
    expect(read('app/admin/components/ModerationMobileReview.tsx')).toContain('onSaved={(code) => onHunterChanged?.(offer.id, code)}');
    const panel = read('app/admin/moderation/panels/ModerationPendingPanel.tsx');
    expect(panel).toContain('onHunterChanged={setOfferHunter}');
    expect(panel).toContain('botMetaWithHunterCode(o.bot_meta, hunterCode)');
  });
});
