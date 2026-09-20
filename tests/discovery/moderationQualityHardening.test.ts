import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatOfferScopeCondition,
  inferBotOfferScope,
  parseOfferScopeFromConditions,
} from '@/lib/offerScope';
import { normalizeCategoryForStorage } from '@/lib/categories';

describe('bot purchase mode / offer scope', () => {
  it('Mercado Libre / Amazon → online canónico', () => {
    expect(
      inferBotOfferScope({
        store: 'Mercado Libre',
        url: 'https://articulo.mercadolibre.com.mx/MLM-1',
      }),
    ).toBe('online');
    expect(inferBotOfferScope({ store: 'Amazon', url: 'https://www.amazon.com.mx/dp/B00' })).toBe(
      'online',
    );
  });

  it('fuente desconocida → null (no inventar)', () => {
    expect(inferBotOfferScope({ store: 'Tienda local XYZ', url: null })).toBeNull();
  });

  it('conditions persistidas se parsean igual que ActionBar', () => {
    const line = formatOfferScopeCondition('online');
    expect(parseOfferScopeFromConditions(line)).toBe('online');
    expect(parseOfferScopeFromConditions(formatOfferScopeCondition('in_store'))).toBe('in_store');
  });

  it('insertIngestedOffer escribe conditions', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/bots/ingest/insertIngestedOffer.ts'),
      'utf8',
    );
    expect(src).toContain('formatOfferScopeCondition');
    expect(src).toContain('inferBotOfferScope');
    expect(src).toContain('conditions');
  });
});

describe('moderation origin filter USER/BOT', () => {
  it('rutas admin + chips TODAS/USUARIOS/BOT', () => {
    const ws = readFileSync(
      join(process.cwd(), 'app/components/moderation/ModerationFocusWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain("label: 'TODAS'");
    expect(ws).toContain("label: 'USUARIOS'");
    expect(ws).toContain("label: 'BOT'");
    expect(ws).toContain('/admin/moderation/bot');
    expect(ws).toContain('/admin/moderation/users');
    expect(ws).toContain('data-moderation-origin-filter');

    const botPage = readFileSync(
      join(process.cwd(), 'app/admin/moderation/bot/page.tsx'),
      'utf8',
    );
    const usersPage = readFileSync(
      join(process.cwd(), 'app/admin/moderation/users/page.tsx'),
      'utf8',
    );
    expect(botPage).toContain('sourceTab="bot"');
    expect(usersPage).toContain('sourceTab="users"');
  });

  it('claim usa created_by bot ids (no título)', () => {
    const claim = readFileSync(
      join(process.cwd(), 'lib/moderation/claimNextModerationOffer.ts'),
      'utf8',
    );
    expect(claim).toContain('botIds.has(row.created_by)');
    expect(claim).toContain("sourceTab === 'bot'");
  });
});

describe('category normalization regression', () => {
  it.each([
    ['electronics', 'tecnologia'],
    ['Tecnología', 'tecnologia'],
    ['tecnología', 'tecnologia'],
    ['technology', 'tecnologia'],
    ['other', 'other'],
  ] as const)('%s → %s', (raw, expected) => {
    expect(normalizeCategoryForStorage(raw)).toBe(expected);
  });
});

describe('offer detail author avatar', () => {
  it('detalle usa avatar circular h-10 y marca bot', () => {
    const page = readFileSync(join(process.cwd(), 'app/oferta/[id]/page.tsx'), 'utf8');
    const content = readFileSync(
      join(process.cwd(), 'app/oferta/[id]/OfferPageContent.tsx'),
      'utf8',
    );
    expect(page).toContain('isBotUserId');
    expect(page).toContain('BOT_AUTHOR_DISPLAY_NAME');
    expect(content).toContain('h-10 w-10 rounded-full');
    expect(content).toContain('isBot');
  });
});
