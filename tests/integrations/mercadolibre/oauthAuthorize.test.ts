import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl } from '../../../lib/integrations/mercadolibre/oauth';
import { createPkcePair } from '../../../lib/integrations/mercadolibre/pkce';
import { createOAuthState } from '../../../lib/integrations/mercadolibre/state';

describe('mercadolibre authorize url', () => {
  it('includes PKCE S256 and read scopes without exposing secrets in URL', () => {
    const { state } = createOAuthState('/admin/owner');
    const { codeChallenge } = createPkcePair();
    const url = buildAuthorizeUrl({
      clientId: '123456789',
      redirectUri: 'https://aventaofertas.com/api/auth/mercadolibre/callback',
      state,
      codeChallenge,
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('auth.mercadolibre.com.mx');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')).toBe('read offline_access');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://aventaofertas.com/api/auth/mercadolibre/callback',
    );
    expect(url).not.toContain('secret');
    expect(url).not.toContain('refresh_token');
    expect(url).not.toContain('access_token');
  });
});
