import { describe, expect, it } from 'vitest';
import { formatOfferMoneyInput, sanitizeOfferMoneyTyping } from '@/lib/formatPrice';
import { parseOfferEditMoney } from '@/lib/moderation/offerEditContract';

describe('formatOfferMoneyInput (display vs persistence)', () => {
  it.each([
    [0, expect.stringMatching(/^0/)],
    [10, expect.stringMatching(/10/)],
    [999, expect.stringMatching(/999/)],
    [1000, expect.stringMatching(/1.000|1,000/)],
    [15000, expect.stringMatching(/15.000|15,000/)],
    [19999.99, expect.stringMatching(/19.999,99|19,999\.99/)],
  ] as const)('formatea %s', (n, matcher) => {
    expect(formatOfferMoneyInput(n)).toEqual(matcher);
  });

  it('vacío / inválido → string vacío', () => {
    expect(formatOfferMoneyInput('')).toBe('');
    expect(formatOfferMoneyInput(null)).toBe('');
    expect(formatOfferMoneyInput(undefined)).toBe('');
    expect(formatOfferMoneyInput('abc')).toBe('');
  });

  it('display ≠ persistence: parse quita separadores', () => {
    const display = formatOfferMoneyInput(19999.99);
    expect(display).not.toBe('19999.99');
    const parsed = parseOfferEditMoney(display);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toBe(19999.99);
  });

  it('sanitizeOfferMoneyTyping permite edición parcial y paste', () => {
    expect(sanitizeOfferMoneyTyping('19,999.99')).toBe('19,999.99');
    expect(sanitizeOfferMoneyTyping('abc15000xyz')).toBe('15000');
    expect(sanitizeOfferMoneyTyping('12.3456')).toBe('12.34');
    expect(sanitizeOfferMoneyTyping('')).toBe('');
  });

  it('borrar valor → vacío; submit parseable', () => {
    expect(sanitizeOfferMoneyTyping('')).toBe('');
    expect(parseOfferEditMoney('').ok).toBe(false);
    expect(parseOfferEditMoney(formatOfferEditMoneyRoundtrip(1000))).toEqual({
      ok: true,
      value: 1000,
    });
  });
});

function formatOfferEditMoneyRoundtrip(n: number): string {
  return formatOfferMoneyInput(n);
}
