/**
 * CazaOfertasss — FASE 0. Contratos estructurales de frontera.
 *
 * Escanea el módulo en disco: la independencia respecto de Aventa no puede
 * depender de que nadie escriba el import equivocado.
 */

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  ADAPTER_NOT_IMPLEMENTED_REASON,
  CAZAOFERTAS_AVENTA_BOUNDARY,
  CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS,
  CAZAOFERTAS_LLM_AUTHORITY,
  CAZAOFERTAS_SECRET_POLICY,
  CAZAOFERTAS_STORES,
  affiliateCredentialIsConfigured,
  assertAventaBoundaryIntact,
  assertLlmIsNotAuthority,
  assertPublicationDisabled,
  assertSecretPolicy,
  capabilitiesMatrix,
  createDealStoreAdapterRegistry,
  listRegisteredStores,
} from '@/lib/cazaOfertas';

const MODULE_ROOT = path.resolve(__dirname, '../../lib/cazaOfertas');

function listModuleFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listModuleFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const MODULE_FILES = listModuleFiles(MODULE_ROOT);

describe('aislamiento del módulo', () => {
  it('el módulo existe y tiene archivos', () => {
    expect(MODULE_FILES.length).toBeGreaterThan(10);
  });

  it('ningún archivo importa módulos económicos ni de distribución de Aventa', () => {
    const violations: string[] = [];

    for (const file of MODULE_FILES) {
      const source = fs.readFileSync(file, 'utf8');
      const importTargets = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

      for (const target of importTargets) {
        for (const forbidden of CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS) {
          const normalized = forbidden.replace(/^lib\//, '');
          if (target.startsWith(`@/${forbidden}`) || target.includes(`../${normalized}/`)) {
            violations.push(`${path.relative(MODULE_ROOT, file)} → ${target}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('sólo importa `zod` y módulos propios', () => {
    const external = new Set<string>();

    for (const file of MODULE_FILES) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = match[1];
        if (target.startsWith('.')) continue;
        external.add(target);
      }
    }

    expect([...external].sort()).toEqual(['zod']);
  });

  it('no contiene secretos de afiliación embebidos', () => {
    // Referencias por nombre de env var sí; valores de tag/credencial no.
    const suspicious = /(process\.env\.[A-Z_]*(TAG|SECRET|TOKEN|KEY)[A-Z_]*\s*\|\|\s*['"][^'"]+['"])|(-2[0-9]['"]\s*;\s*\/\/\s*tag)/;
    const offenders = MODULE_FILES.filter((file) =>
      suspicious.test(fs.readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

describe('frontera con Aventa', () => {
  it('no escribe ni comparte el money path', () => {
    expect(CAZAOFERTAS_AVENTA_BOUNDARY).toMatchObject({
      writesAventaLedger: false,
      writesAventaRewards: false,
      writesAventaPayoutIntents: false,
      writesAventaCommissions: false,
      readsAventaEconomicTables: false,
      settlementEnabled: false,
      sharesEconomicTables: false,
      integrationStyle: 'contracts_and_events_only',
    });
    expect(() => assertAventaBoundaryIntact()).not.toThrow();
  });

  it('la publicación está deshabilitada en FASE 0', () => {
    expect(() => assertPublicationDisabled()).not.toThrow();
  });

  it('un LLM no es autoridad de precio, descuento ni score', () => {
    expect(CAZAOFERTAS_LLM_AUTHORITY.priceAuthority).toBe(false);
    expect(CAZAOFERTAS_LLM_AUTHORITY.discountAuthority).toBe(false);
    expect(CAZAOFERTAS_LLM_AUTHORITY.scoreAuthority).toBe(false);
    expect(() => assertLlmIsNotAuthority()).not.toThrow();
  });

  it('la política de secretos prohíbe código y cliente', () => {
    expect(CAZAOFERTAS_SECRET_POLICY.storeSecretsInCode).toBe(false);
    expect(CAZAOFERTAS_SECRET_POLICY.exposeSecretsToClient).toBe(false);
    expect(() => assertSecretPolicy()).not.toThrow();
  });

  it('la resolución de credenciales sólo reporta presencia, nunca el valor', () => {
    expect(affiliateCredentialIsConfigured('nombre-invalido')).toBe(false);
    expect(typeof affiliateCredentialIsConfigured('CAZAOFERTAS_AMAZON_ASSOCIATE_TAG')).toBe(
      'boolean'
    );
  });
});

describe('adapters de tienda', () => {
  const registry = createDealStoreAdapterRegistry();

  it('registra exactamente las tiendas de FASE 0', () => {
    expect(listRegisteredStores()).toEqual(['mercadolibre_mx', 'amazon_mx']);
    expect(Object.keys(registry).sort()).toEqual([...CAZAOFERTAS_STORES].sort());
  });

  it('ninguna capacidad se declara soportada sin integración oficial', () => {
    for (const [store, capabilities] of Object.entries(capabilitiesMatrix(registry))) {
      expect(capabilities.discover, `${store}.discover`).not.toBe('supported');
      expect(capabilities.getProduct, `${store}.getProduct`).not.toBe('supported');
      expect(capabilities.validatePrice, `${store}.validatePrice`).not.toBe('supported');
      expect(capabilities.createAffiliateLink, `${store}.createAffiliateLink`).not.toBe('supported');
      expect(capabilities.notes.length).toBeGreaterThan(0);
    }
  });

  it('cada método falla de forma observable en lugar de inventar datos', async () => {
    for (const store of CAZAOFERTAS_STORES) {
      const adapter = registry[store];

      const results = await Promise.all([
        adapter.discover({ limit: 10 }),
        adapter.getProduct('B08N5WRWNW'),
        adapter.validatePrice('B08N5WRWNW', 1999),
        adapter.createAffiliateLink({
          canonicalUrl: 'https://amazon.com.mx/dp/B08N5WRWNW',
          dealId: 'caza_amazon_mx_abcd1234',
          trackingLabel: 'caza_0f1e2d3c_20260919',
        }),
      ]);

      for (const result of results) {
        expect(result.ok, `${store} no debe devolver datos en FASE 0`).toBe(false);
        if (result.ok) continue;
        expect(result.reasons[0]).toContain(ADAPTER_NOT_IMPLEMENTED_REASON);
      }
    }
  });

  it('discover exige un límite explícito en su contrato', () => {
    // No existe una firma sin límite: el contrato no permite "traer todo".
    const source = fs.readFileSync(path.join(MODULE_ROOT, 'stores', 'adapter.ts'), 'utf8');
    expect(source).toContain('readonly limit: number');
    expect(source).not.toMatch(/fetchAll|listAll|getAllProducts/);
  });
});
