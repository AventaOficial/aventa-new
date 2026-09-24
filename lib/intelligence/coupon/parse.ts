import { canonicalCouponKey, normalizeCouponCode, normalizeCouponStore } from '@/lib/intelligence/coupon/identity';
import {
  COUPON_CONFIDENCE_CEILING,
  type CouponAppliesTo,
  type CouponDiscountType,
  type CouponDraft,
  type CouponSourceClass,
} from '@/lib/intelligence/coupon/types';

function amount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function currencyOf(line: string): string | null {
  if (/\bmxn\b/i.test(line)) return 'MXN';
  if (/\busd\b/i.test(line)) return 'USD';
  return null;
}

function expiryFrom(text: string, now: Date): string | null {
  if (/mañana/i.test(text)) return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 0));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function splitBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseBlock(block: string, now: Date, sourceClass: CouponSourceClass): CouponDraft {
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.match(/^([^:]{2,40}):\s*$/);
  const store = normalizeCouponStore(header?.[1] ?? lines.find((line) => /^tienda\s*:/i.test(line))?.split(':').slice(1).join(':'));
  const codeLine = lines.find((line) => /c[oó]digo\s*:/i.test(line));
  const codeRaw = codeLine?.split(/c[oó]digo\s*:/i)[1] ?? null;
  const code = normalizeCouponCode(codeRaw);
  const sourceUrl = block.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,)]+$/g, '') ?? null;

  let discountType: CouponDiscountType = 'unknown';
  let discountValue: number | null = null;
  let maxDiscount: number | null = null;
  let minimumPurchase: number | null = null;
  let currency: string | null = null;

  if (/env[ií]o\s+gratis/i.test(block)) discountType = 'free_shipping';
  if (/2\s*x\s*1/i.test(block)) discountType = 'bogo';

  for (const line of lines) {
    const lineCurrency = currencyOf(line);
    if (lineCurrency && currency && lineCurrency !== currency) {
      return failed(block, sourceClass, 'currency_mixed');
    }
    if (lineCurrency) currency = lineCurrency;

    if (/m[ií]nimo/i.test(line)) {
      const money = line.match(/\$\s*([\d.,]+)/);
      minimumPurchase = money ? amount(money[1] ?? '') : minimumPurchase;
      continue;
    }
    if (/m[aá]ximo|hasta\s+\$/i.test(line)) {
      const money = line.match(/\$\s*([\d.,]+)/);
      maxDiscount = money ? amount(money[1] ?? '') : maxDiscount;
      continue;
    }
    const percent = line.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (percent && discountType !== 'free_shipping' && discountType !== 'bogo') {
      discountType = 'percent';
      discountValue = Number(percent[1]?.replace(',', '.'));
      continue;
    }
    if (/descuento|cup[oó]n|off/i.test(line) && discountType !== 'percent' && discountType !== 'bogo' && discountType !== 'free_shipping') {
      const money = line.match(/\$\s*([\d.,]+)/);
      const parsed = money ? amount(money[1] ?? '') : null;
      if (parsed != null) {
        discountType = 'fixed';
        discountValue = parsed;
      }
    }
  }

  let appliesTo: CouponAppliesTo = 'unknown';
  const restrictions: string[] = [];
  if (/solo productos seleccionados|productos seleccionados/i.test(block)) {
    appliesTo = 'product';
    restrictions.push('solo productos seleccionados');
  } else if (/categor[ií]a/i.test(block)) {
    appliesTo = 'category';
    restrictions.push(lines.find((line) => /categor[ií]a/i.test(line)) ?? 'categoría mencionada');
  } else if (/toda la tienda|en toda/i.test(block)) {
    appliesTo = 'store';
  } else if (store && discountType !== 'unknown') {
    appliesTo = 'unknown';
  }

  if (codeRaw && !code) return failed(block, sourceClass, 'malformed_code');
  if (!code) return failed(block, sourceClass, 'code_missing');
  if (!store) return failed(block, sourceClass, 'store_missing');

  const canonicalKey = canonicalCouponKey({ store, code, discountType, appliesTo });
  return {
    ok: true,
    reason: null,
    store,
    code,
    discountType,
    discountValue,
    maxDiscount,
    minimumPurchase,
    currency,
    appliesTo,
    restrictions: restrictions.length ? restrictions.join('; ') : null,
    expiresAt: expiryFrom(block, now),
    sourceUrl,
    canonicalKey,
    sourceClass,
    confidence: COUPON_CONFIDENCE_CEILING[sourceClass],
    raw: block.slice(0, 500),
  };
}

function failed(raw: string, sourceClass: CouponSourceClass, reason: string): CouponDraft {
  return {
    ok: false,
    reason,
    store: null,
    code: null,
    discountType: 'unknown',
    discountValue: null,
    maxDiscount: null,
    minimumPurchase: null,
    currency: null,
    appliesTo: 'unknown',
    restrictions: null,
    expiresAt: null,
    sourceUrl: null,
    canonicalKey: null,
    sourceClass,
    confidence: 0,
    raw: raw.slice(0, 500),
  };
}

export function parseCouponPaste(
  text: string,
  opts?: { now?: Date; sourceClass?: CouponSourceClass },
): { drafts: CouponDraft[]; failures: CouponDraft[] } {
  const now = opts?.now ?? new Date();
  const sourceClass = opts?.sourceClass ?? 'user_paste';
  const seen = new Set<string>();
  const drafts: CouponDraft[] = [];
  const failures: CouponDraft[] = [];
  for (const block of splitBlocks(text)) {
    const parsed = parseBlock(block, now, sourceClass);
    if (!parsed.ok || !parsed.canonicalKey) {
      failures.push(parsed);
      continue;
    }
    if (seen.has(parsed.canonicalKey)) continue;
    seen.add(parsed.canonicalKey);
    drafts.push(parsed);
  }
  return { drafts, failures };
}
