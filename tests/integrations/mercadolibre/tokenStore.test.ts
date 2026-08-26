import { describe, expect, it } from 'vitest';
import {
  computeExpiresAt,
  isAccessTokenExpired,
  type MercadoLibreOAuthStatus,
} from '../../../lib/integrations/mercadolibre/tokenStore';

describe('mercadolibre tokenStore helpers', () => {
  it('detects expiration with skew', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expiresAt = computeExpiresAt(3600, now);
    expect(isAccessTokenExpired(expiresAt, 300, new Date('2026-01-01T12:50:00.000Z'))).toBe(false);
    expect(isAccessTokenExpired(expiresAt, 300, new Date('2026-01-01T12:56:00.000Z'))).toBe(true);
  });

  it('oauth status shape never includes raw tokens', () => {
    const sample: MercadoLibreOAuthStatus = {
      connected: true,
      enabled: true,
      ml_user_id: '12345',
      expires_at: new Date().toISOString(),
      scope: 'read offline_access',
      last_refresh_at: null,
      last_refresh_error: null,
    };
    const json = JSON.stringify(sample);
    expect(json).not.toMatch(/access_token/);
    expect(json).not.toMatch(/refresh_token/);
  });
});
