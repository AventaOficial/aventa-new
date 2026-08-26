import { describe, expect, it } from 'vitest';
import {
  createOAuthState,
  isOAuthStateExpired,
  parseOAuthState,
  validateOAuthState,
} from '../../../lib/integrations/mercadolibre/state';

describe('mercadolibre oauth state', () => {
  it('creates parseable state with nonce', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    expect(nonce.length).toBeGreaterThan(10);
    const parsed = parseOAuthState(state);
    expect(parsed?.nonce).toBe(nonce);
    expect(parsed?.returnTo).toBe('/admin/owner');
  });

  it('validates matching cookie nonce', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    const result = validateOAuthState({ stateParam: state, cookieNonce: nonce });
    expect(result.ok).toBe(true);
  });

  it('rejects state mismatch', () => {
    const { state } = createOAuthState('/admin/owner');
    const result = validateOAuthState({ stateParam: state, cookieNonce: 'wrong-nonce' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('rejects expired state', () => {
    const { state, nonce } = createOAuthState('/admin/owner');
    const parsed = parseOAuthState(state)!;
    const expiredNow = parsed.iat + 11 * 60 * 1000;
    expect(isOAuthStateExpired(parsed, expiredNow)).toBe(true);
    const result = validateOAuthState({
      stateParam: state,
      cookieNonce: nonce,
      nowMs: expiredNow,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_expired');
  });

  it('rejects invalid returnTo embedded in state', () => {
    const { nonce } = createOAuthState('/admin/owner');
    const tampered = Buffer.from(
      JSON.stringify({ nonce, returnTo: '/evil', iat: Date.now() }),
      'utf8',
    ).toString('base64url');
    expect(parseOAuthState(tampered)).toBeNull();
  });
});
