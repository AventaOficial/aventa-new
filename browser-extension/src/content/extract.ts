import { extractFromPage } from '../adapters/index';
import type { ContentExtractResponse, ContentMessage } from '../types/messages';

chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
  const message = request as ContentMessage;
  if (message.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'extractProduct') {
    try {
      const pageUrl = window.location.href;
      const data = extractFromPage(document, pageUrl);
      if (!data) {
        const res: ContentExtractResponse = {
          ok: false,
          error: 'Esta página no es un producto compatible de Amazon o Mercado Libre.',
        };
        sendResponse(res);
        return true;
      }
      const res: ContentExtractResponse = { ok: true, data };
      sendResponse(res);
    } catch {
      const res: ContentExtractResponse = {
        ok: false,
        error: 'No pudimos leer los datos de esta página.',
      };
      sendResponse(res);
    }
    return true;
  }

  return false;
});
