import { describe, expect, it } from 'vitest';
import { applyPendingAuthCookies, type PendingAuthCookie } from '@/lib/server/sessionCookies';

describe('applyPendingAuthCookies', () => {
  it('copia el refresh rotado a la respuesta que sí se envía', () => {
    const pending: PendingAuthCookie[] = [
      {
        name: 'sb-access-token',
        value: 'rotated',
        options: { path: '/', httpOnly: true, sameSite: 'lax' },
      },
    ];
    const written: PendingAuthCookie[] = [];
    const abandoned = { cookies: { set: () => {} } };
    const sent = {
      cookies: {
        set: (name: string, value: string, options?: PendingAuthCookie['options']) => {
          written.push({ name, value, options });
        },
      },
    };

    applyPendingAuthCookies(abandoned, []);
    applyPendingAuthCookies(sent, pending);

    expect(written).toEqual(pending);
  });
});
