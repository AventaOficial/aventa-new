import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('OfferCard feed layout', () => {
  const card = readFileSync('app/components/OfferCard.tsx', 'utf8');

  it('no reserva espacio vertical artificial entre contenido y acciones', () => {
    expect(card).toContain('flex flex-row items-start');
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

  it('en mobile el comentario del cazador cae debajo y no comprime el contenido', () => {
    expect(card).toContain('flex flex-row flex-wrap md:flex-nowrap items-start min-h-0');
    expect(card).toMatch(
      /<aside\s+className="flex w-full md:w-\[30%\] md:max-w-\[200px\] md:min-w-\[132px\] shrink-0/,
    );
  });
});
