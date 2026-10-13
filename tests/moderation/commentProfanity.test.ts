import { describe, expect, it } from 'vitest';
import {
  moderateCommentText,
  moderateUserText,
  normalizeForMatch,
} from '@/lib/moderation/commentProfanity';

const verdict = (text: string) => moderateCommentText(text).verdict;

describe('moderateCommentText (compatibilidad)', () => {
  it('permite comentarios limpios', () => {
    expect(moderateCommentText('Buena oferta, gracias por compartir').verdict).toBe('allow');
  });

  it('bloquea insultos graves', () => {
    const r = moderateCommentText('Qué pendejo el que subió esto');
    expect(r.verdict).toBe('block');
  });

  it('retiene acusaciones de estafa', () => {
    const r = moderateCommentText('Esto es una estafa total');
    expect(r.verdict).toBe('hold');
  });

  it('retiene spam de enlaces', () => {
    const r = moderateCommentText('Mira https://a.com https://b.com https://c.com');
    expect(r.verdict).toBe('hold');
  });

  it('retiene texto repetitivo', () => {
    const r = moderateCommentText('aaaaaaaaaaaaaaaa');
    expect(r.verdict).toBe('hold');
  });
});

describe('español de México: no censura expresiones normales', () => {
  it.each([
    'Está bien pinche caro para lo que es',
    'La calidad es una mierda, no lo compren',
    'No mames, qué precio',
    'Está de poca madre esta oferta',
    'Vale verga el envío, tardó un mes',
    'Qué chingón precio, ya lo pedí',
    'Puta madre, ya se acabó',
    'Ptm se agotó en 5 minutos',
    'Me siento bien pendejo por no comprarlo ayer',
    'Qué idiota soy, lo compré a precio completo la semana pasada',
    'Puras mamadas, el precio subió',
    'Qué pendejada de empaque',
    'A huevo, llegó al día siguiente',
    'Ese cabrón precio no se ve diario',
  ])('permite (vulgaridad baja): %s', (text) => {
    const r = moderateCommentText(text);
    expect(r.verdict).toBe('allow');
    expect(r.severity).toBe('low');
    expect(r.categories).toContain('vulgarity');
  });

  it.each([
    'Mi pedido llegó retrasado, ojo',
    'Tu pedido viene retrasado por la paquetería',
    'Tu oferta es basura, el precio de lista está inflado',
    'Este café mata el hambre y está barato',
    'Un precio que mata',
    'Para matar el tiempo en el avión',
    'Muerte azul es mi bebida favorita',
    'Feliz día de las madres, buen regalo',
    'Comida para perro de 20 kg',
    'El mejor regalo para la jota de tu equipo',
    'Computadora con disputa de garantía resuelta',
    'Excelente, ya lo compré 👍',
    'Hay rata en el precio? jaja no, está bien',
  ])('permite sin marca: %s', (text) => {
    expect(verdict(text)).toBe('allow');
  });
});

describe('severidad media: contexto decide', () => {
  it.each([
    'Eres un pendejo',
    'El vendedor es un imbécil',
    'Qué idiota el que subió esto',
    'Ustedes son unos estúpidos',
    'Vete a la verga',
    'Eres una perra',
    'El moderador es un culero',
  ])('bloquea insulto dirigido: %s', (text) => {
    const r = moderateCommentText(text);
    expect(r.verdict).toBe('block');
    expect(r.severity).toBe('medium');
    expect(r.userMessage).toMatch(/sin atacar a nadie/);
  });

  it.each(['Qué estúpido diseño de caja', 'Bien culero el empaque', 'El puto envío no llega', 'Te odio Amazon'])(
    'retiene insulto no dirigido (revisión humana): %s',
    (text) => {
      const r = moderateCommentText(text);
      expect(r.verdict).toBe('hold');
      expect(r.severity).toBe('medium');
    }
  );

  it('palabras ambiguas solo cuentan si van dirigidas a alguien', () => {
    expect(verdict('Cama para perra mediana')).toBe('allow');
    expect(verdict('Eres una perra')).toBe('block');
    expect(verdict('Envío retrasado')).toBe('allow');
    expect(verdict('Eres un retrasado')).toBe('block');
  });
});

describe('severidad alta: siempre bloquea', () => {
  it.each([
    ['Te voy a matar', 'threat'],
    ['Sé donde vives', 'threat'],
    ['Ojalá te mueras', 'threat'],
    ['Muerte a los moderadores', 'threat'],
    ['Chinga tu madre', 'insult'],
    ['Hijo de su puta madre', 'insult'],
    ['Pinche maricón', 'hate'],
    ['Son unos jotos', 'hate'],
    ['Eres basura humana', 'hate'],
    ['Retrasado mental', 'hate'],
    ['Chúpame la verga', 'sexual'],
  ])('%s → %s', (text, category) => {
    const r = moderateCommentText(text);
    expect(r.verdict).toBe('block');
    expect(r.severity).toBe('high');
    expect(r.categories).toContain(category);
  });

  it('alta bloquea en todos los campos', () => {
    for (const field of ['comment', 'offer_title', 'offer_description', 'hunter_comment'] as const) {
      expect(moderateUserText('Te voy a matar', { field }).verdict).toBe('block');
    }
  });
});

describe('evasiones', () => {
  it.each([
    'Eres un p3nd3j0',
    'Eres un PENDEJOOOO',
    'Eres un p.e.n.d.e.j.o',
    'Eres un p e n d e j o',
    'Eres un péndejo',
    'Eres un imb3c1l',
    'Eres una perrrra',
  ])('detecta: %s', (text) => {
    expect(verdict(text)).toBe('block');
  });

  it('normalizeForMatch: acentos, leetspeak y letras separadas', () => {
    expect(normalizeForMatch('Él es un p3nd3j0!!!')).toBe('el es un pendejo');
    expect(normalizeForMatch('p u t o')).toBe('puto');
    expect(normalizeForMatch('$1,299 MXN')).toBe('1 299 mxn');
  });

  it('precios con dígitos no se convierten en letras', () => {
    expect(verdict('Bajó a $1,299 desde $3,499')).toBe('allow');
    expect(verdict('Modelo A15 con 4GB a 3,499')).toBe('allow');
  });
});

describe('por campo', () => {
  it('título/descripción de oferta: insulto no dirigido → hold, coloquial → allow', () => {
    expect(moderateUserText('Audífonos bien pinches baratos', { field: 'offer_title' }).verdict).toBe('allow');
    expect(moderateUserText('Audífonos para pendejos', { field: 'offer_title' }).verdict).toBe('hold');
    expect(moderateUserText('Eres un pendejo si no lo compras', { field: 'offer_description' }).verdict).toBe(
      'hold'
    );
  });

  it('comentario del cazador: cualquier insulto medio bloquea', () => {
    expect(moderateUserText('Qué estúpido diseño de caja', { field: 'hunter_comment' }).verdict).toBe('block');
  });

  it('acusaciones solo retienen comentarios, no descripciones', () => {
    expect(moderateUserText('Esto es una estafa', { field: 'comment' }).verdict).toBe('hold');
    expect(moderateUserText('Cuidado con estafas: compra solo en la tienda oficial', { field: 'offer_description' }).verdict).toBe(
      'allow'
    );
  });

  it('datos de contacto por WhatsApp → hold', () => {
    const r = moderateCommentText('Te lo vendo más barato, escríbeme al WhatsApp 55 1234 5678');
    expect(r.verdict).toBe('hold');
    expect(r.categories).toContain('spam');
  });

  it('vacío → block con categoría empty', () => {
    const r = moderateCommentText('   ');
    expect(r.verdict).toBe('block');
    expect(r.categories).toEqual(['empty']);
  });

  it('allow no trae mensaje; hold y block sí', () => {
    expect(moderateCommentText('Buen precio').userMessage).toBeUndefined();
    expect(moderateCommentText('Es una estafa').userMessage).toMatch(/revisión/);
    expect(moderateCommentText('Eres un pendejo').userMessage).toBeTruthy();
  });
});
