import { describe, it, expect, vi } from 'vitest';
import {
  isValidChromeExtensionId,
  parseAllowedExtensionIds,
  isExtensionIdAllowlisted,
  runExtensionAuthBridge,
} from '../../lib/extension/allowedExtensionIds';

/** IDs Chrome válidos (32 × a–p) solo para tests. */
const LEGIT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EVIL_ID = 'ppppppppppppppppaaaaaaaaaaaaaaaa';
const OTHER_ID = 'cccccccccccccccccccccccccccccccc';

describe('P0-5 — parseAllowedExtensionIds / allowlist', () => {
  it('Test 1 — ID válido allowlisted', () => {
    expect(isExtensionIdAllowlisted(LEGIT_ID, LEGIT_ID)).toBe(true);
  });

  it('Test 2 — ID malicioso bloqueado', () => {
    expect(isExtensionIdAllowlisted(EVIL_ID, LEGIT_ID)).toBe(false);
  });

  it('Test 3 — ID arbitrario válido en formato pero no en lista', () => {
    expect(isExtensionIdAllowlisted(OTHER_ID, LEGIT_ID)).toBe(false);
  });

  it('Test 4 — ID vacío', () => {
    expect(isExtensionIdAllowlisted('', LEGIT_ID)).toBe(false);
  });

  it('Test 6 — allowlist ausente → fail closed', () => {
    expect(isExtensionIdAllowlisted(LEGIT_ID, undefined)).toBe(false);
    expect(isExtensionIdAllowlisted(LEGIT_ID, null)).toBe(false);
  });

  it('Test 7 — allowlist vacía → fail closed', () => {
    expect(isExtensionIdAllowlisted(LEGIT_ID, '')).toBe(false);
    expect(isExtensionIdAllowlisted(LEGIT_ID, '   ')).toBe(false);
  });

  it('Test 8 — espacios en CSV', () => {
    const parsed = parseAllowedExtensionIds(` ${LEGIT_ID} , ${OTHER_ID} `);
    expect(parsed).toEqual([LEGIT_ID, OTHER_ID]);
    expect(isExtensionIdAllowlisted(OTHER_ID, ` ${LEGIT_ID} , ${OTHER_ID} `)).toBe(true);
  });

  it('Test 9 — substring attack', () => {
    expect(isExtensionIdAllowlisted(`${LEGIT_ID}extra`, LEGIT_ID)).toBe(false);
    expect(isExtensionIdAllowlisted(`prefix${LEGIT_ID}`, LEGIT_ID)).toBe(false);
    // CSV includes no false positive via includes on raw string
    expect(parseAllowedExtensionIds(LEGIT_ID).includes(LEGIT_ID.slice(0, 16) as never)).toBe(
      false,
    );
  });

  it('Test 10 — wildcard no permite todo', () => {
    expect(parseAllowedExtensionIds('*')).toEqual([]);
    expect(isExtensionIdAllowlisted(LEGIT_ID, '*')).toBe(false);
    expect(isExtensionIdAllowlisted(LEGIT_ID, 'all')).toBe(false);
    expect(isExtensionIdAllowlisted(LEGIT_ID, '*,all,any')).toBe(false);
  });

  it('formato Chrome inválido', () => {
    expect(isValidChromeExtensionId('ABCDEF')).toBe(false);
    expect(isValidChromeExtensionId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
    expect(isValidChromeExtensionId(LEGIT_ID)).toBe(true);
  });
});

describe('P0-5 — runExtensionAuthBridge', () => {
  const config = {
    aventaBase: 'https://aventaofertas.com',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon',
  };

  const authedSession = {
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', email: 'u@example.com' },
  };

  it('Test 5 — parámetro ausente → BLOCK, sin sendMessage', async () => {
    const sendMessage = vi.fn();
    const result = await runExtensionAuthBridge({
      extensionId: '',
      allowedIdsEnv: LEGIT_ID,
      getSession: async () => authedSession,
      sendMessage,
      config,
    });
    expect(result).toEqual({ status: 'blocked', reason: 'missing_ext' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('Test 11/14 — autenticado + EVIL_ID → 0 sendMessage, sin leak', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true }));
    const getSession = vi.fn(async () => authedSession);
    const result = await runExtensionAuthBridge({
      extensionId: EVIL_ID,
      allowedIdsEnv: LEGIT_ID,
      getSession,
      sendMessage,
      config,
    });
    expect(result).toEqual({ status: 'blocked', reason: 'not_allowlisted' });
    expect(sendMessage).toHaveBeenCalledTimes(0);
    // Fail-closed: no se consulta sesión ni se arma payload con tokens
    expect(getSession).not.toHaveBeenCalled();
  });

  it('Test 12 — extensión legítima + sesión → sendMessage con payload', async () => {
    const sendMessage = vi.fn(async (_id, message) => {
      expect(_id).toBe(LEGIT_ID);
      const msg = message as {
        type: string;
        session: { accessToken: string; refreshToken: string };
      };
      expect(msg.type).toBe('AVENTA_EXTENSION_SESSION');
      expect(msg.session.accessToken).toBe('access-secret');
      expect(msg.session.refreshToken).toBe('refresh-secret');
      return { ok: true };
    });

    const result = await runExtensionAuthBridge({
      extensionId: LEGIT_ID,
      allowedIdsEnv: LEGIT_ID,
      getSession: async () => authedSession,
      sendMessage,
      config,
    });
    expect(result).toEqual({ status: 'success' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('Test 13 — anónimo + ID legit → login, sin sendMessage', async () => {
    const sendMessage = vi.fn();
    const result = await runExtensionAuthBridge({
      extensionId: LEGIT_ID,
      allowedIdsEnv: LEGIT_ID,
      getSession: async () => null,
      sendMessage,
      config,
    });
    expect(result).toEqual({ status: 'login' });
    expect(sendMessage).toHaveBeenCalledTimes(0);
  });

  it('Test 6 bridge — allowlist undefined → BLOCK', async () => {
    const sendMessage = vi.fn();
    const result = await runExtensionAuthBridge({
      extensionId: LEGIT_ID,
      allowedIdsEnv: undefined,
      getSession: async () => authedSession,
      sendMessage,
      config,
    });
    expect(result.status).toBe('blocked');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('Test 15 — errores no contienen tokens', async () => {
    const sendMessage = vi.fn(async () => null);
    const result = await runExtensionAuthBridge({
      extensionId: LEGIT_ID,
      allowedIdsEnv: LEGIT_ID,
      getSession: async () => authedSession,
      sendMessage,
      config,
    });
    expect(result.status).toBe('send_failed');
    expect(JSON.stringify(result)).not.toMatch(/access-secret|refresh-secret|accessToken|refreshToken/);
  });
});
