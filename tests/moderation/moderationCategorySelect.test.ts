import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_CATEGORIES, normalizeCategoryForStorage } from '@/lib/categories';

/**
 * El select de moderación usa `value={option.value}`.
 * Si el estado guarda label/legacy sin normalizar, el control aparece en blanco.
 */
function categorySelectValue(persisted: string | null | undefined): string {
  return normalizeCategoryForStorage(persisted) ?? '';
}

describe('moderation category select binding', () => {
  it('A. categoría válida → coincide con una option.value', () => {
    const value = categorySelectValue('tecnologia');
    expect(value).toBe('tecnologia');
    expect(ALL_CATEGORIES.some((c) => c.value === value)).toBe(true);
  });

  it('B. cambiar categoría → valor canónico persistible', () => {
    const next = categorySelectValue('moda');
    expect(next).toBe('moda');
    expect(normalizeCategoryForStorage(next)).toBe('moda');
  });

  it('C. categoría null → Sin categoría (value vacío)', () => {
    expect(categorySelectValue(null)).toBe('');
    expect(categorySelectValue(undefined)).toBe('');
    expect(categorySelectValue('')).toBe('');
  });

  it('D. legacy / label → mapea a option del catálogo', () => {
    expect(categorySelectValue('electronics')).toBe('tecnologia');
    expect(categorySelectValue('Tecnología')).toBe('tecnologia');
    expect(categorySelectValue('tecnología')).toBe('tecnologia');
    expect(categorySelectValue('technology')).toBe('tecnologia');
    expect(categorySelectValue('Videojuegos')).toBe('gaming');
    expect(categorySelectValue('other')).toBe('other');
  });

  it('E–H. formularios de edición normalizan al abrir (contrato de código)', () => {
    const detail = readFileSync(
      join(process.cwd(), 'app/admin/components/ModerationOfferDetail.tsx'),
      'utf8',
    );
    const sheet = readFileSync(
      join(process.cwd(), 'app/admin/components/ModerationFixSheet.tsx'),
      'utf8',
    );
    expect(detail).toContain('normalizeCategoryForStorage(offer.category)');
    expect(sheet).toContain('initialCategoryValue');
    expect(sheet).toContain('normalizeCategoryForStorage');
    // Submit sin modificar: dirty compara categorías normalizadas.
    expect(sheet).toMatch(/normalizeCategoryForStorage\(category\)/);
    expect(sheet).toMatch(/normalizeCategoryForStorage\(offer\.category/);
  });

  it('categoría desconocida → vacío (estado seguro, no "null" literal)', () => {
    expect(categorySelectValue('categoria-fantasma-xyz')).toBe('');
    expect(categorySelectValue('null')).toBe('');
  });
});
