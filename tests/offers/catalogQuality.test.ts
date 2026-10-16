import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assessCategoryConsistency,
  applyCatalogPreventOnIngest,
  assessCatalogOfferRow,
  buildCatalogQualityReport,
  sanitizeOriginalPriceForIngest,
} from '@/lib/offers/catalogQuality';
import type { CatalogOfferRow } from '@/lib/offers/catalogQuality';

describe('catalogQuality category', () => {
  it('perfume en servicios: conflicto confirmado', () => {
    const r = assessCategoryConsistency({
      title: 'Acqua di Parma Colonia',
      category: 'servicios',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('confirmed');
      expect(r.inferred).toBe('belleza');
    }
  });

  it('pasta dental en jardín: conflicto confirmado', () => {
    const r = assessCategoryConsistency({
      title: 'Pasta dental Colgate Total',
      category: 'jardin',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.inferred).toBe('belleza');
  });

  it('hub USB con categoría tecnología se conserva (palabra ambigua servicios)', () => {
    const r = assessCategoryConsistency({
      title: 'Hub USB-C 7 en 1 HDMI',
      category: 'tecnologia',
    });
    expect(r.ok).toBe(true);
  });

  it('categoría válida sin regla fuerte no se fuerza', () => {
    const r = assessCategoryConsistency({
      title: 'Arroz integral 1kg',
      category: 'supermercado',
    });
    expect(r.ok).toBe(true);
  });
});

describe('catalogQuality prices', () => {
  it('original sin procedencia bot: se descarta al ingestar', () => {
    const s = sanitizeOriginalPriceForIngest({
      price: 500,
      originalPrice: 900,
      provenance: 'unknown',
    });
    expect(s.originalPrice).toBeNull();
    expect(s.dropped).toBe(true);
  });

  it('centavos legítimos se conservan', () => {
    const s = sanitizeOriginalPriceForIngest({
      price: 163.5,
      originalPrice: 189.99,
      provenance: 'declared_by_publisher',
    });
    expect(s.originalPrice).toBe(189.99);
    expect(s.dropped).toBe(false);
  });

  it('comparación válida con procedencia explícita se conserva', () => {
    const s = sanitizeOriginalPriceForIngest({
      price: 800,
      originalPrice: 1000,
      provenance: 'source_explicit',
    });
    expect(s.originalPrice).toBe(1000);
  });

  it('descuento alto solo declarado por comunidad se descarta', () => {
    const s = sanitizeOriginalPriceForIngest({
      price: 500,
      originalPrice: 1200,
      provenance: 'declared_by_publisher',
    });
    expect(s.originalPrice).toBeNull();
    expect(s.reason).toBe('high_discount_declared_only');
  });
});

describe('catalogQuality prevention on ingest', () => {
  it('corrige categoría confirmada en ingest', () => {
    const p = applyCatalogPreventOnIngest({
      title: 'Perfume Chanel',
      store: 'Liverpool',
      category: 'servicios',
      price: 2000,
      originalPrice: null,
      source: 'bot',
    });
    expect(p.category).toBe('belleza');
    expect(p.categoryCorrected).toBe(true);
  });
});

describe('catalogQuality diagnosis report', () => {
  it('genera reporte reproducible desde fixtures sin mutar datos', () => {
    const path = join(process.cwd(), 'tests/fixtures/catalog-quality-sample.json');
    const rows = JSON.parse(readFileSync(path, 'utf8')) as CatalogOfferRow[];
    const a = buildCatalogQualityReport({
      rows,
      dataSource: 'fixtures',
      limitation: 'test',
      sampleLimit: 10,
    });
    const b = buildCatalogQualityReport({
      rows,
      dataSource: 'fixtures',
      limitation: 'test',
      sampleLimit: 10,
    });
    expect(a.inspected).toBe(rows.length);
    expect(a.withFindings).toBeGreaterThan(0);
    expect(a.byType.category_mismatch).toBeGreaterThan(0);
    expect(JSON.stringify(a.samples)).toBe(JSON.stringify(b.samples));
  });

  it('distingue confirmado vs revisión en filas', () => {
    const perfume = assessCatalogOfferRow({
      id: 'x',
      title: 'Acqua di Parma',
      category: 'servicios',
      price: 100,
      original_price: null,
    });
    expect(perfume.findings.some((f) => f.type === 'category_mismatch' && f.kind === 'confirmed')).toBe(
      true,
    );
  });

  it('datos vacíos no lanzan error', () => {
    const r = buildCatalogQualityReport({
      rows: [{ id: 'empty', title: '', category: null, price: 0 }],
      dataSource: 'stdin',
      limitation: null,
      sampleLimit: 5,
    });
    expect(r.inspected).toBe(1);
  });
});
