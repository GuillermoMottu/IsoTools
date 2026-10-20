# Revisión completa del runbook de compare y track

Fecha: 20 de octubre de 2026. Alcance: nuestras dos tools; no certifica las demás tools del catálogo.

**Todavía no se puede declarar cumplido todo el documento. Sí había trabajo nuestro por completar: ya se añadieron y ejecutaron pruebas de resiliencia con procesos reales, se completó la lectura operativa por CI y se corrigieron notas y pendientes desactualizados.** El bloqueo principal sigue siendo Logto; hay pruebas finales que deben completarse en los servicios desplegados.

## Documento y criterio de revisión

Se releyeron los 33 pasos numerados y los recuadros ERP del documento original [Runbook de pruebas](<D:/Descargas/Runbook_Pruebas_Tools_IsoTools (1).docx>).

SHA256 del archivo: `f779ed6e5e116a6e975864229b3e44d7b1782f88742f28cf20a63a6daf8a7dac`.

Las instrucciones del documento se tomaron como criterios de prueba. No autorizan por sí mismas alterar el servicio del líder, cambiar una URL productiva ni publicar datos adicionales. Esta revisión no desplegó, no modificó variables de Railway y no publicó eventos QA nuevos.

La evaluación anterior había mezclado estos criterios con aceptación empresarial adicional. El recuadro ERP del punto 8 dice explícitamente que no se espere al ERP real y permite eventos simulados marcados `qa_runbook` y `metadata.test=true`. Por tanto, un cierre ERP real, una meta aprobada o un proyecto empresarial real son necesarios para esa aceptación adicional, pero no son requisitos para ejecutar la prueba de integración del runbook. Tampoco es obligatorio forzar un acuse duplicate en producción para aprobar 9.1: el documento lo admite como diagnóstico de un reintento.

## Trabajo nuestro completado en esta revisión

- 19 de 19 regresiones pasaron con Node v22.23.3 en Linux y sin red externa.
- Nuevo `scripts/test_runbook_runtime.js`: pasó para compare y track, con HTTP y procesos Node reales, sin credenciales productivas. No altera el código de los handlers.
- La prueba descarta una entrada malformada, procesa la siguiente, devuelve 400 a input inválido y mantiene readiness 200 con una suscripción vacía.
- Reinicia el proceso con una URL local inaccesible: health sigue en 200, readiness informa 503, se observan reintentos reales de 10 y 20 segundos y el cursor queda conservado.
- Restaura la URL, recibe un evento posterior y reinicia con una publicación pendiente. Conserva el UUID y recupera un acuse perdido como duplicate sin perder ni duplicar salidas. Cursor probado: 2 → 3.
- Se incorporó la nueva prueba antes de cualquier cambio de Railway en ambos jobs de despliegue.
- Dos builds Vite nuevos, uno por tool, con manifiestos; sin marcadores prohibidos ni coincidencias con los cinco valores privados locales o sus prefijos.
- La inspección CI de solo lectura confirmó el estado SUCCESS de ambos deployments, el montaje persistente, la key central válida, el scope roles y la configuración de retorno al dashboard. No detectó las variables de credenciales ERP/Cloudflare identificadas por el inspector.
- Se revisaron logs productivos: poll y published en ambas tools, con acuses 201. Track también registra descartes de entradas no calculables. Los informes omiten mensajes libres, secretos y datos de eventos.
- Se corrigió la interpretación de logs estructurados de Railway y su filtro por atributos, con regresiones que impiden imprimir campos privados.
- Se corrigieron las notas locales que todavía describían consumidores pausados. No se cambió el registro central del líder.
- Se abrió el dashboard y la vista Eventos el día 20: ambas tools aparecen en línea y se observaron PROJECT_AT_RISK de track y PRODUCTION_VARIANCE_DETECTED de compare con sus cadenas QA.

## Estado comprobado en producción el 20 de octubre

| Comprobación | Compare | Track |
| --- | --- | --- |
| SHA servido | `0f7af25780308e516ebe7a55a65ddcb2b1a07e16` | `0f7af25780308e516ebe7a55a65ddcb2b1a07e16` |
| Deployment consultado por CLI | SUCCESS | SUCCESS |
| Health y readiness | 200 | 200 |
| Autenticación | SSO | SSO |
| Sesión/API anónimas | 401 JSON | 401 JSON |
| Acceso con credencial propia de servicio | 200 | 200 |
| Cursor | 7679 | 7684 |
| Publicación pendiente | No | No |
| Volumen persistente | Confirmado por CI | Confirmado por CI |
| API key central | Válida | Válida |
| Revisión de assets con secretos reales disponibles | Sin coincidencias | Sin coincidencias |
| Logs revisados | poll, published | poll, published, discarded |
| Callback enviada por la tool | Correcta | Correcta |
| Respuesta de Logto al inicio del login | 400 invalid_redirect_uri | 400 invalid_redirect_uri |
| Registro central | owner pendiente; solo operations.manager | owner pendiente; solo operations.manager |

Las dos cadenas QA del 19 de octubre se releyeron el día 20. Compare conserva la salida exacta `229406da-7160-45b3-964d-aff51dfe7ea9`, estado `sin_meta`, cadena de 5 eventos. Track conserva `ab53486f-5c06-4fc1-980f-f002362f8714`, estado `at_risk`, cadena de 3 eventos. Se verificaron identidad, causación y correlación. No se generaron entradas nuevas para esta revisión.

## Los 33 pasos del documento

**Cumple** acredita la evidencia indicada. **Parcial** deja una parte pendiente. **Local** acredita ejecución aislada y no sustituye una prueba literal en Railway. **Bloqueado** identifica un impedimento observado. **No aplica** conserva un caso condicional del documento, sin activarlo en producción.

| Paso | Estado | Evidencia y cierre restante |
| --- | --- | --- |
| 1.1 Deployment Active | Cumple por CLI | Estado privado SUCCESS e identidad/SHA correctos, además de health y ready. Ya no depende de acceder al panel personal de Railway. |
| 1.2 Health público | Cumple | HTTP 200 JSON sin sesión ni key en ambas tools. |
| 1.3 Readiness | Cumple | HTTP 200; consumidores habilitados. |
| 2.1 URL y key configuradas | Cumple | Inspección privada de ambas; URL canónica /api/v1 y key presente. |
| 2.2 Core responde API | Cumple | /api/v1/health responde 200 JSON, service=isotools. |
| 2.3 Suscripción autenticada | Cumple | GET con key desplegada devuelve 200 y consumidor/contrato esperados. |
| 3.1 Registro completo en plataforma | Pendiente de plataforma | Local tiene owner y roles; el registro servido conserva owner pendiente de asignar y solo operations.manager. Preparada la propuesta para el líder. |
| 3.2 Aparición y salud en dashboard | Cumple en revisión básica | Ambas tools observadas en línea en el dashboard y la barra lateral el 20, además de salud up en el registro. |
| B.0.1 URIs, secreto y cookie propios | Parcial | Secretos y cookies propios configurados; callback productiva correcta. Falta registrar o confirmar URIs en Logto, incluidas las de desarrollo y logout. |
| B.0.2 Usar las variables Logto | Cumple | Alias implementados, pruebas OIDC reales con IdP local y ambos servicios en SSO. |
| B.0.3 Scope y mapeo de roles | Parcial | Scope roles presente y traducción verificada con IdP local. Falta comprobar los claims de usuarios reales. |
| B.0.4 Secretos solo en backend | Cumple en revisión dirigida | Archivos privados ignorados; escaneo de builds y assets remotos con prefijos reales disponibles sin coincidencias. No es una certificación integral de seguridad. |
| B.0.5 Login completo y auth/me con roles | Bloqueado por Logto | El proveedor rechaza ambas callbacks con oidc.invalid_redirect_uri antes de pedir credenciales. |
| 4.1 Abrir interfaz y Network | Parcial | Se revisó antes de SSO; falta repetir con una sesión real en la versión actual. |
| 4.2 API del mismo origen y sin CORS | Parcial | Rutas relativas verificadas y respuestas actuales sin Access-Control-Allow-Origin. Falta observar la navegación autenticada completa. |
| 5.1 Compilar interfaz | Cumple | Dos builds nuevos el 20 de octubre, uno por tool. |
| 5.2 Buscar secretos y prefijos | Cumple en assets revisados | Builds locales y bundles desplegados contrastados; no hay coincidencias con los marcadores/prefijos comprobados. |
| 6.1 API sin cookie devuelve 401 JSON | Cumple | APIs y auth/me de ambas tools rechazan acceso anónimo; key incorrecta también rechazada en la validación anterior. |
| 6.2 Deep link retorna tras login | Parcial | 302, destino conservado y PKCE comprobados; el regreso real requiere corregir Logto. |
| 6.3 Usuario real sin roles no modifica | Local | Roles vacíos/desconocidos y auditor sin permiso de operación pasan con IdP simulado. Falta cuenta real sin roles tras corregir Logto. |
| 7.1 Consultar catálogo | Cumple | HTTP 200 en ambos catálogos el 20. |
| 7.2 Contrato igual al código | Cumple | Compare: ERP_SALES_PERIOD_CLOSED → PRODUCTION_VARIANCE_DETECTED. Track: KPI_REPORT_GENERATED → PROJECT_AT_RISK. |
| 8.1 Recibir y procesar evento | Cumple en QA desplegada | QA del 19 con registros y salidas propias, reconsultadas el 20. Los eventos simulados están permitidos por el documento. |
| 8.2 Logs de consumo y procesamiento | Cumple en evidencia revisada | Logs de cada deployment muestran poll y published con input_seq y HTTP 201; track además muestra discarded. Se preservan solo campos permitidos en el informe. |
| 8.3 Otro poll sin duplicar y cursor persistente | Cumple en muestra QA | Despliegue/reinicio real del 19 conservó estado; entradas antiguas y nuevas tenían una salida propia cada una. Polling y cursores revalidados el 20. No acredita todas las fallas posibles de disco. |
| 9.1 Publicación con 201 | Cumple en QA | Acuses 201 registrados y salidas presentes. La nueva prueba local también cubre el acuse 200 duplicate tras perder una respuesta. |
| 9.2 Salida en Flujo de eventos | Cumple en revisión visual | Vista Eventos abierta el 20: PROJECT_AT_RISK con track_project_progress y PRODUCTION_VARIANCE_DETECTED con compare_planned_vs_actual, enlazadas a sus cadenas QA. Captura conservada. |
| 10.1 Tomar correlation_id | Cumple | Identificadores QA retenidos y entrada exacta identificada. |
| 10.2 Consultar cadena completa | Cumple en QA | API máquina del workflow del 19 y relectura de consola del 20: entrada, salida propia y sucesores existentes. |
| 11.1 Descartar malformado y avanzar | Local; evidencia parcial desplegada | Nuevo ensayo con procesos reales pasa en ambas tools. Track desplegado muestra descartes y avance; no se inyectó deliberadamente una entrada malformada nueva en compare durante esta revisión. Falta completar ese caso en el servicio si se exige la ejecución literal productiva. |
| 11.2 URL inválida y recuperación | Local, pendiente en Railway | Nuevo ensayo real de proceso con cambio de URL, health 200, backoff y recuperación pasa en ambas. No se cambió la URL de los servicios del líder; falta ejecutar allí el ensayo temporal con restauración si se exige el paso literal. No hace falta apagar el core. |
| 12.1 Consistencia visual | Parcial | Revisión básica previa y builds nuevos sin cambios de UI. Falta repasar las pantallas autenticadas actuales cuando Logto permita entrar. |
| 12.2 Aviso en modo abierto | No aplica en producción | B.0 exige SSO obligatorio. El componente de desarrollo contiene el aviso; no se abre producción para probarlo. |

## Recuadros específicos de ERP

- La tool no llama directamente a ERP ni Cloudflare. En la inspección privada no aparecieron los nombres de credenciales ERP/Cloudflare reconocidos por el inspector; se verificaron los prefijos CF_ACCESS_, MICROSIP_ y los campos de conexión/credencial ERP contemplados.
- Suscripción vacía no hace fallar readiness: probado con proceso y HTTP reales, y polling productivo actual con count=0 y ready 200.
- La forma de ERP_SALES_PERIOD_CLOSED usada en los tests coincide con el ejemplo del documento. Importes como texto, campos faltantes, N/A, fechas, planta y periodo se validan; no se resta devuelto dos veces.
- El mismo periodo conserva su clave y permite actualizar una corrección sin crear otro registro; event_id ya procesado no repite efectos. Las regresiones pasaron otra vez.
- Una entrada inválida no publica una salida con NaN. El dato anterior y su procedencia permanecen disponibles ante una interrupción.
- La interfaz usa su propio backend. La fuente, fecha y marca Datos de prueba están implementadas y cubiertas por regresión; su observación en la sesión productiva actual queda junto a la revisión visual posterior a Logto.
- La validación de planta/ERP real y una meta comercial aprobada quedan como aceptación empresarial adicional, no como impedimento para la QA simulada admitida por este runbook.

## Qué queda y quién puede cerrarlo

1. **Plataforma:** registrar callbacks correctas en Logto, confirmar la aplicación de cada tool y disponer cuentas con/sin roles. Está preparado el [detalle de entrega al líder](ENTREGA_LIDER_RUNBOOK_2026-10-20.md).
2. **Plataforma:** alinear owner y requiredRoles del registro servido con la matriz definitiva; no se publica unilateralmente al core.
3. **Nosotros, después de Logto:** ejecutar login real, auth/me con roles, denegación por permisos, deep links, logout, Network y revisión visual. No requieren otro secreto de sesión ni reabrir la aplicación.
4. **Nosotros y operador de Railway:** completar los ensayos desplegados que faltan de 11.1 y 11.2, con datos QA y restauración revisada. La evidencia local ya está preparada; no se declara equivalente a una ejecución productiva.
5. **Nosotros:** adjuntar el resultado de las pruebas humanas y de los ensayos desplegados pendientes antes de declarar todos los pasos aceptados. La revisión del Flujo de eventos ya se completó el día 20.

No se identificó en las pruebas actuales otro defecto funcional de los handlers que impida estos ensayos. Esto no equivale a afirmar que el sistema esté libre de errores ni que los 33 pasos estén aceptados.

## Evidencia y reproducción

- [Inspección operativa de solo lectura](https://github.com/GuillermoMottu/IsoTools/actions/runs/39498746931).
- [Despliegue del 19](https://github.com/GuillermoMottu/IsoTools/actions/runs/39330751889) y [QA marcada del 19](https://github.com/GuillermoMottu/IsoTools/actions/runs/39331063240).
- [Resiliencia con procesos Node 22](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/runtime-resilience.log>).
- [19 regresiones Node 22](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/node22-regression.log>).
- [HTTP y Logto del 20](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/live-check.json>).
- [Contratos y cadenas reconsultadas](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/contracts-and-existing-qa.json>).
- [Informes privados sanitizados](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/inspection-39498746931.json>).
- [Escaneo de builds nuevos](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/fresh-build-scan.json>).
- [Vista Eventos con las salidas propias de compare y track](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-recheck-2026-10-20/dashboard-events.png>).

La prueba nueva se ejecuta con `node scripts/test_runbook_runtime.js`; tarda aproximadamente un minuto y usa únicamente un core local simulado, credenciales ficticias y directorios temporales propios. Se ejecutó dentro de un contenedor Node 22 con `--network none`, código en solo lectura y `/tmp` aislado.

La consulta de deployment y logs usa los comandos oficiales [deployment list](https://docs.railway.com/cli/deployment) y [logs](https://docs.railway.com/cli/logs). Los atributos estructurados se consultan con la [sintaxis oficial de filtros](https://docs.railway.com/observability/logs). No se emitieron mensajes libres ni metadatos privados del deployment.
