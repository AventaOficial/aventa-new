import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));
vi.mock('next/image', () => ({ default: () => null }));

const { default: OfferAuthorCard } = await import('@/app/components/offers/OfferAuthorCard');
const { AventaFoundLine } = await import('@/app/components/hunters/HunterIdentity');
const { communityAuthorCard, teamAuthorCard } = await import('@/lib/product/presentation/teamAuthor');
const { hunterByCode } = await import('@/lib/product/hunters/identity');

const VERIFIED = 'aria-label="Verificado por AVENTA"';

describe('verificado morado de hunters AVENTA', () => {
  it('la marca editorial de la tarjeta lleva el verificado a su derecha', () => {
    const html = renderToStaticMarkup(createElement(AventaFoundLine, { label: 'AVENTA TECH', line: 'Top tecnología' }));
    expect(html).toContain(VERIFIED);
    expect(html.indexOf('AVENTA TECH')).toBeLessThan(html.indexOf(VERIFIED));
    expect(html).toContain('fill-violet-600');
  });

  it.each(['ximena', 'kai', 'eleonore'])('la ficha de autor de %s muestra el verificado junto al nombre', (code) => {
    const hunter = hunterByCode(code);
    expect(hunter).toBeTruthy();
    const html = renderToStaticMarkup(createElement(OfferAuthorCard, { author: teamAuthorCard(hunter!) }));
    expect(html).toContain(VERIFIED);
    expect(html.indexOf(hunter!.name)).toBeLessThan(html.indexOf(VERIFIED));
  });

  it('una persona de la comunidad no recibe el verificado', () => {
    const html = renderToStaticMarkup(
      createElement(OfferAuthorCard, { author: communityAuthorCard({ name: 'Ana López', profileHref: '/u/ana' }) }),
    );
    expect(html).toContain('Ana López');
    expect(html).not.toContain('Verificado');
  });
});
