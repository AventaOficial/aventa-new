# Accessibility Baseline — CONTROL

**Evidence:** E3 donde hay código; resto **UNKNOWN**.  
Sin correcciones. Sin auditoría WCAG formal.

---

## Observado (E3)

| Área | Hecho |
|---|---|
| Semantic buttons | Controles voto/fav/CTA usan `<button>` en cards/detalle (patrones lucide + button) |
| Links | `Link` / `router.push` para nav y cards |
| aria-label | Presente en favorito FeaturedOfferCard; share/fav/cerrar en OfferModal; varios admin (fuera de foco) |
| aria-hidden | Iconos decorativos frecuentes |
| Forms | Inputs nativos en auth, upload, comments, settings |
| Dialogs | Modales custom (upload, register, report) — implementación React |
| Images | `next/image` en cards; `alt` varía (a veces `alt=""`) — inventario completo UNKNOWN |
| Headings | Detalle usa heading para título oferta |

---

## UNKNOWN (no verificado exhaustivamente)

| Área | Estado |
|---|---|
| Orden de tab completo Home→Detalle→ActionBar | UNKNOWN |
| Focus visible en todos los controles | UNKNOWN |
| Focus trap en modales upload/register | UNKNOWN |
| Screen reader names para voto up/down | UNKNOWN (inspección parcial) |
| Contraste AA/AAA | UNKNOWN (no medido) |
| Tamaño mínimo targets táctiles | UNKNOWN (hay clases de tamaño; no medido px) |
| Live regions errores | UNKNOWN |
| Skip links | UNKNOWN / no hallado en shell rápido |
| Keyboard-only happy path TASK-006 | UNKNOWN |

---

## Registro

```text
criterion | status: OBSERVED|UNKNOWN | evidence: E3|— | notes
```

No se asignan severidades Blocker/Major en HSE-01 sin prueba.
