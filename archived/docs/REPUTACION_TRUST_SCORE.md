# Sistema de Reputación (Trust Score)

Sistema interno de reputación sin romper lo existente: columnas nuevas, lógica incremental y condiciones en API.

## 1. Columnas en `profiles`

| Columna             | Tipo    | Default | Descripción                          |
|---------------------|---------|---------|--------------------------------------|
| `reputation_score`  | integer | 0       | Puntos internos (no mostrado como número) |
| `reputation_level`  | integer | 1       | Nivel 1–4 para reglas y UI            |
| `is_trusted`        | boolean | false   | true si level >= 2                    |

## 2. Cálculo del score (interno)

- **+10** por oferta aprobada  
- **-15** por oferta rechazada  
- **+2** por comentario aprobado  
- **-5** por comentario rechazado  
- **+1** por like recibido en un comentario  

Cálculo en Supabase: función `recalculate_user_reputation(p_user_id)`.  
Se invoca desde:

- `POST /api/admin/moderate-offer` (autor de la oferta)
- `PATCH /api/admin/comments` (autor del comentario)
- `POST /api/offers/.../comments/.../like` (autor del comentario al dar/quitar like)

En Next.js: `recalculateUserReputation(userId)` en `lib/server/reputation.ts` llama al RPC.

## 3. Niveles

| Nivel | Score   | Efecto |
|-------|--------|--------|
| 1     | 0–49   | Todo pasa por moderación |
| 2     | 50–199 | Comentarios auto-aprobados |
| 3     | 200–499| Comentarios auto; ofertas visibles en “Nuevas” al publicar |
| 4     | 500+   | Igual que 3 + peso de voto mayor (backend) |

## 4. Automatización de moderación

- **Comentarios:** Si `reputation_level >= 2` → al crear comentario se guarda con `status = 'approved'`.  
  (Ya no se usa “N likes → aprobar”; los likes solo suben reputación.)
- **Ofertas:** Si `reputation_level >= 3` → al crear oferta se guarda con `status = 'approved'` y `expires_at` +7 días.

## 5. Barra visual en perfil

- **/me** y **/u/[username]**: componente `ReputationBar` con “Nivel X – [Nuevo | Contribuidor | Cazador Pro | Elite]” y barra de progreso dentro del nivel.
- Labels: Nivel 1 – Nuevo, 2 – Contribuidor, 3 – Cazador Pro, 4 – Elite.

## 6. Peso de voto progresivo (solo backend)

No se muestra al usuario. Por nivel del **votante**:

- Nivel 1: +2 / -1  
- Nivel 2: +2.2 / -1.1  
- Nivel 3: +2.5 / -1.2  
- Nivel 4: +3 / -1.5  

Implementación: columna `offers.reputation_weighted_score`, función `recalculate_offer_reputation_weighted_score(offer_id)` y trigger en `offer_votes`. El trigger actual de votos (upvotes_count, downvotes_count, ranking_momentum) no se modifica.

## Migraciones (orden sugerido)

1. **reputation_trust_score.sql** – Columnas en `profiles`, `reputation_level_from_score`, `recalculate_user_reputation`.  
   Requiere que exista `comment_likes` (migración anterior de comentarios/likes).
2. **reputation_vote_weight.sql** – Columna `reputation_weighted_score` en `offers`, función y trigger de peso por reputación.

## Archivos clave

- `lib/server/reputation.ts` – Constantes, `recalculateUserReputation`, umbrales de auto-aprobación.
- `lib/reputation.ts` – Niveles y helpers para la barra (cliente).
- `app/components/ReputationBar.tsx` – Barra de nivel en perfil.
- `docs/supabase-migrations/reputation_trust_score.sql`
- `docs/supabase-migrations/reputation_vote_weight.sql`
