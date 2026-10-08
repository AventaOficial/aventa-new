import { describe, expect, it } from 'vitest';
import { contributionCount, identityKeys, sameContribution, type ContributionOffer } from '@/lib/owner/contributionIdentity';

function row(partial: Partial<ContributionOffer> & Pick<ContributionOffer, 'id'>): ContributionOffer {
  return {
    productFingerprint: null,
    offerUrl: null,
    ingestionIdentityKey: null,
    ...partial,
  };
}

const AMAZON = 'https://www.amazon.com.mx/dp/B00TEST123';
const AMAZON_TAG = 'https://www.amazon.com.mx/dp/B00TEST123?tag=aventa-20';
const OTHER = 'https://www.amazon.com.mx/dp/B00TEST456';

describe('contribution identity', () => {
  it('A. fingerprint y la misma URL son una contribución', () => {
    const a = row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON });
    const b = row({ id: 'b', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON_TAG });
    expect(sameContribution(a, b)).toBe(true);
  });

  it('B. sin fingerprint, la misma URL sigue siendo una contribución', () => {
    const a = row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON });
    const b = row({ id: 'b', productFingerprint: null, offerUrl: AMAZON_TAG });
    expect(sameContribution(a, b)).toBe(true);
  });

  it('C. el mismo fingerprint con otra URL es una contribución', () => {
    const a = row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON });
    const b = row({ id: 'b', productFingerprint: 'amz:B00TEST123', offerUrl: 'https://tienda.example/p/otro' });
    expect(sameContribution(a, b)).toBe(true);
  });

  it('D. fingerprint distinto y URL distinta son dos contribuciones', () => {
    const a = row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON });
    const b = row({ id: 'b', productFingerprint: 'amz:B00TEST456', offerUrl: OTHER });
    expect(sameContribution(a, b)).toBe(false);
    expect(contributionCount([a, b])).toBe(2);
  });

  it('E. sin fingerprint y con URL distinta son dos contribuciones', () => {
    const a = row({ id: 'a', offerUrl: 'https://tienda.example/p/uno' });
    const b = row({ id: 'b', offerUrl: 'https://tienda.example/p/dos' });
    expect(sameContribution(a, b)).toBe(false);
  });

  it('F. sin señal usable cada oferta queda sola', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    expect(identityKeys(a)).toEqual(['id:a']);
    expect(sameContribution(a, b)).toBe(false);
  });

  it('G. reenviar un rechazo del mismo producto no abre otra contribución', () => {
    const rows = [
      row({ id: 'a', productFingerprint: null, offerUrl: AMAZON }),
      row({ id: 'b', productFingerprint: null, offerUrl: AMAZON_TAG }),
      row({ id: 'c', productFingerprint: 'amz:B00TEST123', offerUrl: null }),
    ];
    expect(contributionCount(rows)).toBe(1);
  });

  it('H. reenviar una oferta aprobada del mismo producto no abre otra contribución', () => {
    const rows = [
      row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON }),
      row({ id: 'b', ingestionIdentityKey: 'amz:B00TEST123', offerUrl: OTHER }),
    ];
    expect(contributionCount(rows)).toBe(1);
  });

  it('I. varios reintentos del mismo producto siguen siendo una contribución', () => {
    const rows = [
      row({ id: 'a', offerUrl: AMAZON }),
      row({ id: 'b', offerUrl: AMAZON_TAG }),
      row({ id: 'c', productFingerprint: 'amz:B00TEST123' }),
      row({ id: 'd', ingestionIdentityKey: 'amz:B00TEST123', offerUrl: 'https://tienda.example/p/atajo' }),
    ];
    expect(contributionCount(rows)).toBe(1);
  });

  it('J. dos productos distintos siguen distintos', () => {
    const rows = [
      row({ id: 'a', productFingerprint: 'amz:B00TEST123', offerUrl: AMAZON }),
      row({ id: 'b', productFingerprint: 'amz:B00TEST456', offerUrl: OTHER }),
    ];
    expect(contributionCount(rows)).toBe(2);
  });

  it('no funde dos señales que no comparten token', () => {
    const a = row({ id: 'a', productFingerprint: 'ABC' });
    const b = row({ id: 'b', offerUrl: 'https://tienda.example/p/xyz' });
    expect(sameContribution(a, b)).toBe(false);
  });
});
