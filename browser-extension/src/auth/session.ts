import type { ExtensionConfig, ExtensionSession } from '../types/messages';
import { CONFIG_STORAGE_KEY, SESSION_STORAGE_KEY } from '../types/messages';

export async function getStoredSession(): Promise<ExtensionSession | null> {
  const raw = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  const session = raw[SESSION_STORAGE_KEY] as ExtensionSession | undefined;
  if (!session?.accessToken || !session.refreshToken) return null;
  return session;
}

export async function setStoredSession(session: ExtensionSession | null): Promise<void> {
  if (!session) {
    await chrome.storage.local.remove(SESSION_STORAGE_KEY);
    return;
  }
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
}

export async function getExtensionConfig(): Promise<ExtensionConfig | null> {
  const raw = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  return (raw[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined) ?? null;
}

export async function setExtensionConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: config });
}

export function isSessionExpired(session: ExtensionSession, skewMs = 60_000): boolean {
  return Date.now() >= session.expiresAt - skewMs;
}

export function buildAuthUrl(aventaBase: string, extensionId: string): string {
  const url = new URL(`${aventaBase.replace(/\/$/, '')}/extension/auth`);
  url.searchParams.set('ext', extensionId);
  return url.href;
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([SESSION_STORAGE_KEY, CONFIG_STORAGE_KEY]);
}
