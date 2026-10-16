import { describe, expect, it } from 'vitest';
import { primaryAuthProviders, userHasEmailPasswordIdentity } from '@/lib/auth/authIdentities';

describe('authIdentities', () => {
  it('detecta proveedor email', () => {
    expect(
      userHasEmailPasswordIdentity({
        id: 'u1',
        identities: [{ provider: 'google', id: '1' }],
      } as never),
    ).toBe(false);
    expect(
      userHasEmailPasswordIdentity({
        id: 'u1',
        identities: [{ provider: 'email', id: '1' }],
      } as never),
    ).toBe(true);
  });

  it('lista proveedores únicos', () => {
    expect(
      primaryAuthProviders({
        id: 'u1',
        identities: [{ provider: 'google', id: '1' }, { provider: 'email', id: '2' }],
      } as never),
    ).toEqual(['google', 'email']);
  });
});
