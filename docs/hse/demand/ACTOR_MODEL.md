# Actor Model

**Evidence:** E1 roles deseados · E3 estado actual resumido

## Comprador

| | Hoy (E3) | Rol hipotético (E1) |
|---|---|---|
| Quiere | Ofertas / a veces pedir en Plaza | Expresar intención; recibir candidatos útiles; decidir |
| No debe | Esperar marketplace fulfillment | Confundir AVENTA con tienda |
| Poder | Crear request parcial; buscar feed | Elegir A vs B; cerrar/expirar; valorar respuesta |

**Papel:** dueño de la intención y de la decisión de compra (outbound).

## Hunter

| | Hoy (E3) | Rol hipotético (E1) |
|---|---|---|
| Quién | Publisher genérico / extensión; no rol ligado a request | Persona que aporta candidato verificable a una intención |
| Hace | Subir oferta | Responder con evidencia (link, precio, vigencia) |
| No es | Empleado de AVENTA | Garantía de encontrar todo |

**Papel:** aportar oferta o tip de calidad; no “trabajar tickets” como helpdesk a menos que el producto lo diseñe explícitamente (no recomendado sin evidencia).

## Comunidad

| | Hoy (E3) | Rol hipotético (E1) |
|---|---|---|
| Hace | Votos, comments, discusiones Plaza | Votar relevancia, avisar caducidad, aportar contexto |
| Valor | Trust social débil a baja escala | Validación colectiva de respuestas |

**Papel:** reducir incertidumbre; no sustituir fulfillment.

## AVENTA (sistema)

Capacidades conceptuales (E1): interpretar · buscar · ordenar · validar · presentar · conectar.

| Capacidad | Hoy | Hipótesis de uso |
|---|---|---|
| Interpretar intención | No | Solo si mejora match vs keyword simple |
| Buscar en catálogo propio | Search parcial | Primero en cadena C |
| Ordenar / presentar | Feed ranking | Rank por constraints + trust |
| Validar | Señales oferta parcial | Flags vigencia/precio |
| Conectar demanda–oferta | Loop roto | Solo tras evidencia de valor |
| Notificar | Missing en Plaza | Crítico si hay espera |

**Papel propuesto (E1):** **orquestador**, no marketplace ni empleador de hunters.  
Prioridad: match interno → (opcional) alerta → (opcional) comunidad/hunter cuando el sistema no alcanza.

## Matriz de responsabilidad (E1)

| Función | Comprador | Hunter | Comunidad | AVENTA |
|---|---|---|---|---|
| Definir necesidad | ● | | | ayuda clarificar |
| Encontrar candidato | | ● | ◐ | ● (catálogo) |
| Validar | ◐ | ◐ | ● | ● señales |
| Decidir compra | ● | | | |
| Moderación spam | | | ◐ | ● |
