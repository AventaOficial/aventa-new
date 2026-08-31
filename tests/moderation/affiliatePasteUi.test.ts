import { describe, expect, it } from 'vitest';
import { initialAffiliatePasteUi } from '@/lib/moderation/affiliatePasteUi';

describe('initialAffiliatePasteUi', () => {
  it('limpia paste y validación al cambiar de oferta', () => {
    expect(initialAffiliatePasteUi(false)).toEqual({
      affiliatePaste: '',
      pasteStatus: 'idle',
      pasteValidation: null,
      pasteError: null,
    });
  });

  it('mantiene estado valid si la oferta ya tiene link_mod_ok', () => {
    expect(initialAffiliatePasteUi(true).pasteStatus).toBe('valid');
    expect(initialAffiliatePasteUi(true).affiliatePaste).toBe('');
  });
});
