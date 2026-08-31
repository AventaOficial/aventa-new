import type { AuthBridgeMessage } from '../types/messages';
import { setExtensionConfig, setStoredSession } from '../auth/session';

function isAllowedSenderUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return host === 'aventaofertas.com' || host.endsWith('.aventaofertas.com');
  } catch {
    return false;
  }
}

function handleSessionMessage(message: AuthBridgeMessage, sendResponse: (r: unknown) => void): boolean {
  if (message?.type !== 'AVENTA_EXTENSION_SESSION') return false;
  if (!message.session?.accessToken || !message.config?.aventaBase) {
    sendResponse({ ok: false });
    return true;
  }

  void (async () => {
    await setExtensionConfig(message.config);
    await setStoredSession(message.session);
    sendResponse({ ok: true });
  })();

  return true;
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSenderUrl(sender.url)) {
    sendResponse({ ok: false, error: 'forbidden_origin' });
    return true;
  }
  return handleSessionMessage(message as AuthBridgeMessage, sendResponse);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as { type?: string })?.type === 'AVENTA_LOGOUT') {
    void (async () => {
      await setStoredSession(null);
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});
