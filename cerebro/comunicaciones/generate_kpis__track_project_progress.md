---
tipo: comunicacion
regla: rule-pkg-011
fuente: generate_kpis
destino: track_project_progress
evento: KPI_REPORT_GENERATED
protocolo: REST
rama: comm/generate_kpis__track_project_progress
programadores:
actualizado: 2026-07-23
tags: [comunicacion, KPI_REPORT_GENERATED]
---
# generate_kpis -> track_project_progress

> Regla `rule-pkg-011` - evento `KPI_REPORT_GENERATED` - protocolo REST
> Rama de trabajo: `comm/generate_kpis__track_project_progress`

## Las dos tools
- **Fuente:** [[../tools/generate_kpis]]
- **Destino:** [[../tools/track_project_progress]]

## Contrato
- **Evento:** `KPI_REPORT_GENERATED`
- **Protocolo / topic:** REST `POST /api/mgmt/progress`
- **Condicion de disparo:** `always`
- **Descripcion:** KPIs generados actualizan el avance del proyecto de implementacion ISO

## Forma del payload
```json
{
  "event": {
    "type": "KPI_REPORT_GENERATED",
    "category": "system",
    "severity": "low"
  },
  "data": {
    "plant_id": "plant_01",
    "period": "monthly",
    "kpis": [
      { "name": "OEE", "value": 12.5, "unit": "percent", "trend": "worsening" }
    ],
    "organization_id": "ORG-001",
    "project_id": "PRJ-001",
    "project_name": "ISO 9001 rollout",
    "as_of_date": "2026-07-23T12:00:00Z",
    "planned_start_date": "2026-07-01T00:00:00Z",
    "planned_end_date": "2026-09-30T00:00:00Z",
    "planned_progress_percent": 40,
    "actual_progress_percent": 34,
    "milestones": [],
    "budget": {
      "planned_amount": 100000,
      "actual_amount": 50000,
      "currency": "MXN"
    }
  }
}
```

## Bitacora de la comunicacion

- [2026-10-30] (codex) El adaptador de TPP usa por defecto los proyectos ya conservados en su propio estado; projects explícito en configuración sustituye esa fuente. Pruebas de API y consumo tras reinicio mantienen prioridades, marca test y cursor. El replay continúa sin acceder al volumen desplegado.

- [2026-10-29] (codex) Propuesta compatible con el brief original: TPP acepta projectId/project_id y resuelve los campos faltantes desde projects en TOOL_BUSINESS_CONFIG_FILE; entrada explícita tiene prioridad. Consumidor, API y replay comparten resolución. Sin proyecto/contexto sigue not_calculable; contextos sintéticos conservan marca test. No exige ampliar el productor generate_kpis; pendiente validar con líder y otro desarrollador la fuente compartida. Detalle en docs/TPP_PROJECT_CONTEXT.md.

- [2026-10-13] (codex) Runbook: contexto de proyecto recibido se normaliza sin inventar ID, fechas o avance; una entrada no calculable se conserva en `rejected` y avanza cursor. Contexto completo se prueba con datos QA marcados, no acredita datos reales del ERP.
<!-- Cada cambio en el contrato entre estas dos tools se anota aqui.
     Asi el programador del otro lado ve que cambio sin leer el codigo.
     Formato:  - [YYYY-MM-DD] (quien) que cambio en el payload/condicion y por que -->
- [2026-06-28] (auto) nota inicial generada desde communication-rules.json.
- [2026-07-23] (codex) `generate_kpis` conserva su rol de consolidar KPIs, pero ahora propaga campos de proyecto cuando vienen en el evento para que `track_project_progress` pueda calcular riesgo real; si faltan, `track_project_progress` devuelve `null`.

## Flujo de trabajo
1. `npm run rama:comm generate_kpis__track_project_progress` (crea/cambia a la rama `comm/generate_kpis__track_project_progress`).
2. Implementa el cambio en ambas tools si aplica y actualiza esta bitacora.
3. PR de la rama a `feature/filter` cuando el contrato quede estable.
