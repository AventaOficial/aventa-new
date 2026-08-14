# Pilares para expandir AVENTA a 50+ países

**Fecha:** 2026-08-14  
**Principio:** no reinventar el producto por país. Misma fórmula global; conectores locales.

Código base: `lib/markets/*` (hoy solo `mx` activo).

---

## 1) Los 7 pilares (en orden)

| # | Pilar | Qué es | Estado MX | Para país N |
|---|--------|--------|-----------|-------------|
| 1 | **Ofertas + ranking comunitario** | Feed, votos, reputación, moderación | Operativo | Reusar; idioma/locale |
| 2 | **Afiliados** | Links con tag → comisión de red | ML + Amazon en curso | Alta red local (o Amazon del país) |
| 3 | **Atribución → pago** | 40% de comisión confirmada atribuible | Código + admin | Misma fórmula; otra currency |
| 4 | **Confianza / legal** | Terms, privacy, disclosures, edad | Reforzado 2026-08-14 | Traducir + tax local |
| 5 | **Seguridad de datos** | RLS, vistas, PII fiscal | Fase 1+2 | Mismos patrones |
| 6 | **Ops de payout** | Ledger, hold, mínimo, SPEI/manual | MX SPEI | Proveedor local / Wise |
| 7 | **Mercado como config** | `MarketConfig` (moneda, redes, tax ID) | `lib/markets/mx.ts` | Nuevo archivo por país |

Todo lo demás (ads sutiles, features sociales) es secundario hasta que 1–6 estén sólidos en MX.

---

## 2) Fórmula universal (no cambia por país)

```
elegibilidad = calidad (umbrales locales opcionales)
pago = comisión_afiliada_confirmada_atribuible × creator_share_bps
```

- Votos ≠ dinero (solo candado).  
- Sin atribución → se queda en plataforma.  
- Hold + mínimo siempre.

---

## 3) Qué SÍ cambia por país

| Variable | MX | Ejemplo CO / ES |
|----------|----|-----------------|
| `currency` | MXN | COP / EUR |
| `affiliateNetworks` | ML, Amazon | Amazon.es, tiendas locales |
| `taxIdLabel` | RFC | NIT / NIF |
| `payoutMethod` | SPEI | Transferencia local / PayPal |
| `locale` | es-MX | es-CO / es-ES |
| Umbrales 15×120 | Pueden bajar al inicio | Ajustar por madurez |
| `creator_share_bps` | 4000 default | Override si margen distinto |

---

## 4) Cómo abrir país N (checklist corto)

1. ¿Hay programa de afiliados usable y ToS leídos?  
2. ¿Podemos poner `tracking_tag` / ID por creador?  
3. ¿Cómo pagamos (banco local, Wise, PayPal)?  
4. ¿Qué tax ID pedimos y qué dice un contador local?  
5. Añadir `lib/markets/<id>.ts` + registrar en `lib/markets/index.ts`.  
6. Traducir `/terms` `/privacy` mínimos + disclosure.  
7. Encender comisiones solo tras dry-run de un periodo.

**No** abrir 50 países en paralelo. Secuencia: MX estable → 1 país LATAM → Iberia/US según redes.

---

## 5) Arquitectura técnica (evitar rewrites)

- **Un monorepo / una app** con `ACTIVE_MARKET_ID` o, más adelante, host → market (`mx.aventa…`, `co.aventa…`).  
- Ledger y allocations ya tienen `currency`.  
- No hardcodear “MXN” en lógica de negocio nueva; usar `getActiveMarket().currency`.  
- UI de precio: evolucionar `formatPriceMXN` → `formatPrice(amount, market)` (pendiente gradual).  
- Admin comisiones: mismo panel; filtro por market cuando haya multi-tenant.

---

## 6) Roadmap de pilares (12–24 meses, realista)

### Ahora (MX)
- [x] Política 40% atribuido  
- [x] Terms/privacy reforzados  
- [x] Security advisor fase 1  
- [x] Security advisor fase 2 (SQL + health API)  
- [x] Disclosure en oferta/modal  
- [x] Tags consistentes por creador (`/admin/creator-tags` + migración amazon tag)
- [ ] Dry-run comisiones (ops; contador puede esperar al 1er payout real)  
- [x] Import CSV ledger por tag (admin comisiones)
- [x] Panel creador: liquidación pendiente/pagado  
- [ ] Sponsored slot etiquetado (opcional)  
- [ ] Cold start: feed con ofertas reales + env afiliados verificados  
- [ ] Loop de captación (cazadores semilla + canales de tráfico)  

### Expansión
- [ ] 2º mercado en `lib/markets`  
- [ ] Routing por dominio/locale  
- [ ] Payout provider multi-país  

---

## 7) Anti-patrones (no hacer)

- Copiar YouTube watch-time como métrica de pago.  
- Pool igualitario por votos como modelo final.  
- Un fork del código por país.  
- Prometer “disponible en LatAm” sin mercado configurado.  
- Encender comisiones en país nuevo sin ToS de red + fiscal.

---

*Documento vivo. Al añadir un país, actualizar la tabla del §1 y el registry en código en el mismo PR.*
