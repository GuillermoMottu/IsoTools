---
title: Bitácora del cerebro
updated: 2026-06-28
---

# Bitácora del cerebro de IsoTools

Registro cronológico de cambios significativos en el vault. Una línea por evento.

## [2026-10-30] Contexto persistido de TPP
- La API y el consumidor TPP resuelven projectId desde sus registros conservados cuando no hay un registro projects explícito; las referencias de los eventos y las marcas de prueba se mantienen. Ver comunicaciones/generate_kpis__track_project_progress.

## [2026-10-29] TPP por projectId
- Propuesta en comm/generate_kpis__track_project_progress: resolver contexto desde configuración propia para aceptar el identificador del contrato original; API, consumidor y replay comparten el adaptador. Ver comunicaciones/generate_kpis__track_project_progress y docs/TPP_PROJECT_CONTEXT.md. No se implementan ni modifican otras tools.

## [2026-06-28] init
- Vault creado al separar las tools de la plataforma web en el repo **IsoTools**.
- Generadas las notas iniciales: 125 tools, 90 comunicaciones, 13 agentes (`npm run cerebro:generar`).
- 16 tools marcadas como `implementada` (paquete de calidad ISO 9001).
