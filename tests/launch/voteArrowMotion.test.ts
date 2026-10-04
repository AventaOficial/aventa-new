import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('VoteArrowButton', () => {
  const source = readFileSync(join(process.cwd(), 'app/components/VoteArrowButton.tsx'), 'utf8');

  it('el rebote de 3 keyframes no usa spring (framer-motion lo rechaza con un error en consola)', () => {
    expect(source).toContain('animate={{ y: [0, isUp ? -4 : 4, 0] }}');
    expect(source).not.toMatch(/type:\s*['"]spring['"]/);
  });
});
