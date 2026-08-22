import { describe, it, expect } from 'vitest';
import { inferOfferAutogroup, inferPrimarySubgroup } from '@/lib/offers/inferOfferAutogroup';

describe('inferOfferAutogroup — separación TV vs monitor', () => {
  it('Smart TV → televisiones, no monitores', () => {
    const r = inferOfferAutogroup({
      title: 'Smart TV Motorola MOT32HLE11 32" HD DLED',
      store: 'Mercado Libre',
      category: 'tecnologia',
    });
    expect(r.subgroupSlug).toBe('televisiones');
    expect(r.tags).toContain('televisiones');
    expect(r.tags).not.toContain('monitores');
  });

  it('Monitor de PC → monitores, no smart-tv', () => {
    const r = inferOfferAutogroup({
      title: 'Monitor Acer Kb2 27 Ips Fhd 75hz Tiempo De Respuesta',
      category: 'tecnologia',
    });
    expect(r.subgroupSlug).toBe('monitores');
    expect(r.tags).toContain('monitores');
    expect(r.tags).not.toContain('smart-tv');
  });

  it('Caminadora → deportes/fitness, no televisiones', () => {
    const r = inferOfferAutogroup({
      title: 'Caminadora Eléctrica Plegable Con Pantalla Led 1.5hp 14 Km/h',
    });
    expect(r.category).toBe('deportes');
    expect(r.subgroupSlug).toBe('fitness');
    expect(r.tags).not.toContain('televisiones');
  });

  it('Impresora → impresoras, no cámaras', () => {
    const r = inferOfferAutogroup({
      title: 'Multifuncional Canon Pixma G3180 Color Negro',
      category: 'tecnologia',
    });
    expect(r.subgroupSlug).toBe('impresoras');
    expect(r.tags).not.toContain('camaras');
  });

  it('Tablet no cae en celulares', () => {
    const r = inferOfferAutogroup({
      title: 'Tablet Cubot Tab Kingkong S 10.1" 16 GB RAM 256 GB',
      category: 'tecnologia',
    });
    expect(r.subgroupSlug).toBe('tablets');
    expect(r.tags).not.toContain('celulares');
  });

  it('Bocina JBL → audio en tecnología', () => {
    const r = inferOfferAutogroup({
      title: 'Bocina Jbl Partybox 130 Bluetooth 15h Batería',
    });
    expect(r.category).toBe('tecnologia');
    expect(r.subgroupSlug).toBe('audio');
  });

  it('Parrilla → jardin/parrillas, no muebles hogar', () => {
    const r = inferOfferAutogroup({
      title: 'Parrilla a Gas Empotrable Estufa De Gas 4 Quemadores',
    });
    expect(r.category).toBe('jardin');
    expect(r.subgroupSlug).toBe('parrillas');
  });
});

describe('inferPrimarySubgroup', () => {
  it('prefiere keyword larga (smart tv) sobre token corto', () => {
    const sg = inferPrimarySubgroup('Pantalla Smart Tv Aiwa 50 Pulgadas Qled 4k', 'tecnologia');
    expect(sg?.slug).toBe('televisiones');
  });
});
