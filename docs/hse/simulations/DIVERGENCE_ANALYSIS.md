# Divergence Analysis - HSE-02

**Label:** SIMULATED DIVERGENCE (E2)  
No determina cual ruta es "mejor".

## TASK-001 - Encontrar una oferta interesante

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-002 - Encontrar oferta en categoria

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales chips categoria o /categoria/[slug]/abrir; USER-C:vitales chips categoria o /categoria/[slug]/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:vitales chips categoria o /categoria/[slug]/abrir; USER-F:vitales chips categoria o /categoria/[slug]/abrir; USER-G:vitales chips categoria o /categoria/[slug]/abrir; USER-H:vitales chips categoria o /categoria/[slug]/abrir; USER-I:vitales chips categoria o /categoria/[slug]/abrir; USER-J:vitales chips categoria o /categoria/[slug]/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-003 - Evaluar una oferta

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-004 - Abrir detalles

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 3 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-005 - Comparar ofertas

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→EVALUATION | SUCCESS | SIM-ERR-1 | 6 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-B: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-C: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-D: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-E: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-F: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-G: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-H: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-I: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-J: errCount=1, SIM-ERR-1, outcome=SUCCESS

## TASK-006 - Ir a la tienda (outbound)

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-007 - Guardar/favoritar

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-2 | 4 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-2 | 4 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-2 | 4 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-2 | 4 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-2, outcome=FAILURE
- USER-B: errCount=1, SIM-ERR-2, outcome=FAILURE
- USER-G: errCount=1, SIM-ERR-2, outcome=FAILURE
- USER-H: errCount=1, SIM-ERR-2, outcome=FAILURE

## TASK-008 - Votar

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-1 | 4 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-1 | 4 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-1, outcome=FAILURE
- USER-B: errCount=1, SIM-ERR-1, outcome=FAILURE
- USER-G: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-H: errCount=1, SIM-ERR-1, outcome=PARTIAL

## TASK-009 - Comentar

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-1 | 4 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | EXIT | SIM-ERR-0 | 4 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-1 | 4 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | FAILURE | SIM-ERR-1 | 4 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→ACTION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-1, outcome=FAILURE
- USER-G: errCount=1, SIM-ERR-1, outcome=FAILURE
- USER-H: errCount=1, SIM-ERR-1, outcome=FAILURE

## TASK-010 - Publicar

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→ACTION | PARTIAL | SIM-ERR-1 | 2 | 0 | anon |
| USER-B | ENTRY→ACTION | PARTIAL | SIM-ERR-1 | 2 | 0 | anon |
| USER-C | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |
| USER-D | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |
| USER-E | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |
| USER-F | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |
| USER-G | ENTRY→ACTION | PARTIAL | SIM-ERR-1 | 2 | 0 | anon |
| USER-H | ENTRY→ACTION | PARTIAL | SIM-ERR-1 | 2 | 0 | anon |
| USER-I | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |
| USER-J | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 4 | 0 | auth |

### Decision divergence
- USER-A:-; USER-B:-; USER-C:-; USER-D:-; USER-E:-; USER-F:-; USER-G:-; USER-H:-; USER-I:-; USER-J:-

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-B: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-G: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-H: errCount=1, SIM-ERR-1, outcome=PARTIAL

## TASK-011 - Revisar oferta propia

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→ACTION | FAILURE | SIM-ERR-3 | 2 | 0 | anon |
| USER-B | ENTRY→ACTION | FAILURE | SIM-ERR-3 | 2 | 0 | anon |
| USER-C | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |
| USER-D | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |
| USER-E | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |
| USER-F | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |
| USER-G | ENTRY→ACTION | FAILURE | SIM-ERR-3 | 2 | 0 | anon |
| USER-H | ENTRY→ACTION | FAILURE | SIM-ERR-3 | 2 | 0 | anon |
| USER-I | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |
| USER-J | ENTRY→ACTION | SUCCESS | SIM-ERR-0 | 2 | 0 | auth |

### Decision divergence
- USER-A:-; USER-B:-; USER-C:-; USER-D:-; USER-E:-; USER-F:-; USER-G:-; USER-H:-; USER-I:-; USER-J:-

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-3, outcome=FAILURE
- USER-B: errCount=1, SIM-ERR-3, outcome=FAILURE
- USER-G: errCount=1, SIM-ERR-3, outcome=FAILURE
- USER-H: errCount=1, SIM-ERR-3, outcome=FAILURE

## TASK-012 - Reencontrar oferta

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | PARTIAL | SIM-ERR-1 | 4 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→DISCOVERY | SUCCESS | SIM-ERR-1 | 4 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- USER-A: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-B: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-C: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-D: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-E: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-F: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-G: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-H: errCount=1, SIM-ERR-1, outcome=PARTIAL
- USER-I: errCount=1, SIM-ERR-1, outcome=SUCCESS
- USER-J: errCount=1, SIM-ERR-1, outcome=SUCCESS

## TASK-013 - Uso recurrente

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DECISION→SESSION | SUCCESS | SIM-ERR-0 | 5 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-014 - Uso movil

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 3 | auth |

### Decision divergence
- USER-A:Inicio/default visible (vitales/top - exploracion); USER-B:Inicio/vitales|latest; USER-C:Inicio/top + timeFilter; USER-D:Inicio/vitales chips categoria o /categoria/[slug]; USER-E:Inicio/personalized (Para ti); USER-F:Inicio/vitales|latest; USER-G:Inicio/vitales|latest; USER-H:Inicio/vitales|latest; USER-I:Inicio/vitales|latest; USER-J:Inicio/personalized (Para ti)

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

## TASK-015 - Uso desktop

| USER | Route sketch | Outcome | SIM-ERR | Ints | Decs | Auth |
|---|---|---|---|---|---|---|
| USER-A | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | anon |
| USER-B | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | anon |
| USER-C | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-D | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-E | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-F | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-G | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | anon |
| USER-H | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | anon |
| USER-I | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |
| USER-J | ENTRY→DISCOVERY→DISCOVERY→DISCOVERY→DECISION→OUTCOME | SUCCESS | SIM-ERR-0 | 4 | 2 | auth |

### Decision divergence
- USER-A:default visible (vitales/top - exploracion)/abrir; USER-B:vitales|latest/abrir; USER-C:top + timeFilter/abrir; USER-D:vitales chips categoria o /categoria/[slug]/abrir; USER-E:personalized (Para ti)/abrir; USER-F:vitales|latest/abrir; USER-G:vitales|latest/abrir; USER-H:vitales|latest/abrir; USER-I:vitales|latest/abrir; USER-J:personalized (Para ti)/abrir

### Information priority divergence
- USER-A: attention brand/first_cards; ignore bias in profile
- USER-B: attention image/discount_badge; ignore bias in profile
- USER-C: attention price/store; ignore bias in profile
- USER-D: attention discount/original_price; ignore bias in profile
- USER-E: attention para_ti_tab/known_paths; ignore bias in profile
- USER-F: attention subir_cta/form_fields; ignore bias in profile
- USER-G: attention large_buttons/images; ignore bias in profile
- USER-H: attention tabbar/hero_search; ignore bias in profile
- USER-I: attention sidebar/sticky_search; ignore bias in profile
- USER-J: attention cta/price; ignore bias in profile

### Error divergence
- Sin errores simulados en esta tarea para auth users tipicos.

