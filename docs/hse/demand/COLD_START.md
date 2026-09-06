# Cold Start — liquidez demand hunting

**Evidence:** E1 · coherente con HSE-03 `COLD_START_ANALYSIS.md`

## Ejemplo

10 solicitudes · 2 hunters activos.

| Efecto probable | Detalle |
|---|---|
| Expectativa | Usuario espera “alguien me ayuda” |
| Fracaso percibido | 8/10 sin respuesta → producto “roto” |
| Tiempo de respuesta | Horas–nunca; peor que Google instantáneo |
| Confianza | Cae tras primer silencio |
| Incentivos | 2 hunters sobrecargados o ignoran |

## Amortiguadores conceptuales (E1 — no build)

| Amortiguador | Cómo ayuda |
|---|---|
| Respuesta automática de catálogo | Convierte C parcial en valor de un lado |
| “Buscando…” + ETA honesto | Reduce ansiedad; no inventa resultados |
| Expirar / cerrar solicitud | Evita limbo eterno |
| Limitar open requests | Protege capacidad |
| Vertical / concierge | 2 hunters bastan en un nicho pequeño |
| No prometer caza humana en empty state | Expectativa = búsqueda + alerta, no helpdesk |

## Cuándo cerrar / expirar (principios E1)

- Tras N horas sin candidato útil.  
- Cuando comprador marca resuelto / abandonado.  
- Cuando constraints son imposibles (educar y cerrar).  
- Cuando match catálogo ya satisfizo (caso 15).

## Implicación estratégica

Sin amortiguador de un lado (catálogo/alerta), demand hunting **no** es MVP a 10–100 usuarios.  
Con amortiguador, la caza humana es **escalada**, no camino crítico.
