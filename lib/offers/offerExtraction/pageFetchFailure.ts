/**
 * Clasificación de fallos al descargar la página de producto.
 * El pipeline de máquina decide con esto si el candidato se descarta (permanente),
 * se libera para un envío posterior (transitorio) o queda para revisión humana (bloqueo).
 */

export type PageFetchFailure =
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'TIMEOUT'
  | 'BLOCKED'
  | 'NOT_HTML'
  | 'TOO_LARGE';

export type PageFetchFailureClass = 'permanent' | 'transient' | 'blocked';

/** Las páginas de producto de retailers MX llegan a ~2.5 MB; más que esto no es una PDP. */
export const MAX_PRODUCT_HTML_BYTES = 8 * 1024 * 1024;

export function classifyHttpStatus(status: number): PageFetchFailure | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404 || status === 410) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_UNAVAILABLE';
  return 'BLOCKED';
}

export function pageFetchFailureClass(failure: PageFetchFailure | null | undefined): PageFetchFailureClass | null {
  switch (failure) {
    case 'NOT_FOUND':
    case 'NOT_HTML':
    case 'TOO_LARGE':
      return 'permanent';
    case 'RATE_LIMITED':
    case 'UPSTREAM_UNAVAILABLE':
    case 'TIMEOUT':
      return 'transient';
    case 'BLOCKED':
      return 'blocked';
    default:
      return null;
  }
}

/** Sin content-type se intenta leer: varios retailers MX lo omiten en la PDP. */
export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  return type === 'text/html' || type === 'application/xhtml+xml' || type === 'text/plain' || type.endsWith('/xml');
}

export async function readHtmlCapped(
  response: Response,
  maxBytes: number = MAX_PRODUCT_HTML_BYTES,
): Promise<{ ok: true; html: string } | { ok: false; failure: 'NOT_HTML' | 'TOO_LARGE' }> {
  if (!isHtmlContentType(response.headers.get('content-type'))) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, failure: 'NOT_HTML' };
  }
  return readTextCapped(response, maxBytes);
}

/** Endpoint JSON público de una tienda. Un cuerpo que no es JSON se descarta. */
export async function readJsonCapped(response: Response, maxBytes: number): Promise<unknown> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const body = await readTextCapped(response, maxBytes);
  if (!body.ok) return null;
  try {
    return JSON.parse(body.html) as unknown;
  } catch {
    return null;
  }
}

async function readTextCapped(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; html: string } | { ok: false; failure: 'TOO_LARGE' }> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, failure: 'TOO_LARGE' };
  }
  if (!response.body) return { ok: true, html: await response.text() };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let html = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, failure: 'TOO_LARGE' };
    }
    html += decoder.decode(value, { stream: true });
  }
  return { ok: true, html: html + decoder.decode() };
}
