import { describe, expect, it } from 'vitest';
import {
  createPkcePair,
  createS256Challenge,
  generateCodeVerifier,
  isValidCodeVerifier,
} from '../../../lib/integrations/mercadolibre/pkce';

describe('mercadolibre pkce', () => {
  it('generates verifier within RFC 7636 length bounds', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(isValidCodeVerifier(verifier)).toBe(true);
  });

  it('creates deterministic S256 challenge from verifier', () => {
    const verifier = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
    const challenge = createS256Challenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(createS256Challenge(verifier)).toBe(challenge);
  });

  it('createPkcePair returns matching challenge', () => {
    const pair = createPkcePair();
    expect(isValidCodeVerifier(pair.codeVerifier)).toBe(true);
    expect(createS256Challenge(pair.codeVerifier)).toBe(pair.codeChallenge);
  });
});
