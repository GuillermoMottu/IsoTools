# TPP: resolver un proyecto por projectId

Implementación de desarrollo del contrato original: el solicitante puede enviar solo projectId; nuestra tool consulta el contexto del proyecto en su configuración local. Se conserva la entrada completa anterior y los mismos cálculos. No se obliga al productor de KPIs a enviar los ocho campos de nuestro evaluador.

Por defecto, la fuente son los proyectos ya recibidos y conservados en records del estado persistente de nuestra tool. Se puede definir un registro explícito con TOOL_BUSINESS_CONFIG_FILE, el mismo JSON opcional que ya lee el consumidor: su propiedad projects, si está presente, sustituye esa fuente y es un objeto indexado por project_id. Cada registro declara su propio project_id y los campos necesarios para evaluar avance. El ejemplo [tpp_projects.development.json](../scripts/fixtures/tpp_projects.development.json) contiene un proyecto sintético QA-PRJ-ISO marcado test=true. No es una consulta a una BD empresarial ni acredita una fuente compartida ya acordada.

Para usarlo localmente, antes de arrancar TPP:

```powershell
$env:TOOL_PAGE_ID='track_project_progress'
$env:TOOL_BUSINESS_CONFIG_FILE=(Resolve-Path scripts/fixtures/tpp_projects.development.json).Path
```

El cuerpo de evaluación en POST /api/tool/track_project_progress/run puede ser:

```json
{ "input": { "projectId": "QA-PRJ-ISO" } }
```

La autenticación de ese endpoint se conserva: un operador autorizado o una credencial de servicio válida. El registro se consulta después de pasar autenticación y autorización. La API evalúa sin publicar ni modificar el cursor. El consumidor del bus y el replay usan la misma resolución.

Reglas de resolución:

- projectId y project_id son alias. Los campos explícitos de la entrada tienen prioridad sobre la configuración, incluidos valores null que deben ser rechazados por la validación; no se reemplazan silenciosamente por datos válidos.
- Sin ID no se elige un proyecto por defecto. Si no existe el ID configurado o faltan sus datos, la evaluación conserva not_calculable. No se deducen proyectos de KPIs agregados.
- El estado conserva la última entrada recibida del proyecto, incluso si es incompleta; no se reconstruye una versión anterior que pudiera estar desactualizada. Sin archivo de configuración, la API consulta esa instantánea y el consumidor puede completar una actualización parcial desde ella. El replay de solo lectura no abre el estado desplegado: usa únicamente la configuración suministrada al ensayo.
- La fecha y los porcentajes del archivo son datos explícitos de desarrollo. Deben actualizarse deliberadamente para otro ensayo; no se usa la fecha actual ni un porcentaje fijo como sustituto de información faltante.
- Una configuración mal formada o cuyo ID interno no coincide con su clave se rechaza. El consumidor no avanza esa entrada por un error de configuración.
- Los registros test=true propagan la marca de prueba a las publicaciones del consumidor, aunque la entrada no la tenga. El replay informa configured_context_is_test=true y requiere revisión; no declara equivalencia histórica usando contexto sintético.
- La evaluación completa sigue requiriendo organización, identidad/nombre del proyecto, fecha de evaluación, fechas de plan y porcentajes de avance. Esos campos pueden venir de la configuración o de la entrada; no dejan de validarse.

Comprobación: node scripts/test_project_context_lookup.js cubre la API HTTP real en localhost, el consumidor con bus simulado y el replay GET-only. Incluye precedencia entre alias, proyectos desconocidos, null explícito, configuración inválida, trazabilidad de prueba y ausencia de publicaciones/cambios de cursor desde la API. Se añade a los preflight existentes del workflow.

Esta rama comm/generate_kpis__track_project_progress contiene la implementación y la bitácora para revisión. Integrarla en el fork y configurar proyectos en una instancia de desarrollo es trabajo propio; el líder y el desarrollador de generate_kpis deben aceptar la interfaz/fuente compartida antes de dar por cerrada la integración entre equipos. No se modificaron sus handlers ni el repositorio original.
