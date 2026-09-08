import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';

/**
 * HOTFIX: el camino legacy del bot podía escribir status 'approved' sin que
 * ningún humano mirara la oferta, y se encendía solo con que la variable
 * estuviera ausente.
 *
 * Estos tests fijan dos cosas a la vez:
 *   1. El bot no puede aprobar. Nunca, y menos por omisión.
 *   2. El motor autónomo sigue evaluando en shadow. Apagar el permiso de
 *      escritura no puede dejar ciego al sistema que estamos midiendo.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function configWith(value: string | undefined) {
  if (value === undefined) vi.stubEnv('BOT_INGEST_AUTO_APPROVE', '');
  else vi.stubEnv('BOT_INGEST_AUTO_APPROVE', value);
  return loadBotIngestConfig('standard');
}

describe('camino legacy de auto-approve del bot', () => {
  it('A. sin configurar → el bot NO puede aprobar', () => {
    // Éste era el fallo: la ausencia de configuración lo encendía.
    expect(configWith(undefined).legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('B. BOT_INGEST_AUTO_APPROVE=0 → el bot NO puede aprobar', () => {
    expect(configWith('0').legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('C. BOT_INGEST_AUTO_APPROVE=false → el bot NO puede aprobar', () => {
    expect(configWith('false').legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('C2. cualquier otro valor tampoco lo enciende', () => {
    for (const value of ['no', 'off', 'sí', 'yes', 'on', 'TRUE', '2', ' 1', 'enabled']) {
      expect(configWith(value).legacyAutoApproveWriteEnabled).toBe(false);
    }
  });

  it('C3. en producción queda apagado aunque la variable pida encenderlo', () => {
    // Reactivarlo en producción exige cambiar código, no una variable.
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(configWith('1').legacyAutoApproveWriteEnabled).toBe(false);
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(configWith('1').legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('C4. fuera de producción el opt-in explícito sí conserva la capacidad', () => {
    // La capacidad se mantiene solo para poder ejercitar el camino en tests.
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(configWith('1').legacyAutoApproveWriteEnabled).toBe(true);
    expect(configWith('true').legacyAutoApproveWriteEnabled).toBe(true);
  });

  it('F. la POLÍTICA sigue encendida para que el shadow no se quede ciego', () => {
    // Si se apagara aquí, el Deal Verifier degradaría todo a 'review' y el motor
    // autónomo nunca volvería a producir un AUTO_APPROVE observado. Perderíamos
    // la evidencia que justifica el modo shadow.
    expect(configWith(undefined).autoApproveEnabled).toBe(true);
    expect(configWith('1').autoApproveEnabled).toBe(true);
  });

  it('F2. política y permiso de escritura son campos distintos', () => {
    const config = configWith(undefined);
    expect(config.autoApproveEnabled).toBe(true);
    expect(config.legacyAutoApproveWriteEnabled).toBe(false);
    expect(config.autoApproveEnabled).not.toBe(config.legacyAutoApproveWriteEnabled);
  });

  it('G. el publisher gate sigue fail-closed y sin bypass de afiliados', () => {
    // El gate solo exige tag si la tienda tiene programa de afiliados configurado.
    vi.stubEnv('AMAZON_ASSOCIATE_TAG', 'aventa-20');
    const sinTag = resolveBotInsertPublication({
      requestedStatus: 'approved',
      offerUrl: 'https://www.amazon.com.mx/dp/B0TEST1234',
    });
    expect(sinTag.status).toBe('pending');
    expect(sinTag.linkModOk).toBe(false);
    expect(sinTag.demoted).toBe(true);
  });

  it('H. pedir pending nunca se convierte en approved', () => {
    const out = resolveBotInsertPublication({
      requestedStatus: 'pending',
      offerUrl: 'https://www.mercadolibre.com.mx/p/MLM123?matt_tool=TEST',
    });
    expect(out.status).toBe('pending');
    expect(out.linkModOk).toBe(false);
  });

  it('H2. una URL vacía degrada a pending en vez de publicarse', () => {
    const out = resolveBotInsertPublication({ requestedStatus: 'approved', offerUrl: '   ' });
    expect(out.status).toBe('pending');
    expect(out.demoted).toBe(true);
  });

  it('E. la moderación humana sigue pudiendo escribir approved', () => {
    // moderate-offer es el único camino de aprobación humana. No puede depender
    // de la flag del bot: si la leyéramos ahí, apagar el auto-approve rompería
    // la cola de moderación.
    const src = readFileSync(
      resolve(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8'
    );
    expect(src).toContain("status: 'approved'");
    expect(src).toContain('requireModeration');
    expect(src).not.toMatch(/BOT_INGEST_AUTO_APPROVE|legacyAutoApproveWriteEnabled|autoApproveEnabled/);
  });

  it('F. el motor autónomo no escribe ofertas: solo observa', () => {
    const decide = readFileSync(resolve(process.cwd(), 'lib/autonomous/decide.ts'), 'utf8');
    const observe = readFileSync(resolve(process.cwd(), 'lib/autonomous/observe.ts'), 'utf8');
    expect(decide).not.toMatch(/from\(['"]offers['"]\)/);
    expect(observe).not.toMatch(/from\(['"]offers['"]\)/);
    expect(decide + observe).not.toMatch(/status:\s*['"]approved['"]/);
  });
});
