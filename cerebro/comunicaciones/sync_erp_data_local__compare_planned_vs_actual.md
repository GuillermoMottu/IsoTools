---
source: sync_erp_data_local
target: compare_planned_vs_actual
event: ERP_SALES_PERIOD_CLOSED
rule: rule-conn-001
---

# Cierre ERP → comparación plan vs real

Contrato recibido del equipo de conexión y registrado en upstream/feature/filter.
La tool federada lee `GET /api/v1/events/subscriptions/compare_planned_vs_actual?since_seq=<cursor>`.
El `topic` de la regla es una referencia del catálogo; el transporte real es el bus de eventos.

El bloque `data` contiene `module: sales`, `periodStart`, `periodEnd`, `period` (inicio_fin),
`plantId`, `actual`, `unit`, `documentos`, `unidades`, `devuelto`, `erpType`.
El total `actual` se usa como viene; no se vuelve a restar `devuelto`.
La organización y la meta deben venir de configuración real del dueño de la tool,
con meta por planta y periodo y unidad coincidente. No hay metas predeterminadas.

La capa de transporte de `src/services/toolConsumer.js` adapta este bloque al evaluador
existente sin cambiar el formato de las llamadas manuales. Conserva el payload original
en el bus y sus IDs en `source`; publica `PRODUCTION_VARIANCE_DETECTED` con correlación
y causación del evento de entrada. La categoría del sobre es `productivity` (IES);
`erp` sigue siendo la categoría del catálogo de la tool.

Sin datos calculables, la tool conserva el cursor anterior, muestra `input_not_calculable`
y espera la corrección de la meta/configuración. No publica una alerta falsa.
El productor ERP local de esta rama no implementa todavía el cierre de ventas de upstream;
la integración productiva depende del productor desplegado por el equipo de conexión.

## Bitácora de la comunicación

- [2026-10-13] (codex) Registrada rule-conn-001 y consumo de cierre ERP. Agregado adaptador de ventas y consumidor federado con cursor durable, publicación idempotente y bloqueo explícito ante datos insuficientes.
- [2026-10-13] (codex) Desplegado consumidor aislado en cpa.orcalabs.mx con SSO abierto y volumen persistente. Permanece pausado: clave central devuelve 401 y falta meta/organización real. Sin publicaciones productivas; registro y delegación del core pendientes. Evidencia y pasos de activación en docs/CHECKLIST_COMPARE_TRACK.md.
