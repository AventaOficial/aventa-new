import { describe, expect, it } from 'vitest';
import {
  amazonEvidenceFingerprint,
  detectAmazonReportType,
  parseAmazonAssociatesReport,
  parseAmazonReportDate,
  summarizeAmazonEvidence,
} from '@/lib/finance/evidence/amazonReport';

const EARNINGS_EN = [
  'Category,Name,ASIN,Seller,Tracking ID,Date Shipped,Price($),Items Shipped,Returns,Revenue($),Ad Fees($),Device Type Group,Direct/Indirect',
  'Electronics,"Audífonos, Bluetooth",B0TEST0001,Amazon.com.mx,aventa-cap-20,September 15 2026,1299.00,1,0,1299.00,51.96,Desktop,Direct',
  'Home,Licuadora,B0TEST0002,Amazon.com.mx,aventa-cap-20,09/16/2026,899.00,2,0,1798.00,53.94,Mobile,Indirect',
  'Home,Licuadora,B0TEST0002,Amazon.com.mx,aventa-cap-20,09/16/2026,899.00,2,0,1798.00,53.94,Mobile,Indirect',
  'Toys,Devuelto,B0TEST0003,Amazon.com.mx,aventa-cap-20,09/17/2026,500.00,0,1,-500.00,-20.00,Mobile,Direct',
  ',,,,,,,,,Total,139.84,,',
].join('\n');

const EARNINGS_ES = [
  'Reporte de ganancias',
  'Categoría,Nombre,ASIN,Vendedor,ID de seguimiento,Fecha de envío,Precio,Artículos enviados,Devoluciones,Ingresos,Comisiones',
  'Hogar,Sartén,B0ES000001,Amazon,aventa-x-20,15 de septiembre de 2026,"1,250.50",1,0,"1,250.50",50.02',
].join('\n');

const ORDERS_EN = [
  'Category,Name,ASIN,Seller,Tracking ID,Date,Qty,Price($),Link Type,Indirect Sales,Device Type Group',
  'Electronics,Cable USB-C,B0ORD00001,Amazon.com.mx,aventa-cap-20,2026-09-18,3,150.00,Text,No,Mobile',
].join('\n');

describe('amazonReport — detección y parseo', () => {
  it('detecta earnings (EN) y crea huellas únicas incluso con filas duplicadas', () => {
    const r = parseAmazonAssociatesReport(EARNINGS_EN);
    expect(r.type).toBe('earnings');
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(4); // total row skipped (sin ASIN)
    expect(r.skipped).toBe(1);
    const ids = new Set(r.rows.map((x) => x.externalId));
    expect(ids.size).toBe(4);
    expect(r.rows[0]).toMatchObject({
      asin: 'B0TEST0001',
      trackingId: 'aventa-cap-20',
      quantity: 1,
      feesCents: 5196,
      revenueCents: 129900,
      kind: 'shipped_earning',
    });
    expect(r.rows[0].occurredAt.startsWith('2026-09-15')).toBe(true);
    expect(r.rows[1].occurredAt.startsWith('2026-09-16')).toBe(true);
    expect(r.rows[3].kind).toBe('return');
    expect(r.rows[3].feesCents).toBe(-2000);
  });

  it('parsea reporte ES con título previo y montos con coma de miles', () => {
    const r = parseAmazonAssociatesReport(EARNINGS_ES);
    expect(r.type).toBe('earnings');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].feesCents).toBe(5002);
    expect(r.rows[0].revenueCents).toBe(125050);
    expect(r.rows[0].occurredAt.startsWith('2026-09-15')).toBe(true);
  });

  it('detecta orders y no genera comisión', () => {
    const r = parseAmazonAssociatesReport(ORDERS_EN);
    expect(r.type).toBe('orders');
    expect(r.rows[0]).toMatchObject({ kind: 'ordered', quantity: 3, feesCents: null, priceCents: 15000 });
  });

  it('rechaza CSV no reconocidos', () => {
    expect(parseAmazonAssociatesReport('foo,bar\n1,2').error).toBeTruthy();
    expect(parseAmazonAssociatesReport('').error).toBe('CSV vacío');
    expect(detectAmazonReportType(['a', 'b'])).toBeNull();
  });

  it('la huella es determinista y sensible al contenido', () => {
    const base = {
      type: 'earnings' as const,
      trackingId: 'T',
      asin: 'A',
      occurredAt: '2026-09-15T00:00:00.000Z',
      quantity: 1,
      revenueCents: 100,
      feesCents: 4,
      occurrence: 1,
    };
    expect(amazonEvidenceFingerprint(base)).toBe(amazonEvidenceFingerprint({ ...base }));
    expect(amazonEvidenceFingerprint(base)).not.toBe(amazonEvidenceFingerprint({ ...base, occurrence: 2 }));
    expect(amazonEvidenceFingerprint(base)).not.toBe(amazonEvidenceFingerprint({ ...base, feesCents: 5 }));
    expect(amazonEvidenceFingerprint(base).startsWith('amz-rep:earnings:')).toBe(true);
  });

  it('resumen agrega comisiones positivas/negativas y tracking', () => {
    const r = parseAmazonAssociatesReport(EARNINGS_EN);
    const s = summarizeAmazonEvidence(r.rows);
    expect(s.feesCents).toBe(5196 + 5394 + 5394);
    expect(s.negativeFeesCents).toBe(-2000);
    expect(s.withTracking).toBe(4);
    expect(s.trackingIds).toEqual(['aventa-cap-20']);
    expect(s.returns).toBe(1);
  });
});

describe('parseAmazonReportDate', () => {
  it('soporta ISO, inglés, español y dd/mm-mm/dd', () => {
    expect(parseAmazonReportDate('2026-09-15')?.iso?.slice(0, 10)).toBe('2026-09-15');
    expect(parseAmazonReportDate('September 15, 2026').iso?.slice(0, 10)).toBe('2026-09-15');
    expect(parseAmazonReportDate('15 de septiembre de 2026').iso?.slice(0, 10)).toBe('2026-09-15');
    expect(parseAmazonReportDate('25/09/2026')).toEqual({ iso: '2026-09-25T00:00:00.000Z', ambiguous: false });
    expect(parseAmazonReportDate('09/25/2026')).toEqual({ iso: '2026-09-25T00:00:00.000Z', ambiguous: false });
    const amb = parseAmazonReportDate('03/04/2026');
    expect(amb.ambiguous).toBe(true);
    expect(amb.iso?.slice(0, 10)).toBe('2026-03-04');
    expect(parseAmazonReportDate('nope').iso).toBeNull();
  });
});
