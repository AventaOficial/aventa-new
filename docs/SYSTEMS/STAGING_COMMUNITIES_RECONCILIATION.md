# STAGING COMMUNITIES RECONCILIATION

**Date:** 2026-09-17  
**Status:** **OUT OF W1** — design only  

---

## Conflict

| | Staging | Production / canonical app |
|--|---------|----------------------------|
| `communities.id` | **bigint** | **uuid** |
| Extra staging cols | owner_id, revenue_*, join_policy, … | minimal (name, slug, description, icon, created_at) |
| Rows staging | **0** | 1 on prod |
| Dependents staging | `community_members`, `ofertas.community_id`, RPCs `create_community`, … | `community_offers` (uuid) |

---

## Why no W1 conversion

- No safe automatic `bigint → uuid` CAST without rewriting FKs/functions.  
- Brief forbids CAST automático.  
- Zero staging rows does **not** justify silent DROP/recreate without approved wave.  
- Foundation baseline correctly **excludes** communities.

---

## Recommended later wave (not now)

1. Rename staging `communities` → `communities_legacy_bigint` (or keep and create `communities_v2`).  
2. Create uuid `communities` + `community_offers` from prod shape.  
3. Update RPCs / app paths.  
4. Deprecate legacy.

**W1 action:** document only; no DDL on communities.
