import { describe, expect, it } from 'vitest';
import { shortModerationQueueTitle } from '@/lib/moderation/queueTitle';

describe('shortModerationQueueTitle', () => {
  it('quita sufijo de ahorro del bot', () => {
    expect(
      shortModerationQueueTitle(
        'Silla Tolix 4 Pzas Comedor — Ahorra ~42% en Mercado Libre'
      )
    ).toBe('Silla Tolix 4 Pzas Comedor');
  });

  it('deja títulos limpios intactos', () => {
    expect(shortModerationQueueTitle('Audífonos Bluetooth')).toBe('Audífonos Bluetooth');
  });

  it('maneja vacío', () => {
    expect(shortModerationQueueTitle('')).toBe('Sin título');
    expect(shortModerationQueueTitle(null)).toBe('Sin título');
  });
});
