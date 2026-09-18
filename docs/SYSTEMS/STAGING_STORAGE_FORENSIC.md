# STAGING STORAGE FORENSIC

**Date:** 2026-09-17  
**Staging ref:** `oojshofrpbfwsiypcecr`  
**Production ref (READ-ONLY):** `mkgsrpsuvedwwlzmzmzh`  
**Scope:** forensic only — **NO** file copy from production, **NO** PII, **NO** bucket changes on production.

---

## Bucket inventory

### STAGING (`oojshofrpbfwsiypcecr`)

| Bucket | Public | Classification |
|--------|--------|----------------|
| `ofertas` | true | **VERIFIED** — legacy Spanish name |
| `ofertas-images` | true | **VERIFIED** — legacy |

**Missing vs app code:** `offer-images` → **MISSING**

### PRODUCTION (`mkgsrpsuvedwwlzmzmzh`)

| Bucket | Public | Classification |
|--------|--------|----------------|
| `offer-images` | true | **VERIFIED** — canonical name used by app |

---

## Policies

### Staging (`storage` schema)

| Policy | cmd | Classification |
|--------|-----|----------------|
| `ofertas read` / `ofertas_read_public` | SELECT public | **VERIFIED** (legacy bucket) |
| `ofertas insert` / `ofertas_upload_own_folder` | INSERT | **VERIFIED** |
| `ofertas_update_own` / `ofertas_delete_own` | UPDATE/DELETE | **VERIFIED** |
| `Give users authenticated access to folder…` | INSERT `ofertas-images` | **VERIFIED** |
| Policies for `offer-images` | — | **MISSING** |

### Production

| Policy | cmd | Classification |
|--------|-----|----------------|
| `Allow public read offer-images` | SELECT public | **VERIFIED** |
| `avatars_*` (insert/update/delete/select) | various | **VERIFIED** policies exist; **avatars bucket presence UNKNOWN** (not in buckets list) |

---

## Application helpers

| Code path | Bucket | Classification |
|-----------|--------|----------------|
| `app/api/upload-offer-image/route.ts` | **`offer-images`** | **VERIFIED** — will **fail on staging** until bucket exists |
| `app/api/upload-profile-avatar/route.ts` | **`offer-images`** (avatars path under same bucket) | **VERIFIED** |
| HEAD check after upload | fetches public URL | **VERIFIED** |
| Mime allowlist jpg/png/webp, max 2MB | — | **VERIFIED** |

---

## Offer image URLs today (staging)

| Source | Example / pattern | Classification |
|--------|-------------------|----------------|
| W1.5 synthetic seed | `https://placehold.co/...` | **VERIFIED** — external HTTPS, no staging bucket needed |
| Legacy `ofertas` rows | unknown hosts in legacy table | **UNKNOWN** (unused by app) |
| Canonical `offers.image_url` | text URL (not Storage object id) | **VERIFIED** |

**Implication:** Distribution text+optional photo can use **stored HTTPS `image_url`** without uploading to Storage, **if** URL is safe.

---

## What Distribution needs

| Need | Requirement | Status |
|------|-------------|--------|
| **1. Text message** | No storage required | **READY** (app/schema side) |
| **2. Optional image** | HTTPS URL from `offers.image_url` / `image_urls[0]` | **READY** for seed URLs; upload path **BLOCKED** on staging without `offer-images` |
| **3. Fallback no image** | Send text-only when missing/unsafe URL | Spec **VERIFIED**; adapter code **MISSING** |
| **4. Validate image URL** | HTTPS + host allowlist / block private IPs | **MISSING** dedicated Distribution validator (SSRF risk if naive `fetch`) |
| **5. Avoid SSRF** | Never server-fetch arbitrary user URLs into bot API without allowlist | **UNSAFE** if implemented without guard; currently **no** distribution fetch code |

---

## Conceptual prod vs staging gap

```text
PROD:     bucket offer-images (public) ←── upload-offer-image
STAGING:  buckets ofertas / ofertas-images (public)
          ❌ no offer-images
APP CODE: always .from('offer-images')
```

Creating `offer-images` on staging (public read + authenticated upload policies matching prod) is a **future additive** step — **not done in this forensic wave**.

---

## Safety rules

1. Do **not** sync/copy production Storage objects (PII / copyright / size).  
2. Do **not** change production buckets from staging work.  
3. For Telegram `sendPhoto`, prefer **URL mode** with allowlisted hosts OR upload from already-trusted Supabase public URL.  
4. Reject `file://`, link-local, metadata IPs, non-HTTPS.

---

## Verdict

| Area | Status |
|------|--------|
| Staging buckets exist | **VERIFIED** (legacy names) |
| Canonical `offer-images` on staging | **MISSING** |
| Prod storage model understood | **VERIFIED** |
| Distribution text path | **READY** |
| Distribution image path | **BLOCKED** for uploads; **UNKNOWN**/careful for remote URL fetch |
| SSRF-safe image validation helper | **MISSING** |
