import { describe, expect, it } from 'vitest';
import { validateOAuthCallback } from '../../../lib/integrations/mercadolibre/oauth';
import { createOAuthState } from '../../../lib/integrations/mercadolibre/state';
import { createPkcePair } from '../../../lib/integrations/mercadolibre/pkce';

describe('mercadolibre oauth callback validation', () => {
  it('accepts valid code, state and verifier', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    const { codeVerifier } = createPkcePair();
    const result = validateOAuthCallback({
      code: 'TG-auth-code',
      state,
      cookieNonce: nonce,
      codeVerifier,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe('TG-auth-code');
      expect(result.codeVerifier).toBe(codeVerifier);
    }
  });

  it('rejects missing code', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    const result = validateOAuthCallback({
      code: null,
      state,
      cookieNonce: nonce,
      codeVerifier: createPkcePair().codeVerifier,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_code');
  });

  it('rejects missing state', () => {
    const result = validateOAuthCallback({
      code: 'TG-auth-code',
      state: null,
      cookieNonce: 'nonce',
      codeVerifier: createPkcePair().codeVerifier,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_state');
  });

  it('rejects incorrect state cookie', () => {
    const { state } = createOAuthState('/admin/owner');
    const result = validateOAuthCallback({
      code: 'TG-auth-code',
      state,
      cookieNonce: 'other',
      codeVerifier: createPkcePair().codeVerifier,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('rejects missing code_verifier cookie', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    const result = validateOAuthCallback({
      code: 'TG-auth-code',
      state,
      cookieNonce: nonce,
      codeVerifier: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_code_verifier');
  });
});
