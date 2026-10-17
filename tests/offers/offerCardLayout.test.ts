import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('OfferCard feed layout', () => {
  const card = readFileSync('app/components/OfferCard.tsx', 'utf8');

  it('no reserva espacio vertical artificial entre contenido y acciones', () => {
    expect(card).toContain('flex flex-row flex-wrap md:flex-nowrap items-start min-h-0');
    expect(card).not.toContain('flex-1 min-h-[6px]');
    expect(card).not.toMatch(/min-w-0 flex-1 flex flex-col gap-1/);
    expect(card).not.toMatch(/-m[tblrxy]?-\d/);
  });

  it('votos, antigüedad y CTA comparten una sola fila inferior', () => {
    const votesIdx = card.indexOf('<VotesBlock />');
    const timeIdx = card.indexOf('{timeLabel ? (', votesIdx);
    const ctaIdx = card.indexOf("statusConfig?.ctaLabel ?? 'Ver oferta'", votesIdx);
    const hunterAsideIdx = card.lastIndexOf('aria-label="Comentario del cazador"');
    expect(card.match(/<VotesBlock \/>/g)?.length).toBe(1);
    expect(votesIdx).toBeGreaterThan(hunterAsideIdx);
    expect(timeIdx).toBeGreaterThan(votesIdx);
    expect(ctaIdx).toBeGreaterThan(timeIdx);
  });

  it('identidad editorial usa el logo oficial y solo para hunters del canon', () => {
    const line = readFileSync('app/components/hunters/HunterIdentity.tsx', 'utf8');
    expect(line).toContain('src="/icon.svg"');
    expect(line).not.toMatch(/>\s*A\s*</);
    expect(card).toMatch(
      /cardAttribution\?\.kind === 'brand' \? \(\s*<AventaFoundLine label=\{cardAttribution\.label\} line=\{cardAttribution\.line\} \/>/,
    );
  });

  it('el comentario del cazador se separa por breakpoint sin comprimir precios en móvil', () => {
    expect(card).toContain('flex flex-row flex-wrap md:flex-nowrap items-start min-h-0');
    expect(card).toContain('className="hidden md:flex w-[30%] max-w-[200px] min-w-[132px]');
    expect(card).toContain('className="md:hidden flex flex-col gap-1 border-l-2');
    const desktopAsideIdx = card.indexOf('className="hidden md:flex w-[30%]');
    const mobileAsideIdx = card.indexOf('className="md:hidden flex flex-col gap-1 border-l-2');
    const footerIdx = card.indexOf(
      '<div className="pt-2 border-t border-gray-100/80 dark:border-gray-800/60 flex items-center gap-2',
    );
    expect(desktopAsideIdx).toBeGreaterThan(-1);
    expect(mobileAsideIdx).toBeGreaterThan(desktopAsideIdx);
    expect(footerIdx).toBeGreaterThan(mobileAsideIdx);
    expect(card).not.toContain('className="flex w-full md:w-[30%] md:max-w-[200px]');
  });
});
