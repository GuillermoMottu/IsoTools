# Resultado de la continuación CPA/TPP

Fecha local: 30 de octubre de 2026. Solo nuestras tools. No se modificó el repositorio original, Logto, el ERP ni el dashboard; no se enviaron mensajes a terceros.

## TPP integrado y desplegado

El [PR 3 del fork](https://github.com/GuillermoMottu/IsoTools/pull/3) se integró en nuestra rama de tools como `479decaf4435b40db5219e46dde9b0b4eafe3c73`, sin tocar main. El [workflow 41015315913](https://github.com/GuillermoMottu/IsoTools/actions/runs/41015315913) desplegó únicamente TPP. CPA y los jobs de publicación QA quedaron skipped. Las pruebas de configuración, inspección, consumidores, ocho casos de desarrollo, resolución por projectId, procesos/reintentos, servicio y handshakes OIDC pasaron en Node 22 antes del despliegue.

TPP resuelve projectId/project_id desde sus registros persistidos; un registro projects explícito en TOOL_BUSINESS_CONFIG_FILE puede sustituir esa fuente. Los datos de la entrada prevalecen y las referencias del contexto y del nuevo evento se conservan. No se elige un proyecto por defecto ni se completan datos inexistentes. Los proyectos sintéticos mantienen test=true.

Después del despliegue se comprobó con la credencial legítima de servicio:

- Evaluación con solo projectId de un proyecto QA ya existente: HTTP 200, at_risk.
- Evaluación de un ID desconocido: HTTP 400, not_calculable.
- Estado completo del consumidor idéntico antes/después de esas evaluaciones: sin publicaciones al bus, cambios de cursor o cambios de registros.
- La prueba de servicio no acredita permisos humanos. No se cambiaron roles ni se eludió la autorización de usuarios.

Evidencias: [despliegue y comparación de estado](evidencias/despliegue_tpp_41015315913.json) y [prueba projectId en el servicio desplegado](evidencias/tpp_projectid_desplegado_2026-10-30.json).

## Persistencia y consulta sustitutiva R2

La [inspección previa 41015156872](https://github.com/GuillermoMottu/IsoTools/actions/runs/41015156872) obtuvo el cursor desde el endpoint autenticado de cada tool y consultó su suscripción usando ese cursor. Solo hizo GET. La [inspección final 41015831865](https://github.com/GuillermoMottu/IsoTools/actions/runs/41015831865) repitió la lectura:

| Tool | Cursor antes/después | Registros | Rechazados conservados | Entradas posteriores al cursor | Publicación pendiente |
| --- | --- | --- | --- | --- | --- |
| CPA | 7679 / 7679 | 2 | 0 | 0 | No |
| TPP | 7684 / 7684 | 3 | 4 | 0 | No |

Los hashes de todos los registros también coinciden antes/después. CPA conserva su imagen `5dd8fb199636c51053a10055da508b4a659cf400`; TPP sirve el SHA integrado `479decaf4435b40db5219e46dde9b0b4eafe3c73`. No se rebobinó ningún consumidor.

Queda ejecutada la consulta sustitutiva de R2 indicada por el DOCX. Como las suscripciones estaban vacías, no prueba la retención de entradas pendientes durante una caída ni una interrupción real: esas pruebas no se realizaron. Los cuatro rechazos de TPP son conservados del estado previo, no errores nuevos atribuidos al despliegue.

Evidencias: [inspección previa](evidencias/inspeccion_previa_41015156872.json) e [inspección final](evidencias/inspeccion_final_41015831865.json).

## Estado del conector: evidencia parcial de R1

Se consultó GET /api/v1/connectors/erp_microsip con la credencial de lectura operativa. La respuesta fue 200. El conector figuraba habilitado; sus cinco registros persistidos tenían error y el contador observó 241 fallos consecutivos. Última ejecución registrada: 2026-10-30T06:42:34.975Z (UTC).

El informe conserva cantidades, estados y fecha; no copia el texto crudo de errores, URL del gateway, credenciales o cursores del ERP. No se ejecutó un ciclo, reset, recuperación o cambio de conector. Ese estado no demuestra por sí solo si la causa es ERP apagado, conectividad, túnel u otra falla.

Esto aporta la lectura de estado de R1; la comparación global MAX(received_at) por todos los tipos ERP y la recuperación de la planta siguen correspondiendo al coordinador/equipo del core/ERP. No se declara aprobado R1 completo.

## Replay e inventario actualizado

El [replay 41015867791](https://github.com/GuillermoMottu/IsoTools/actions/runs/41015867791) pasó sus límites de GET-only y terminó sin publicar ni acceder al volumen de los servicios. Utilizó la credencial operativa existente: es diagnóstico, no acredita el requisito formal de key limitada exclusivamente a events:read.

| Tool | Inventario | Resultado del ensayo histórico |
| --- | --- | --- |
| CPA | 4 ERP_SALES_PERIOD_CLOSED; los 4 marcados como prueba | Sin entrada no QA elegible; escenario histórico no ejecutable con el inventario encontrado. |
| TPP | 15 KPI_REPORT_GENERATED; 11 marcados como prueba | La candidata seq=53 no tiene projectId ni contexto suficiente, procedencia ERP comprobada o salida propia exacta; not_calculable. No acredita PV-7.4. |

La nueva resolución por projectId no puede asignar un ID a ese KPI histórico sin inventarlo. La evaluación positiva del proyecto QA desplegado se conserva como validación de desarrollo, separada de la cadena histórica del escenario 7. No se convirtió una prueba en un hecho ERP ni se republicaron entradas para completar el inventario.

Evidencia: [replay actualizado](evidencias/replay_41015867791.json).

## SSO después de iniciar sesión otra vez

La sesión humana renovada de CPA del 30 de octubre continuó con authenticated=true, roles=[] y role=null; /api/analyses devolvió insufficient_role. Reiniciar sesión no resolvió el problema. El [registro sanitizado](evidencias/sso_relogin_cpa_2026-10-30.json) no contiene credenciales, cookies, tokens ni identificadores de cuenta.

La configuración efectiva de scope/claim/mapeo de nuestras tools ya fue contrastada. Carlos o el líder, confirmado como administrador, debe revisar la asignación y emisión de roles y luego repetir con nosotros una sesión autorizada. El despliegue de TPP conserva SESSION_SECRET y la política de permisos.

## Qué falta y quién lo hace

| Pendiente | Responsable |
| --- | --- |
| Asignación/entrega de roles Logto y posterior prueba humana positiva | Carlos/líder; nosotros verificamos. |
| Emitir key exclusivamente events:read e instalarla en ISOTOOLS_READONLY_API_KEY para el ensayo formal | Administrador del core/Actions. El secreto aún no existe según la consulta de nombres realizada. |
| Revisar/aplicar el parche de owner/requiredRoles del registro original | Líder/administrador del core; [parche preparado](propuestas/registro-central-cpa-tpp.patch). |
| Acordar projectId/fuente del proyecto e identificar una entrada guardada adecuada para el escenario 7 | Nosotros, desarrollador de generate_kpis y líder. No se requieren usuarios de negocio para los datos de desarrollo. |
| Pruebas compartidas R3–R6 y el resto de R1 | Coordinador y desarrolladores responsables; nosotros participamos en lo que afecta a CPA/TPP. |

PV-7.1/7.2 tienen cálculo y adaptación probados; falta la evidencia sobre la entrada ERP guardada elegible. PV-7.4 tiene cálculo y servicio probados con QA; falta la cadena guardada elegible. PV-7.3 y PV-7.5 pertenecen a otros desarrolladores. No queda pendiente integrar o desplegar el PR de TPP.
