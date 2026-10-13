import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MCP_CALLS_PER_MINUTE,
  MCP_ERROR_CODES,
  MCP_IDEMPOTENCY_KEY_MAX,
  MCP_IDEMPOTENCY_KEY_MIN,
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_NOTE_MAX,
  MCP_PILOT_MAX_ACCEPTED_PER_RUN,
  MCP_TITLE_MAX,
  MCP_TOOLS,
  SUBMISSION_CANDIDATE_STATES,
} from '@/lib/mcp/contract';
import { supportedStoreDomains } from '@/lib/mcp/rules';
import { OFFER_HUNTER_COMMENT_MAX } from '@/lib/contracts/offers';
import { HUNTER_COMMENT_MIN_CHARS, reviewHunterComment } from '@/lib/offers/hunterCommentReview';
import { compareWithListPrice } from '@/lib/offers/listPriceComparison';

const DOC = readFileSync(join(process.cwd(), 'docs/SYSTEMS/GROK_HUNTER_PROMPT.md'), 'utf8').replace(/\r\n/g, '\n');
const PROMPT = (() => {
  const section = DOC.split('## Instrucciones (pegar en xAI)')[1] ?? '';
  return section.split('```text')[1]?.split('```')[0] ?? '';
})();
const CORE = 'core-1.0.0';
const CONFIG = 'despensa-mx-1.0.0';

function sectionOf(title: string): string {
  return PROMPT.split(`=== ${title} ===`)[1]?.split('\n=== ')[0] ?? '';
}

function quoted(text: string): string[] {
  return [...text.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
}

describe('prompt maestro del Grok Hunter', () => {
  it('existe un único bloque pegable con versión de núcleo y de configuración', () => {
    expect(PROMPT.length).toBeGreaterThan(1000);
    expect(PROMPT.split('\n')[1]).toContain(`núcleo ${CORE} · configuración ${CONFIG}`);
    expect(DOC).toContain(`\`${CORE}\``);
    expect(DOC).toContain(`\`${CONFIG}\``);
    for (const title of [
      '1. NÚCLEO COMÚN',
      '2. CONFIGURACIÓN DEL BOT',
      '3. CONTRATO MCP',
      '4. REGLAS DE CALIDAD',
      '5. PROTOCOLO DE EJECUCIÓN',
      '6. COMENTARIO DEL CAZADOR (hunterComment, opcional)',
      '7. REPORTE FINAL DE CADA CORRIDA',
    ]) {
      expect(PROMPT, title).toContain(`=== ${title} ===`);
    }
  });

  it('los límites coinciden con el contrato del servidor', () => {
    const contract = sectionOf('3. CONTRATO MCP');
    expect(contract).toContain(`como máximo ${MCP_PILOT_MAX_ACCEPTED_PER_RUN} candidatos aceptados por runId`);
    expect(contract).toContain(`${MCP_MAX_CANDIDATES_PER_CALL} por\nllamada`);
    expect(contract).toContain(`${MCP_CALLS_PER_MINUTE} llamadas de herramienta por minuto`);
    expect(contract).toContain(`Máximo ${MCP_TITLE_MAX} caracteres`);
    expect(contract).toContain(`máximo ${MCP_NOTE_MAX}`);
    expect(sectionOf('6. COMENTARIO DEL CAZADOR (hunterComment, opcional)')).toContain(
      `de ${HUNTER_COMMENT_MIN_CHARS} a ${OFFER_HUNTER_COMMENT_MAX} caracteres`,
    );
    expect(sectionOf('2. CONFIGURACIÓN DEL BOT')).toContain(
      `Máximo por corrida: ${MCP_PILOT_MAX_ACCEPTED_PER_RUN} candidatos preparados`,
    );
  });

  it('nombra exactamente las cuatro herramientas, todos los errores y todos los estados', () => {
    for (const tool of MCP_TOOLS) expect(PROMPT, tool).toContain(tool);
    for (const code of MCP_ERROR_CODES) expect(PROMPT, code).toContain(code);
    for (const state of SUBMISSION_CANDIDATE_STATES) expect(sectionOf('5. PROTOCOLO DE EJECUCIÓN'), state).toContain(state);
  });

  it('las tiendas del bot son un subconjunto de las que admite el contrato y excluyen las de membresía', () => {
    const config = sectionOf('2. CONFIGURACIÓN DEL BOT');
    const allowed = config.split('Tiendas autorizadas')[1]?.split('Fuera de este bot')[0] ?? '';
    const stores = [...allowed.matchAll(/^- ([a-z0-9.-]+\.[a-z]+)/gm)].map((m) => m[1]);
    expect(stores.length).toBeGreaterThan(0);
    const supported = new Set(supportedStoreDomains());
    for (const store of stores) expect(supported.has(store), store).toBe(true);
    for (const excluded of ['costco.com.mx', 'sams.com.mx', 'cityclub.com.mx', 'chedraui.com.mx', 'mercadolibre.com.mx']) {
      expect(stores, excluded).not.toContain(excluded);
      expect(config.split('Fuera de este bot')[1], excluded).toContain(excluded);
    }
  });

  it('no fija metas de volumen y permite terminar sin candidatos', () => {
    expect(PROMPT).not.toMatch(/\b(50|70|100)\s+(ofertas|candidatos)\b/i);
    expect(sectionOf('1. NÚCLEO COMÚN')).toContain('Una corrida sin candidatos es correcta');
    expect(sectionOf('1. NÚCLEO COMÚN')).toContain('No tienes cuota que cumplir');
  });

  it('el runId y la idempotencyKey de ejemplo cumplen el contrato y llevan la versión del núcleo', () => {
    const runId = PROMPT.match(/grok-despensa-\d{8}-\d{4}-[a-z]/)?.[0];
    expect(runId).toBeDefined();
    const key = `${runId}:${CORE}:01`;
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(key.length).toBeGreaterThanOrEqual(MCP_IDEMPOTENCY_KEY_MIN);
    expect(key.length).toBeLessThanOrEqual(MCP_IDEMPOTENCY_KEY_MAX);
    expect(PROMPT).toContain(`"idempotencyKey": "<runId>:${CORE}:01"`);
  });

  it('el precio de lista solo sale de la ficha y una oportunidad exige referencia visible', () => {
    const quality = sectionOf('4. REGLAS DE CALIDAD');
    expect(sectionOf('3. CONTRATO MCP')).toMatch(/originalPrice: solo el precio de lista o tachado que la ficha muestra/);
    expect(quality).toContain('(NOT_AN_OPPORTUNITY)');
    expect(quality).toContain('(CONDITIONAL_PRICE)');
    expect(quality).toMatch(/membresía, cupón, tarjeta/);
  });

  it('ante un timeout repite la misma llave y el mismo payload, una sola vez', () => {
    const protocol = sectionOf('5. PROTOCOLO DE EJECUCIÓN');
    expect(protocol).toMatch(/timeout o respuesta vacía de submit_deal_candidates/);
    expect(protocol).toMatch(/MISMA idempotencyKey y EXACTAMENTE el mismo payload/);
    expect(protocol).toContain('nunca más de un reintento por llamada');
  });

  describe('el comentario del cazador que pide el prompt es el que acepta Aventa', () => {
    const comment = sectionOf('6. COMENTARIO DEL CAZADOR (hunterComment, opcional)');
    const title = 'Producto de ejemplo para despensa';
    const accepted = quoted(comment.split('Ejemplos aceptables')[1]?.split('Ejemplos que Aventa descarta')[0] ?? '');
    const rejected = quoted(comment.split('Ejemplos que Aventa descarta')[1] ?? '');
    const forbidden = quoted(
      (comment.split('- Prohibido:')[1]?.split('- No te presentes')[0] ?? '').replace(/«ahorras \$120»/, '«Ahorras $120»'),
    );

    it('hay ejemplos de ambos tipos y frases prohibidas', () => {
      expect(accepted.length).toBeGreaterThanOrEqual(3);
      expect(rejected.length).toBeGreaterThanOrEqual(3);
      expect(forbidden.length).toBeGreaterThanOrEqual(15);
    });

    it.each(accepted)('ejemplo aceptable se conserva: %s', (text) => {
      expect(reviewHunterComment(text, { title, comparison: compareWithListPrice(139, 189) }).review.status).toBe('kept');
    });

    it.each(rejected)('ejemplo descartable se descarta: %s', (text) => {
      expect(reviewHunterComment(text, { title, comparison: null }).review.status).toBe('dropped');
    });

    it.each(forbidden)('frase prohibida en el prompt también la descarta el filtro: %s', (phrase) => {
      const text = `Arroz de 1 kg a $42 en Soriana, ${phrase}.`;
      expect(reviewHunterComment(text, { title, comparison: compareWithListPrice(42, 60) }).review.status).toBe('dropped');
    });
  });
});
