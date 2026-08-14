# Contraste: auditoría Claude vs lo que AVENTA ya tiene

**Fecha:** 2026-08-14  
**Fuente externa:** auditoría legal-product pegada por el founder (Claude).  
**Fuente interna:** `app/terms`, `app/privacy`, `app/comisiones`, `lib/commissions/*`, `docs/POLITICA_COMISIONES_CREADORES.md`.

> No es consejo legal. Es mapa de trabajo: qué Claude marcó ❌ pero ya existe, qué sigue faltando de verdad, y qué bloquea dinero real.

---

## 1) Veredicto en una frase

Claude acierta en lo **crítico de negocio** (fiscal del SPEI, ToS Amazon/ML, anti-fraude operable, figura jurídica).  
Sobreestima el vacío legal de producto: **sí hay Términos, Privacidad LFPDPPP/ARCO, disclosure de afiliados y §8 de comisiones** — pero incompletos frente a la política del 40%/hold/$200.

---

## 2) Tabla de contraste (checklist Claude → realidad repo)

| Bloque Claude | Claude dijo | Realidad en repo | Acción |
|---------------|-------------|------------------|--------|
| 1 Constitución | ❌ | Correcto: no hay razón social en Términos | Contador/abogado cuando haya dinero |
| 2 T&C generales | ❌ | **✅** `app/terms/page.tsx` (§1–13), jurisdicción MX, limitación responsabilidad | Revisar con abogado al escalar |
| 2 Anexo creador | ❌ | **✅** §8 ampliado (15×120, 40% atribuido, hold 14d, mínimo $200, void, self-dealing, 18+) · versión `2026-08-14` | Quienes aceptaron versión vieja deben re-aceptar al activar |
| 2 Aceptación versionada | ❌ | **⚠️** timestamp + versión en profiles; aún sin log inmutable dedicado | Mejorar antes de pagos masivos |
| 3 Aviso privacidad | ❌ | **✅** `app/privacy/page.tsx` — RFC/CLABE/nombre legal explícitos (2026-08-14) | — |
| 4 Disclosure afiliados | ❌ | **✅** Footer + `/comisiones` (`AFFILIATE_DISCLOSURE_ES` + Amazon EN) | Añadir en ficha/modal de oferta (no solo footer) |
| 5 Programa comisiones | ⚠️/❌ | Política interna + `/comisiones` actualizado a 40% atribuido; §8 terms aún genérico | Sincronizar terms ↔ política ↔ copy |
| 6 Fiscal SAT | ❌ | Correcto como bloqueante de SPEI | Contador **antes** del primer pago |
| 7–8 UGC / reportes | ❌ | **⚠️** Terms §3,§6,§9; hay reportes en producto (OfferModal/admin) | Documentar proceso + IP takedown breve en terms |
| 9 Anti-fraude | ❌ | **⚠️** Terms §9 + `/comisiones` + `fraudSignals` (RFC/CLABE); falta self-purchase explícito y revisión 1er pago | Añadir cláusula + checklist ops |
| 10 RLS / PII fiscal | ⚠️ | Tablas comisión con RLS lockdown; **cola sin RLS**; vistas SECURITY DEFINER | Ver `SUPABASE_SECURITY_ADVISOR.md` |
| 11 ToS Amazon/ML | ❌ | Solo disclosure; sin checklist Operating Agreement | Lectura humana + checklist interno |
| 12 Ads | ⚠️ | Aún no hay ads de terceros | Disclosure “Patrocinado” si se activan |
| 13 Menores | ❌ | Correcto: no hay edad mínima en terms | Añadir 18+ al menos para comisiones |
| 14 Limitación / jurisdicción | ❌ | **✅** Terms §10 y §12 | Revisar redacción con abogado al escalar |
| 15 Multi-país | ⚠️ | Correcto: no priorizar | — |

---

## 3) Frases peligrosas vs copy actual

| Riesgo Claude | Estado AVENTA |
|---------------|---------------|
| “Gana dinero garantizado” | Evitado en §8 (“sin promesa de ingreso”) |
| “Pago inmediato” | Evitado; hold documentado en política |
| Pool por votos como si fuera el pago | **Corrigido** en `/comisiones` y política; §8 terms aún no menciona 40% atribuido |
| Disclosure ausente | **Presente** en footer; falta en cada oferta |

Usar las “frases seguras” de Claude al reescribir §8.

---

## 4) Mínimo antes de `COMMISSION_PROGRAM_ACTIVE=true` (ajustado)

Claude F) sigue siendo válido, con matices:

| # | Ítem | Estado |
|---|------|--------|
| 1 | T&C con sección creador | ⚠️ Ampliar §8 |
| 2 | Privacidad con datos fiscales explícitos | ⚠️ Ampliar §2/§3 privacy |
| 3 | Disclosure afiliados | ⚠️ Subir a UI de oferta |
| 4 | Contador por escrito (retención/CFDI) | ❌ Bloqueante SPEI |
| 5 | Anti-fraude + 1er pago manual | ⚠️ Parcial |
| 6 | Auditoría RLS PII + cola | ⚠️ Ver SQL seguridad |
| 7 | Definición interna confirmado/atribuible/void | ✅ en política + código |
| 8 | Lectura ToS Amazon/ML | ❌ |

**No bloqueante para seguir construyendo producto.**  
**Sí bloqueante para el primer SPEI real:** #4 y ampliar #1–#3.

---

## 5) Archivos canónicos

| Tema | Archivo |
|------|---------|
| Términos | `app/terms/page.tsx` |
| Privacidad | `app/privacy/page.tsx` |
| Programa público | `app/comisiones/page.tsx` |
| Política producto | `docs/POLITICA_COMISIONES_CREADORES.md` |
| Disclosures | `lib/commissions/programStatus.ts` |
| Aceptación | `app/api/me/commissions-accept/route.ts` |
| Seguridad BD | `docs/SUPABASE_SECURITY_ADVISOR.md` |
| SQL seguro | `docs/supabase-migrations/security_advisor_phase1_lockdown.sql` |

---

## 6) Próximos pasos de producto (sin abogado)

1. Ampliar `/terms` §8 + `/privacy` (RFC/CLABE) + edad 18+ comisiones → bump `COMMISSION_TERMS_VERSION`.  
2. Disclosure en modal/página de oferta.  
3. Ejecutar SQL fase 1 de seguridad (cola + backups muertos).  
4. Dry-run de comisiones un mes sin SPEI.  
5. Cuando haya margen: 1 sesión contador (fiscal) + 1 sesión abogado (persona moral + ToS final).
