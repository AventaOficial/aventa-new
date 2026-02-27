# Modelo de votos tipo comunidad de ofertas

## Regla aplicada

- **Upvote:** +2 al score
- **Downvote:** -1 al score
- **Score:** `(upvotes × 2) - (downvotes × 1)`

## Por qué este modelo

1. **Incentiva votos positivos:** Un upvote vale el doble que un downvote.
2. **Downvotes menos destructivos:** Evita que pocos downvotes hundan una oferta buena.
3. **Similar a comunidad de ofertas:** Favorece descubrir buenas ofertas frente a penalizar las malas.

## Ejemplos

| Upvotes | Downvotes | Score (antes) | Score (ahora) |
|---------|-----------|--------------|---------------|
| 10      | 2         | 8            | 18            |
| 5       | 5         | 0            | 5             |
| 3       | 10        | -7           | -4            |

## Ranking (orden del feed)

El feed usa `ranking_momentum`, que combina:

- **Score** (up×2 − down)
- **Antigüedad:** decay por tiempo (las nuevas suben al principio)
- **Engagement:** outbound_24h, ctr_24h

Fórmula tipo Reddit/HN: el score se divide por `(tiempo_en_horas + 2)^1.5`, así las ofertas nuevas tienen ventaja y las antiguas bajan aunque tengan muchos votos.

## Migraciones

- `020_offer_votes_vote_alias_and_check.sql` — Alias `vote` y CHECK constraint
- `021_score_up2_down1.sql` — Score up×2, down×1

## Referencias

- Reddit hot: `sign × log10(|score|) + tiempo`
- Hacker News: `(P-1) / (T+2)^1.8`
- AVENTA: score con decay temporal + engagement
