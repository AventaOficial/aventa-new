# Tablas y columnas en el esquema public (Supabase)

Contexto del esquema actual para migraciones, RLS y consultas.

---

## profiles

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK |
| username | text | nullable, unique |
| avatar_url | text | nullable |
| created_at | timestamptz | default: now() |
| display_name | text | nullable |
| onboarding_completed | boolean | default: false |
| offers_submitted_count | integer | default: 0 — Ofertas enviadas por el usuario |
| offers_approved_count | integer | default: 0 — Ofertas aprobadas del usuario |
| offers_rejected_count | integer | default: 0 — Ofertas rechazadas del usuario |
| display_name_updated_at | timestamptz | default: now() — Última actualización del nombre visible; límite 14 días |

**FKs:** profiles.id → auth.users.id  
Otras tablas referencian public.profiles.id: offer_events.user_id, comments.user_id, offer_favorites.user_id, offers.created_by.

---

## offers

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| title | text | |
| price | numeric | |
| original_price | numeric | nullable |
| image_url | text | |
| store | text | |
| created_at | timestamptz | default: now() |
| status | text | default: 'approved' |
| created_by | uuid | nullable, FK → profiles.id |
| is_featured | boolean | default: false |
| expires_at | timestamptz | nullable |
| rejection_reason | text | nullable |
| offer_url | text | nullable |
| description | text | nullable |
| votes_count | integer | default: 0 |
| outbound_24h | integer | default: 0 |
| ctr_24h | numeric | default: 0 |
| ranking_momentum | numeric | default: 0 |
| upvotes_count | integer | default: 0 |
| downvotes_count | integer | default: 0 |
| updated_at | timestamptz | default: now() |
| risk_score | integer | nullable, check 0..100 |
| steps | text | nullable — Pasos para obtener la oferta |
| conditions | text | nullable — Condiciones de la oferta |
| coupons | text | nullable — Cupones o códigos de descuento |
| msi_months | integer | nullable, check 1..24 — Meses sin intereses |
| image_urls | text[] | nullable, default '{}' — URLs de imágenes adicionales |
| deleted_at | timestamptz | nullable — soft-delete |

**FKs:** offers.created_by → public.profiles.id  
offers.id referenciado por: offer_quality_checks, moderation_logs, offer_favorites, offer_events, comments, offer_votes, offer_reports.

---

## user_roles

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| user_id | uuid | FK → auth.users.id |
| role | text | check: owner, admin, moderator, analyst |
| created_at | timestamptz | default: now() |

Comentario: Roles: owner (todo), admin (todo), moderator (solo moderación), analyst (solo métricas).

---

## offer_quality_checks

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | FK → offers.id |
| reviewer_id | uuid | nullable, FK → auth.users.id |
| is_valid_price | boolean | nullable |
| is_clear_description | boolean | nullable |
| is_not_scam | boolean | nullable |
| is_identifiable_store | boolean | nullable |
| is_relevant | boolean | nullable |
| reviewed_at | timestamptz | nullable |

---

## offer_votes

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | FK → offers.id |
| user_id | uuid | FK → auth.users.id |
| value | integer | check: 1, -1 |
| created_at | timestamptz | default: now() |
| vote | smallint | generated, default: value |

---

## comments

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | FK → offers.id |
| user_id | uuid | FK → profiles.id |
| content | varchar | |
| created_at | timestamptz | default: now() |
| status | text | default: 'pending', check: pending, approved, rejected |

---

## offer_events

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | FK → offers.id |
| user_id | uuid | nullable, FK → profiles.id |
| event_type | text | check: view, outbound, share |
| created_at | timestamptz | default: now() |

---

## offer_favorites

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| user_id | uuid | FK → profiles.id |
| offer_id | uuid | FK → offers.id |
| created_at | timestamptz | default: now() |

---

## moderation_logs

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | nullable, FK → offers.id |
| user_id | uuid | nullable, FK → auth.users.id |
| action | text | |
| previous_status | text | nullable |
| new_status | text | nullable |
| reason | text | nullable |
| metadata | jsonb | nullable, default '{}' |
| created_at | timestamptz | default: now() |

Comentario: Log de cambios de estado en moderación.

---

## offer_reports

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default: gen_random_uuid() |
| offer_id | uuid | FK → offers.id |
| reporter_id | uuid | nullable, FK → auth.users.id |
| report_type | text | check: precio_falso, no_es_oferta, expirada, spam, afiliado_oculto, otro |
| comment | text | nullable |
| status | text | nullable, default: 'pending', check: pending, reviewed, dismissed |
| created_at | timestamptz | default: now() |

Comentario: Reportes estructurados por oferta.
