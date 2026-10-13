import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { savingEvidence } from '@/lib/despensa/evidence';
import {
  checkProfecoHeader,
  importProfecoLines,
  matchProfecoReferences,
  normalizeProfecoRow,
  parseCsvLine,
  PROFECO_QQP,
  profecoReferenceLabel,
  resourcePeriod,
} from '@/lib/despensa/references/profecoQqp';

// Filas reales de b07_2026_q1.csv (Profeco QQP, datos.gob.mx, CC BY 4.0), leídas el 13-oct-2026.
const HEADER = '\uFEFFproducto,presentacion,marca,categoria,catalogo,precio,fecha_registro,cadena_comercial,giro,nombre_comercial,direccion,estado,municipio,latitud,longitud';
const BA = 'Bodega Aurrera,Supermercado / Tienda de Autoservicio,Bodega Aurrera,Convencion 1914 Pte. 1101. Entre a. de los Arellano y Gpe.. Col. Guadalupe. Cp. 20180,Aguascalientes,Aguascalientes,21.886051,-102.312284';
const OXXO = 'Oxxo,Tienda de Conveniencia,Oxxo Sucursal Morelos 2,Jose Maria Morelos y Pavon 222. Entre Ignacio Allende y Francisco I. Madero. a Un Costado de Radio Grupo. Col. Centro. Cp. 20000,Aguascalientes,Aguascalientes,21.882488,-102.29496';
const OXXO2 = 'Oxxo,Tienda de Conveniencia,Oxxo Sucursal Montoro Aguascalientes,Juan de Montoro 201. Esquina Dr. Jesus Diaz de Leon. Col. Centro. Cp. 20000,Aguascalientes,Aguascalientes,21.880795,-102.294251';
const LINES = [
  HEADER,
  `Arroz,Bolsa 900 Gr. Super Extra,Aurrera,Arroz y Cereales Preparados,PACIC,14.0,2026-07-01,${BA}`,
  `Frijol,Bolsa 900 Gr. Negro,Aurrera,Legumbres Secas,PACIC,20.0,2026-07-01,${BA}`,
  `Frijol,Bolsa 1 Kg. Negro,Verde Valle,Legumbres Secas,Básicos,42.0,2026-07-01,${BA}`,
  `Aceite,Botella 946 Ml. Canola,Canoil,Aceites y Grasas Veg. Comestibles,Básicos,38.0,2026-07-01,${BA}`,
  // El mismo registro aparece en dos catálogos (Básicos y PACIC): cuenta una vez.
  `Aceite,Botella 946 Ml. Canola,Canoil,Aceites y Grasas Veg. Comestibles,PACIC,38.0,2026-07-01,${BA}`,
  `Huevo,Paquete C/12 Rojo,Bachoco,Huevo,Básicos,39.0,2026-07-01,${BA}`,
  `Leche Pasteurizada,Caja 1 Lt. Entera,Lala,Leche Fresca,Básicos,33.5,2026-07-01,${OXXO}`,
  `Leche Pasteurizada,Caja 1 Lt. Entera,Lala,Leche Fresca,Básicos,32.0,2026-07-01,${OXXO2}`,
  // Productos que se parecen a una necesidad pero no lo son: fuera.
  `Leche Condensada,Lata 375 Gr.,La Lechera. Original,Leche Procesada,Básicos,26.0,2026-07-01,${BA}`,
  `Frijoles,Bolsa 430 Gr. Refritos. Negros,Isadora,Frutas y Legumbres Procesadas,Básicos,17.0,2026-07-01,${BA}`,
  `Tortilla de Maíz,1 Kg. Granel,S/M,Tortillas y Derivados del Maíz,Básicos,13.5,2026-07-01,${BA}`,
  `"Diclofenaco. Vitaminas B1, B6 y B12",Caja o Frasco con 30 Grageas,S/M,Medicamentos,Medicamentos,53.0,2026-07-01,${BA}`,
];
const REVISION = {
  url: 'https://repodatos.atdt.gob.mx/api_update/profeco/programa_quien_es_quien_precios_2026/b07_2026_q1.csv',
  lastModified: '2026-09-22T00:14:32.741989',
};

describe('Profeco QQP: esquema y lectura', () => {
  it('valida el encabezado oficial (con BOM) y rechaza uno distinto', () => {
    expect(checkProfecoHeader(HEADER)).toEqual({ ok: true });
    const bad = checkProfecoHeader('producto,presentacion,precio');
    expect(bad.ok).toBe(false);
  });

  it('lee comillas con comas y rechaza comillas sin cerrar', () => {
    expect(parseCsvLine('"Diclofenaco. Vitaminas B1, B6 y B12",Caja,S/M')).toEqual(['Diclofenaco. Vitaminas B1, B6 y B12', 'Caja', 'S/M']);
    expect(parseCsvLine('a,"b ""c""",d')).toEqual(['a', 'b "c"', 'd']);
    expect(parseCsvLine('a,"sin cerrar')).toBeNull();
  });

  it('el periodo sale del nombre del recurso', () => {
    expect(resourcePeriod(REVISION.url)).toEqual({ year: 2026, month: 7, part: 1 });
    expect(resourcePeriod('otro.csv')).toBeNull();
  });

  it('normaliza producto, variante, presentación y marca con el lector de Aventa', () => {
    const row = (l: string) => normalizeProfecoRow(parseCsvLine(l), { year: 2026, month: 7 });
    expect(row(LINES[2])).toMatchObject({
      ok: true,
      row: { needId: 'alimentos.frijol', variantId: 'negro', presentationKey: 'mass:900:-', brand: 'Aurrera', chainLabel: 'Bodega Aurrera', price: 20 },
    });
    expect(row(LINES[1])).toMatchObject({ ok: true, row: { needId: 'alimentos.arroz', variantId: 'blanco', presentationKey: 'mass:900:-' } });
    expect(row(LINES[6])).toMatchObject({ ok: true, row: { needId: 'alimentos.huevo', presentationKey: 'count:12:pieza' } });
    expect(row(LINES[7])).toMatchObject({ ok: true, row: { needId: 'alimentos.leche', variantId: 'entera', presentationKey: 'volume:1000:-' } });
    expect(row(LINES[11])).toMatchObject({ ok: true, row: { brand: null } });
  });

  it('rechaza con motivo: fuera del mapa, precio, fecha, periodo, columnas', () => {
    const row = (l: string, period = { year: 2026, month: 7 }) => normalizeProfecoRow(parseCsvLine(l), period);
    expect(row(LINES[9])).toEqual({ ok: false, reason: 'not_in_catalog_map' });
    expect(row(LINES[10])).toEqual({ ok: false, reason: 'not_in_catalog_map' });
    expect(row(LINES[2].replace(',20.0,', ',0,'))).toEqual({ ok: false, reason: 'invalid_price' });
    expect(row(LINES[2].replace(',20.0,', ',abc,'))).toEqual({ ok: false, reason: 'invalid_price' });
    expect(row(LINES[2].replace('2026-07-01', '01/07/2026'))).toEqual({ ok: false, reason: 'invalid_date' });
    expect(row(LINES[2], { year: 2026, month: 6 })).toEqual({ ok: false, reason: 'date_outside_period' });
    expect(row('Frijol,Bolsa 900 Gr. Negro,Aurrera')).toEqual({ ok: false, reason: 'column_count' });
    expect(normalizeProfecoRow(null, null)).toEqual({ ok: false, reason: 'malformed_row' });
    expect(row(LINES[2].replace('Bolsa 900 Gr. Negro', 'Bolsa Negro'))).toEqual({ ok: false, reason: 'presentation_unreadable' });
  });
});

describe('Profeco QQP: importación', () => {
  it('agrega por producto, marca, cadena y municipio con procedencia y fecha', async () => {
    const r = await importProfecoLines(LINES, REVISION);
    expect(r.header).toEqual({ ok: true });
    expect(r.rows).toBe(12);
    expect(r.rejected).toEqual({ not_in_catalog_map: 3 });
    expect(r.accepted).toBe(9);

    const aceite = r.references.find((x) => x.needId === 'alimentos.aceite');
    expect(aceite).toMatchObject({ observations: 1, establishments: 1, medianPrice: 38 });

    const leche = r.references.find((x) => x.needId === 'alimentos.leche');
    expect(leche).toMatchObject({
      source: 'profeco_qqp',
      chainLabel: 'Oxxo',
      municipio: 'Aguascalientes',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-01',
      currency: 'MXN',
      minPrice: 32,
      medianPrice: 32.75,
      maxPrice: 33.5,
      observations: 2,
      establishments: 2,
      sourceResourceUrl: REVISION.url,
      sourceRevision: REVISION.lastModified,
      parserVersion: PROFECO_QQP.parserVersion,
      license: 'CC-BY-4.0',
    });
    // Dos presentaciones de frijol no se mezclan.
    expect(r.references.filter((x) => x.needId === 'alimentos.frijol').map((x) => x.presentationKey).sort()).toEqual(['mass:1000:-', 'mass:900:-']);
  });

  it('reprocesar el mismo recurso y revisión da exactamente las mismas llaves', async () => {
    const a = await importProfecoLines(LINES, REVISION);
    const b = await importProfecoLines([...LINES].reverse().filter((l) => l !== HEADER).reduce((acc, l) => [...acc, l], [HEADER]), REVISION);
    expect(b.references.map((x) => x.idempotencyKey)).toEqual(a.references.map((x) => x.idempotencyKey));
    expect(b.references).toEqual(a.references);
    expect(new Set(a.references.map((x) => x.idempotencyKey)).size).toBe(a.references.length);

    // Una revisión nueva del recurso (Profeco puede corregir datos) es otra llave: no pisa la anterior.
    const revised = await importProfecoLines(LINES, { ...REVISION, lastModified: '2026-10-01T00:00:00' });
    expect(revised.references[0].idempotencyKey).not.toBe(a.references[0].idempotencyKey);
  });

  it('un encabezado distinto detiene la importación sin procesar filas', async () => {
    const r = await importProfecoLines(['producto,precio', ...LINES.slice(1)], REVISION);
    expect(r.header.ok).toBe(false);
    expect(r.rows).toBe(0);
    expect(r.references).toEqual([]);
  });
});

describe('Profeco QQP: uso como referencia, nunca como ahorro', () => {
  it('la etiqueta dice de quién es el dato y de cuándo, sin hablar de ahorro', () => {
    const label = profecoReferenceLabel({ medianPrice: 32.75, periodEnd: '2026-07-01', chainLabel: 'Oxxo', municipio: 'Aguascalientes', estado: 'Aguascalientes' });
    expect(label).toMatch(/^Referencia publicada por Profeco \(QQP\), 1 jul 2026/);
    expect(label).toContain('$32.75');
    expect(label).not.toMatch(/ahorr|verificad|captur/i);
  });

  it('solo se compara con ofertas del mismo producto, presentación y marca', async () => {
    const { references } = await importProfecoLines(LINES, REVISION);
    expect(matchProfecoReferences('Frijol negro Aurrera 900 g', references).map((x) => x.medianPrice)).toEqual([20]);
    expect(matchProfecoReferences('Frijol negro Verde Valle 900 g', references)).toEqual([]);
    expect(matchProfecoReferences('Frijol negro 900 g', references)).toEqual([]);
    expect(matchProfecoReferences('Frijol negro Aurrera 1 kg', references)).toEqual([]);
    // Necesidad sin variantes en el catálogo (huevo): basta presentación y marca.
    expect(matchProfecoReferences('Huevo rojo Bachoco 12 piezas', references).map((x) => x.medianPrice)).toEqual([39]);
    expect(matchProfecoReferences('Huevo rojo Bachoco 18 piezas', references)).toEqual([]);
    // Necesidad con variantes: sin variante legible no se compara.
    expect(matchProfecoReferences('Leche Lala 1 L', references)).toEqual([]);
    expect(matchProfecoReferences('Leche entera Lala 1 L', references).map((x) => x.medianPrice)).toEqual([32.75]);
    // «S/M» (sin marca) nunca se compara.
    expect(matchProfecoReferences('Tortilla de maíz 1 kg', references)).toEqual([]);
  });

  it('una referencia no puede convertirse en ahorro verificado', () => {
    expect(savingEvidence({ price: 20, history: null }).status).not.toBe('verified');
  });

  it('el módulo no escribe en la base ni toca observaciones de Aventa', () => {
    const src = readFileSync(join(process.cwd(), 'lib/despensa/references/profecoQqp.ts'), 'utf8');
    expect(src).not.toMatch(/offer_price_snapshots|product_price_snapshots|\.insert\(|\.upsert\(|from '@\/lib\/supabase/);
  });
});
