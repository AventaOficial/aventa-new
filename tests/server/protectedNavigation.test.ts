import { describe, expect, it } from 'vitest';
import {
  decideProtectedNavigation,
  sessionObservationFromAuthResult,
} from '@/lib/server/protectedNavigation';

describe('sessionObservationFromAuthResult', () => {
  it('distingue sesión, ausencia y fallo transitorio', () => {
    expect(sessionObservationFromAuthResult({ userId: 'user-1', errorName: null })).toBe(
      'authenticated',
    );
    expect(
      sessionObservationFromAuthResult({ userId: null, errorName: 'AuthSessionMissingError' }),
    ).toBe('anonymous');
    expect(sessionObservationFromAuthResult({ userId: null, errorName: 'AuthApiError' })).toBe(
      'anonymous',
    );
    expect(
      sessionObservationFromAuthResult({ userId: null, errorName: 'AuthRetryableFetchError' }),
    ).toBe('unavailable');
    expect(sessionObservationFromAuthResult({ userId: null, errorName: 'AuthUnknownError' })).toBe(
      'unavailable',
    );
  });
});

describe('decideProtectedNavigation', () => {
  it('mantiene autenticado al navegar rutas protegidas', () => {
    for (const pathname of ['/me', '/settings', '/admin', '/team', '/mi-panel']) {
      expect(decideProtectedNavigation(pathname, 'authenticated')).toEqual({ type: 'continue' });
    }
  });

  it('redirige anónimo fuera de /me, /settings y /admin', () => {
    for (const pathname of ['/me', '/settings', '/admin', '/equipo']) {
      expect(decideProtectedNavigation(pathname, 'anonymous')).toEqual({
        type: 'redirect',
        pathname: '/',
      });
    }
  });

  it('manda /team anónimo a la puerta y deja pasar /team/gate', () => {
    expect(decideProtectedNavigation('/team', 'anonymous')).toEqual({
      type: 'redirect',
      pathname: '/team/gate',
      next: '/team',
    });
    expect(decideProtectedNavigation('/team/miembros', 'anonymous')).toEqual({
      type: 'redirect',
      pathname: '/team/gate',
      next: '/team/miembros',
    });
    expect(decideProtectedNavigation('/team/gate', 'anonymous')).toEqual({ type: 'continue' });
  });

  it('no convierte un fallo de sesión en logout', () => {
    for (const pathname of ['/me', '/settings', '/admin', '/team', '/team/gate']) {
      expect(decideProtectedNavigation(pathname, 'unavailable')).toEqual({ type: 'unavailable' });
    }
  });
});
