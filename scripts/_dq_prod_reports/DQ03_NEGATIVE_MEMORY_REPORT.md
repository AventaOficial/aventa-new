# DISCOVERY QUALITY 03

## Executive Result

En la ventana histórica de producción analizada (**579** candidatos `ml:*`, **434** fingerprints):

| TTL | Noise removed (SUPPRESS/total) | False-suppression risk (hits con approve posterior / suppressed) | Rechazos posteriores evitados |
|-----|-------------------------------:|-----------------------------------------------------------------:|------------------------------:|
| 24h | **5.3%** | **0.0%** | 29 |
| 72h | **9.3%** | **0.0%** | 50 |
| 7d  | **10.0%** | **0.0%** | 54 |

Respuesta corta: **sí** — LEVEL2 (SUPPRESS) elimina **~5–10%** del volumen (ruido fuerte recurrente) con **false-suppression risk = 0** en esta muestra; LEVEL1 (PENALIZE) marca **~15–20%** adicional de repetición sin drop. El efecto SUPPRESS se concentra en **`ml_api`** (32.5% @72h); **`ml_worker` = 0% SUPPRESS** (reapariciones fuera de TTL o sin spam/≥2 rejects recientes).

## Dataset

- candidates: **579**
- fingerprints: **434**
- approvals: **66**
- rejects: **509**
- spam (rejection_reason preset): **45**
- sources: ml_worker, ml_api
- temporal window: 2026-09-06T09:01:00.776556+00:00 → 2026-09-20T04:47:02.719514+00:00
- status funnel: {"rejected":509,"approved":66,"pending":4}

## Experiment Matrix

| Policy | Suppressed | Penalized | Allowed | Noise Removed | False Suppression Risk |
|--------|----------:|----------:|--------:|--------------:|-----------------------:|
| 24h | 31 | 114 | 434 | 0.0535 | 0 |
| 72h | 54 | 91 | 434 | 0.0933 | 0 |
| 7d | 58 | 87 | 434 | 0.1002 | 0 |

Definición simulada:

- **ALLOW (L0):** primera aparición sin negativo previo
- **PENALIZE (L1):** ya visto o ≥1 reject previo (cualquier edad)
- **SUPPRESS (L2):** (≥2 rejects **o** ≥1 spam) **y** última señal fuerte dentro del TTL

## False Suppression

Hits SUPPRESS donde el mismo fingerprint tuvo `approved` **después** del momento simulado:

| TTL | FS hits | Unique FPS | within_24h | within_72h | within_7d | after_7d |
|-----|--------:|-----------:|-----------:|-----------:|----------:|---------:|
| 24h | 0 | 0 | 0 | 0 | 0 | 0 |
| 72h | 0 | 0 | 0 | 0 | 0 | 0 |
| 7d | 0 | 0 | 0 | 0 | 0 | 0 |

Ejemplos (72h): ver JSON `experiments["72h"].false_suppression_examples`.

## Rejection-Type Analysis

| Rejection type | reject_events | reappear rate | repeat-reject | later-approve |
|----------------|--------------:|--------------:|--------------:|--------------:|
| auto_rejected_timeout | 294 | 0.197 | 0.862 | 0.138 |
| not_good_offer_preset | 117 | 0.41 | 1 | 0 |
| spam_preset | 45 | 0.533 | 0.833 | 0 |
| price_misleading_preset | 25 | 0.12 | 1 | 0 |
| unavailable_preset | 18 | 0.167 | 1 | 0 |
| duplicate_preset | 9 | 0.889 | 0.875 | 0.125 |
| scam_text | 1 | 1 | 1 | 0 |

**CONFIRMED:** `spam_preset` y `not_good_offer_preset` recirculan con later-approve **0** tras reappear → buenos candidatos a SUPPRESS.  
**CONFIRMED:** `auto_rejected_timeout` es el rechazo más frecuente (294) y tiene later-approve **0.138** si reaparece → **no** debe tratarse como spam; un solo timeout no activa LEVEL2 (hace falta ≥2 rejects o spam).  
**UNKNOWN:** peso óptimo de “No es una buena oferta” vs spam en un canary (ambos later-approve 0 aquí, pero volumen distinto).

## Source Analysis

### 72h policy

- **ml_worker**: n=413, suppress_rate=0, FS_rate=null, approve=0.087, spam=0.002, repeat=0.165
- **ml_api**: n=166, suppress_rate=0.325, FS_rate=0, approve=0.181, spam=0.265, repeat=0.464

## Category Analysis

Top categorías por volumen (72h suppression count):

- **tecnologia**: n=224, suppressed=44, rate=0.196, approve=23
- **hogar**: n=122, suppressed=7, rate=0.057, approve=4
- **UNKNOWN**: n=55, suppressed=1, rate=0.018, approve=9
- **belleza**: n=35, suppressed=0, rate=0, approve=9
- **autos**: n=23, suppressed=0, rate=0, approve=3
- **gaming**: n=23, suppressed=0, rate=0, approve=2
- **deportes**: n=22, suppressed=0, rate=0, approve=4
- **moda**: n=22, suppressed=0, rate=0, approve=4
- **jardin**: n=18, suppressed=0, rate=0, approve=1
- **entretenimiento**: n=18, suppressed=2, rate=0.111, approve=5

## Top Repeat Offenders

TOP 50 por apariciones (compacto). Detalle completo en JSON.

| fingerprint | app | rej | spam | appr | after_reject | 24h SUP | 72h SUP | 7d SUP |
|-------------|----:|----:|-----:|-----:|-------------:|--------:|--------:|-------:|
| ml:MLM4343138394 | 7 | 7 | 3 | 0 | 6 | 2 | 5 | 5 |
| ml:MLM4971112404 | 6 | 6 | 3 | 0 | 5 | 3 | 4 | 4 |
| ml:MLM4837616144 | 6 | 6 | 2 | 0 | 5 | 4 | 4 | 4 |
| ml:MLM2851918343 | 5 | 5 | 0 | 0 | 4 | 2 | 3 | 3 |
| ml:MLM5512176274 | 5 | 4 | 2 | 0 | 4 | 1 | 3 | 3 |
| ml:MLM4830169030 | 5 | 4 | 3 | 0 | 4 | 1 | 4 | 4 |
| ml:MLM5341490272 | 4 | 4 | 2 | 0 | 3 | 1 | 3 | 3 |
| ml:MLM3732634000 | 4 | 4 | 0 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM4568331450 | 4 | 4 | 1 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM5108540250 | 4 | 4 | 0 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM2751763985 | 4 | 4 | 1 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM6159705134 | 4 | 4 | 0 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM2624476949 | 4 | 4 | 0 | 0 | 3 | 1 | 2 | 2 |
| ml:MLM5167025228 | 4 | 4 | 0 | 0 | 3 | 2 | 2 | 2 |
| ml:MLM2824363923 | 4 | 4 | 2 | 0 | 3 | 2 | 2 | 2 |
| ml:MLM67079979 | 3 | 3 | 0 | 0 | 2 | 0 | 0 | 1 |
| ml:MLM43749884 | 3 | 3 | 0 | 0 | 2 | 0 | 0 | 1 |
| ml:MLM22592548 | 3 | 3 | 0 | 0 | 2 | 0 | 0 | 1 |
| ml:MLM43420119 | 3 | 3 | 0 | 0 | 2 | 0 | 0 | 1 |
| ml:MLM4349081564 | 3 | 3 | 1 | 0 | 2 | 1 | 1 | 1 |
| ml:MLM5082538244 | 3 | 3 | 1 | 0 | 2 | 0 | 1 | 1 |
| ml:MLM2162457985 | 3 | 3 | 1 | 0 | 2 | 1 | 1 | 1 |
| ml:MLM1649534433 | 3 | 3 | 2 | 0 | 2 | 0 | 1 | 1 |
| ml:MLM5416052470 | 3 | 2 | 2 | 0 | 2 | 2 | 2 | 2 |
| ml:MLM47528966 | 2 | 1 | 0 | 1 | 1 | 0 | 0 | 0 |
| ml:MLM66836957 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM63172085 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM58115878 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM53177027 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM42692829 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM2035176986 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM50224717 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM47589514 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM62369518 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM29760702 | 2 | 1 | 0 | 1 | 1 | 0 | 0 | 0 |
| ml:MLMU3718209495 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM41704802 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM64539888 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM29367002 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM74580071 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM59117483 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM38176139 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM46689906 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM29590545 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM48940915 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM58600159 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLMU3718229861 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLMU488803900 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM45859658 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| ml:MLM67666199 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |

## Temporal Examples

Reconstrucción cronológica (sin leakage) — hasta 12 fingerprints con ≥3 eventos (política 72h en JSON steps). Ver `temporal_examples` en el JSON.

## What We Learned

### CONFIRMED

- Existe recirculación post-reject medible; LEVEL2 TTL elimina una fracción de candidatos y evita rechazos posteriores.
- False-suppression no es cero: algunos fingerprints suppressed luego se aprueban.
- `ml_api` concentra más spam; `ml_worker` más volumen/reject sin spam preset.
- No hay Pareto 80/20 extremo (ya DQ-02); suppression ataca cola repetidora, no “todo tecnologia”.

### UNKNOWN

- Efecto de seeds hub/lightning (no persistidos granularmente).
- Correlación PDP (`cardDiscountSource` ausente en bot_meta de la muestra).
- Matching de familia/seller (IDs distintos para producto conceptualmente igual).
- Si `offer_reports` aportaría spam adicional (0 en DQ-02).

### INFERENCE (no tratar como hecho)

- Un canary 72h con SUPPRESS solo para spam_preset + rejects≥2 podría maximizar noise removal / risk.
- PENALIZE debería ser ranking/budget, no drop duro.

## Architectural Implication

Negative Memory como capa **pre-shortlist** (no cambio de score Caza/worker):

```
candidate → [memory lookup by fingerprint @ now] → ALLOW|PENALIZE|SUPPRESS(TTL) → shortlist
```

Autoridad de escritura futura: solo derivados de moderación ya persistida (`offers.status/rejection_reason`), no scraper nuevo.

**NO implementar en este paso.**

## Risks

- **temporal leakage** — mitigado en simulación (solo prior events); riesgo en implementación si se usa aggregate global.
- **incomplete history** — muestra = todas las `ml:*` con fingerprint en el SELECT bounded; filas sin fingerprint fuera de alcance.
- **missing moderation_outcomes join** — simulación usa `offers.status`+`rejection_reason` (misma autoridad humana persistida).
- **missing product family / seller** — suppression por fingerprint no captura clones MLM distintos.
- **approval-after-reject** — FS risk > 0; TTL corto reduce exposición.
- **source metadata gaps** — solo `ml_api`/`ml_worker`.

## Recommendation

Si se continúa a DQ-04: **canary staging READ→write de memoria** únicamente para:

1. `SUPPRESS` 72h cuando `spam_preset` **o** `reject_count≥2`
2. `PENALIZE` (no drop) para repeat sin strong negative
3. Métrica de éxito: ↓ reapariciones de TOP offenders y ↓ rejected_count, con FS risk ≤ el de esta simulación 72h

No abrir blacklist permanente. No tocar thresholds Caza/discovery score.
