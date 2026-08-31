import { describe, it, expect } from 'vitest';
import { resolveSafeOAuthNext } from '../../lib/auth/safeOAuthNext';

describe('resolveSafeOAuthNext', () => {
  it('permite /', () => {
    expect(resolveSafeOAuthNext('/')).toBe('/');
  });

  it('permite /me', () => {
    expect(resolveSafeOAuthNext('/me')).toBe('/me');
  });

  it('permite /descubre', () => {
    expect(resolveSafeOAuthNext('/descubre')).toBe('/descubre');
  });

  it('permite rutas internas con query y hash', () => {
    expect(resolveSafeOAuthNext('/descubre?tab=guias')).toBe('/descubre?tab=guias');
    expect(resolveSafeOAuthNext('/me#recompensas')).toBe('/me#recompensas');
  });

  it('rechaza //evil.com', () => {
    expect(resolveSafeOAuthNext('//evil.com')).toBe('/');
  });

  it('rechaza https://evil.com', () => {
    expect(resolveSafeOAuthNext('https://evil.com')).toBe('/');
  });

  it('rechaza http://evil.com', () => {
    expect(resolveSafeOAuthNext('http://evil.com')).toBe('/');
  });

  it('rechaza null, vacío y valores sin slash inicial', () => {
    expect(resolveSafeOAuthNext(null)).toBe('/');
    expect(resolveSafeOAuthNext('')).toBe('/');
    expect(resolveSafeOAuthNext('evil.com')).toBe('/');
  });

  it('rechaza backslash y URLs absolutas camufladas', () => {
    expect(resolveSafeOAuthNext('/\\evil.com')).toBe('/');
    expect(resolveSafeOAuthNext('/https://evil.com')).toBe('/');
    expect(resolveSafeOAuthNext('/http://evil.com')).toBe('/');
  });
});
