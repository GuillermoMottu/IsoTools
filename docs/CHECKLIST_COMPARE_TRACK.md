# Checklist de compare y track

Trabajo publicado en el fork, rama `comm/sync_erp_data_local__compare_planned_vs_actual`.
Este documento distingue lo probado localmente de la aceptación en Railway.
El usuario autorizó el 2026-10-13 completar las tareas propias, incluyendo publicar
en el fork y configurar/desplegar ambas tools mediante el workflow. El despliegue
de esta versión está verificado; no se han publicado eventos reales.

## Corrección de diagnóstico y contrato — 2026-10-13

El usuario entregó la clave que generó y que el líder validó para `compare-track`.
Probada directamente contra la API oficial: ambas suscripciones respondieron 200,
con sus `consumer` y `consumes` correctos. La consulta limitada devolvió 0 eventos
para compare y 1 para track. La clave es aceptada para lectura; no faltaba generar
otra ni se demostró que el administrador hubiera omitido registrarla.

El workflow recibe esa credencial desde el secreto de Actions `ISOTOOLS_API_KEY`,
valida la suscripción y la aplica a cada servicio solo si difiere. Se transmite a
la CLI por stdin, con `--skip-deploys`; no se imprime ni se añade al repositorio.
Las claves selladas se conservan y requieren revisión.
El [despliegue correctivo 38483520741](https://github.com/GuillermoMottu/IsoTools/actions/runs/38483520741)
pasó en ambas tools. Los indicadores `central_key_changed: true` y
`supplied_central_key_verified: true` confirman que la clave anterior era distinta
de la entregada por el usuario; se sustituyó y el GET central desde Railway pasó
de 401 a 200. No era necesario generar una nueva clave ni cambiar el registro central.

Estado actual: ambas sirven `d6b6a2b533d316656218198990cbbcc1eb67ad33`, `/health` 200,
SSO abierto, API URL oficial, clave aceptada para lectura y volumen `/data` conservado.
Los consumidores siguen deshabilitados, `/ready` 503 `consumer_disabled`, cursor null,
sin publicaciones pendientes ni registros. No se publicaron eventos productivos.

Además, upstream documenta en `docs/ERP_CENTRAL.md` y la comunicación de cierre que
la meta no viene del ERP. Se corrigió nuestra divergencia: un cierre válido sin meta
publica `status: sin_meta`, valor real y desviaciones null, y avanza el cursor solo
después del ACK. No exige inventar organización/meta para publicar ese hecho.
Metas configuradas inválidas conservan el cursor. Las entradas inválidas se conservan
en `rejected`, se registran y se avanza el cursor, como pide el runbook.
La evidencia más reciente está en [RESULTADOS_RUNBOOK_COMPARE_TRACK.md](RESULTADOS_RUNBOOK_COMPARE_TRACK.md).
Track sigue requiriendo contexto real para emitir una alerta de proyecto.
Se revisó por GET el evento disponible en la suscripción de track: `data` contiene
solo `kpis`, `period`, `plantId`. El evaluador confirmó `not_calculable` por ausencia
de organización, ID/nombre de proyecto, fecha de evaluación, inicio/fin planificados
y porcentajes planificado/real. Esta carencia se comprobó en el evento recibido.

## Resultado del despliegue inicial — 2026-10-13

Ambas tools sirven el commit `4e22663227591fa3e9a8ff4e6b9b1e17fb808521`.
Track pasó en el [job de despliegue](https://github.com/GuillermoMottu/IsoTools/actions/runs/38479134828/job/115577122658)
y compare en el [run posterior](https://github.com/GuillermoMottu/IsoTools/actions/runs/38479300211).
La [inspección final conjunta](https://github.com/GuillermoMottu/IsoTools/actions/runs/38479515797)
pasó en ambas: URL oficial, volumen `/data`, identidad, SHA y SSO abierto confirmados;
la clave central permanece rechazada con 401 y los consumidores deshabilitados.
El primer intento detectó que la CLI de volumen exige el ID del servicio: se corrigió
y probó. Al crear el volumen de compare, la consulta inmediata aún no lo mostraba;
el reintento conservó ese mismo volumen, sin crear otro.

| Comprobación del despliegue inicial | compare | track |
| --- | --- | --- |
| `/health` sin credenciales | [HTTP 200](https://cpa.orcalabs.mx/health), tool y SHA correctos | [HTTP 200](https://tpp.orcalabs.mx/health), tool y SHA correctos |
| `/auth/me` | HTTP 200, `mode: open` | HTTP 200, `mode: open` |
| Interfaz en navegador | Carga; 0 análisis reales | Carga; 0 proyectos reales |
| `ISOTOOLS_API_URL` | URL oficial configurada | URL oficial configurada |
| `ISOTOOLS_API_KEY` | Conservada; la API central devuelve 401 | Conservada; la API central devuelve 401 |
| Estado en volumen persistente | `/data`, confirmado por workflow | `/data`, confirmado por workflow |
| `/ready` | 503, `consumer_disabled` | 503, `consumer_disabled` |
| `/api/tool/status` | Cursor null, sin publicaciones pendientes ni registros | Cursor null, sin publicaciones pendientes ni registros |

La salud comprueba el proceso, identidad y escritura inicial del estado. El consumidor
está pausado por los bloqueos de integración; no se presenta como listo para eventos.
La persistencia se comprobó por montaje y escritura en producción y con reinicio/reintento
en pruebas locales. No se inyectaron datos ficticios para probar el volumen productivo.
El repositorio original y el core desplegado no se modificaron.

### Entrega pendiente de plataforma y datos

1. **Dueño del core:** registrar `TOOL_URL_COMPARE_PLANNED_VS_ACTUAL=https://cpa.orcalabs.mx`
   y `TOOL_URL_TRACK_PROJECT_PROGRESS=https://tpp.orcalabs.mx` y aplicar/recargar su
   configuración. El catálogo de esta rama ya declara subdominios y propietario.
   Confirmar delegación externa antes de activar los consumidores para evitar duplicados.
2. **Dueño de los datos:** aportar organización y meta aprobada para una comparación
   completa. Su ausencia no impide publicar el cierre ERP como `sin_meta`. El productor
   de KPIs debe aportar proyecto y contexto calculable a track (se detalla abajo).
3. **Con esos insumos:** configurar los datos y activar
   `TOOL_CONSUMER_ENABLED=true` en cada servicio. Acordar un evento nuevo o cursor de
   repetición explícito, comprobar entrada/salida y revisar su cadena en el dashboard.
   No se activa automáticamente ni se reproducen históricos para forzar una demostración.
   La clave ya funciona para lectura; la publicación se verificará con el evento
   real acordado, sin fabricar una prueba productiva.

El GET final al registro central devolvió ambas `url: null`, `healthUrl: null`,
`health.state: unknown / sin desplegar`; compare figura `live` y track `pending` en
ese core anterior. Este es el pendiente que explica la discrepancia con Railway.
SSO con IdP y reutilización de sesión entre tools requiere las credenciales posteriores
del líder; para la fase actual ya se cumple la plantilla en modo abierto.

## Inspección inicial anterior al despliegue — 2026-10-13

Se publicaron únicamente el workflow, el inspector, su prueba y este documento en
el fork `GuillermoMottu/IsoTools`, rama `comm/sync_erp_data_local__compare_planned_vs_actual`.
La inspección final [38474376305](https://github.com/GuillermoMottu/IsoTools/actions/runs/38474376305)
terminó correctamente en ambas tools usando el token existente. Los logs confirman
`DEPLOY_REQUESTED: false` y ninguna ejecución de `railway up`.

| Comprobación | compare | track |
| --- | --- | --- |
| Dominio encontrado | `cpa.orcalabs.mx` | `tpp.orcalabs.mx` |
| `/health` anónimo | HTTP 200 | HTTP 200 |
| `/auth/me` | HTTP 200, `mode: open` | HTTP 200, `mode: open` |
| `ISOTOOLS_API_URL` | Sin configurar | Sin configurar |
| `ISOTOOLS_API_KEY` | Configurada; API central responde HTTP 401 | Configurada; API central responde HTTP 401 |
| Volumen montado en `/data` | No; listado de volúmenes consultado | No; listado de volúmenes consultado |
| `TOOL_CONSUMER_ENABLED=true` | No | No |
| Configuración de negocio montada | No | No |
| Identidad de la nueva versión en `/health` | No cumple el contrato nuevo | No cumple el contrato nuevo |

La URL de suscripción consultada fue la API oficial y la clave permaneció únicamente
en memoria del runner. HTTP 401 significa que la API central no acepta esa credencial;
no permite concluir si está vencida, revocada o corresponde a otro servicio.
El token de Railway sí es funcional y no necesita reemplazarse para acceder a estas tools.
La inspección no cambia secretos ni crea volúmenes.

Además, `/api/v1/console/tools` del core sigue devolviendo `url: null`, `healthUrl: null`
y salud `unknown / sin desplegar` para ambas. Tener `/health` público no equivale a
estar registrada y viva en el dashboard central.

Las páginas de aceptación del dashboard indicadas por el usuario son:

- [compare_planned_vs_actual](https://api-events.orcalabs.mx/herramientas/compare_planned_vs_actual)
- [track_project_progress](https://api-events.orcalabs.mx/herramientas/track_project_progress)

Revisadas en el navegador el 2026-10-13: ambas muestran modo `federada`, estado y
URL `sin desplegar`, responsable `pendiente de asignar` y SSO desactivado. Los
contratos visibles coinciden con los eventos acordados: compare consume
`ERP_SALES_PERIOD_CLOSED` y publica `PRODUCTION_VARIANCE_DETECTED`; track consume
`KPI_REPORT_GENERATED` y publica `PROJECT_AT_RISK`.

Cada página muestra dos publicaciones de su tool del 2026-07-23, asociadas a las
mismas dos cadenas históricas. La [cadena revisada](https://api-events.orcalabs.mx/eventos/cadena/f140073c-d6a8-49cd-bc4c-5a89d37e0395)
contiene ocho pasos: empieza en `PRODUCTION_VARIANCE_DETECTED`, incluye KPIs y
`PROJECT_AT_RISK`, y termina con registros `FOLLOWUP_SCHEDULED` de julio/agosto.
No contiene la entrada `ERP_SALES_PERIOD_CLOSED`. Es evidencia histórica de
publicaciones y trazabilidad, no de la recepción del cierre ERP ni del consumidor
federado nuevo. Para aceptar el checklist debe aparecer una cadena nueva con la
entrada ERP y su correlación conservada, además de las URLs resueltas y salud actual.

La inspección anterior precede a la nueva autorización. El workflow de despliegue
establece la API URL oficial, conserva el volumen existente o crea uno en `/data`
si no hay ninguno asociado y mantiene el consumidor pausado. No cambia API keys.
Plataforma debe configurar una clave central aceptada y registrar las URLs en el core.
Después se podrá activar el consumidor con metas/contexto reales y verificar la cadena.

## 1. Railway: servicios independientes

Cada Dockerfile de `Docker/` ahora arranca `src/tool-server.js`, sin levantar otro
core ni inicializar Postgres. Reutiliza los handlers y la interfaz ya existentes.

El workflow selecciona la configuración de cada tool para su upload, copiando el
archivo correspondiente a `railway.toml` dentro del runner. Los archivos por servicio son:

| Servicio | Archivo de configuración |
| --- | --- |
| compare-planned-vs-actual | `Docker/compare_planned_vs_actual.railway.toml` |
| track-project-progress | `Docker/track_project_progress.railway.toml` |

El `railway.toml` de raíz del repositorio sigue siendo del core. La copia solo ocurre
en el runner, para el upload de la tool. Si el servicio remoto tiene un archivo de
configuración personalizado seleccionado, su dueño debe confirmar que use `railway.toml`
o el archivo correspondiente de esta tabla. La verificación tras desplegar exige la
identidad de la tool y SSO abierto, además del HTTP 200.

Montar un **volumen persistente en `/data`**, una réplica por tool. Variables:

- `TOOL_PAGE_ID`: ID correspondiente (la imagen ya lo define).
- `ISOTOOLS_API_URL=https://api-events.orcalabs.mx/api/v1` (una sola vez `/api/v1`).
- `ISOTOOLS_API_KEY`: clave central con permisos de consulta de eventos y publicación.
- `TOOL_STATE_DIR=/data` (la imagen ya lo define).
- `TOOL_CONSUMER_ENABLED=false` inicialmente; activar `true` tras revisar configuración y evitar dos consumidores del mismo servicio.
- compare: `TOOL_BUSINESS_CONFIG_FILE=/data/business.json`, con organización y metas reales.
- `OIDC_ISSUER` y `TOOL_API_KEY` vacíos durante el modo abierto indicado por el líder.

GitHub tiene `RAILWAY_TOKEN` y los nombres de los dos servicios. No tiene todavía
`COMPARE_PLANNED_VS_ACTUAL_HEALTH_URL` ni `TRACK_PROJECT_PROGRESS_HEALTH_URL`.
El workflow puede obtener la URL de salud de `RAILWAY_PUBLIC_DOMAIN`; si el servicio
solo tiene dominio personalizado, configurar la variable GitHub de salud correspondiente.
No se omite la prueba de salud en el modo de despliegue.
Si son proyectos distintos, usar `RAILWAY_COMPARE_TOKEN` y `RAILWAY_TRACK_TOKEN`;
el token común se conserva como alternativa para un mismo proyecto.
No es posible recuperar el valor de un secreto de GitHub desde la CLI.
El acceso entregado al usuario es para despliegue mediante workflow. Se usa `RAILWAY_TOKEN`
en GitHub Actions: no se necesita acceso del usuario a ese proyecto desde su cuenta personal.
La CLI local sin ese token devuelve `Unauthorized`; el token guardado como secreto GitHub
no puede recuperarse para ejecutarlo localmente.
El usuario confirmó el 2026-10-13 que las variables de los servicios y la API key
central ya están configuradas en Railway. No hay que volver a crearlas: falta comprobarlas
en esos servicios y probar la clave sin revelar su valor. La cuenta personal consultada
no muestra ese proyecto; ese resultado no determina el acceso mediante el token del workflow.

### Inspección por workflow

`Deploy ORCA tools to Railway` incorpora el parámetro `mode`:

- `inspect` (por defecto al ejecutarlo manualmente): consulta las variables de ambos
  servicios con el token, verifica la clave mediante un GET a la suscripción central
  y revisa `/health` sin credenciales. No despliega, publica eventos ni cambia variables.
- `deploy`: prepara URL oficial, identidad, cookie y almacenamiento persistente,
  conservando cualquier volumen y estado existentes. Un consumidor activo exige
  clave funcional; una tool pausada puede desplegarse mientras se corrige la clave.
  Exige configuración abierta y URL de salud; después espera la identidad y el SHA
  exacto de la nueva versión y verifica SSO abierto. Un HTTP 200 de la versión
  anterior no basta para aceptar el despliegue.

`scripts/inspect_railway_tool.js` captura el JSON de variables de la CLI solamente
en memoria. Los logs y el resumen del run muestran un informe limitado a indicadores
y URL pública; nunca los valores de API keys o secretos de sesión. Una clave sellada
aparece configurada pero no legible, con comprobación pendiente (`null`), no como ausente.
No volver a crear una clave sellada para conseguir su valor.

La CLI está fijada a `5.67.1`, cuyo comando `variable list --json` fue verificado.
Las pruebas locales `node scripts/test_railway_inspection.js` comprueban consultas GET,
salud anónima, informes sin secretos y el tratamiento de claves selladas.
El workflow existente está registrado en la rama predeterminada, por lo que se puede
ejecutar su nueva definición con `--ref comm/sync_erp_data_local__compare_planned_vs_actual`
una vez publicada esa rama en el fork. Ejecutar el workflow remoto anterior volvería
a desplegar código anterior, sin estas comprobaciones.

Se verificó por la API de GitHub el último run de este workflow del fork:
[34186328375, 2026-09-08](https://github.com/GuillermoMottu/IsoTools/actions/runs/34186328375),
commit `f9fd7a01b6940db0257862a4e1ff0e0aa69133ee`. Ambos jobs terminaron con `success`,
pero ambos pasos `Smoke health` se omitieron. Esto es evidencia histórica del despliegue,
no aceptación actual del checklist ni despliegue de esta nueva versión local.
Los logs identifican ambos servicios dentro del mismo proyecto Railway:

- [compare-planned-vs-actual](https://railway.com/project/643f31c6-947e-4841-a4d6-989e0b9f0c39/service/e3638694-09d1-4e56-9060-207657d62b89)
- [track-project-progress](https://railway.com/project/643f31c6-947e-4841-a4d6-989e0b9f0c39/service/4aaafb7e-df3e-487f-93e2-1c525dd80c49)

El token compartido es compatible con esa topología histórica; no se justifica crear
otros tokens sin comprobar primero la configuración actual del proyecto.

## 2. SSO: plantilla integrada, fase abierta

Se copiaron los seis módulos de `plantillas/integracion/sso/` a `src/tool-auth/`.
Se adaptó únicamente el mapa de roles: `operations.manager → OperationsManager`
y `platform.auditor → Auditor`. Auditor consulta datos, sin ejecutar la API de evaluación.
La evaluación manual no autoriza operaciones de dominio ni publica eventos.

Sin `OIDC_ISSUER`, `/auth/me` muestra `mode: open`. La clave central nunca se entrega
al navegador. El servicio sirve la interfaz existente y API por el mismo origen.
`/health` y `/ready` siempre son anónimos; `/ready` puede dar 503 si el consumidor
está deshabilitado, falla la clave o falta contexto.

Cuando plataforma entregue el IdP, cada tool necesitará su client ID/secret,
`OIDC_REDIRECT_URI=https://<dominio-real>/auth/callback`, `SESSION_SECRET` propio de
al menos 32 caracteres, y cookies `cpa_session` / `tpp_session`. Ambas usan el mismo
issuer. La sesión compartida vive en el IdP: al entrar en otra tool puede haber una
redirección, pero no una nueva captura de contraseña mientras esa sesión siga vigente.
No compartir cookies ni secretos entre servicios.

Las pruebas locales cubren 401 JSON en API, redirección de deep links conservando
destino, firma y manipulación de cookies, denegación por roles y fallo al arrancar con
configuración incompleta. El handshake real y reutilización de sesión IdP quedan pendientes
de las credenciales. El documento referido `docs/PLATAFORMA-SSO.md` falta también en upstream.

## 3. Consumo, cálculo y publicación

El consumidor ejecuta GET de la suscripción de su ID → evaluación real → POST `/events`
→ persistencia del cursor de entrada. Conserva `correlation_id`, pone `causation_id` al
evento recibido y emite un sobre IES completo con módulo y activo.
Guarda la publicación pendiente **antes** del POST y reintenta con el mismo ID tras
fallas/reinicio. Acepta confirmaciones `accepted` y `duplicate`. Un POST fallido detiene
el lote; nunca avanza por el `seq` del resultado publicado.

Primer arranque sin cursor consulta `/events/latest` y empieza en la punta actual,
sin procesar históricos automáticamente. Para una repetición revisada se puede definir
`TOOL_INITIAL_CURSOR`; una vez creado el estado durable, prevalece el cursor guardado.
No borrar el volumen para redesplegar.

### compare_planned_vs_actual

Consume `ERP_SALES_PERIOD_CLOSED`, publica `PRODUCTION_VARIANCE_DETECTED`.
El JSON del mensaje de conexión es el bloque `data`, no el sobre completo de la respuesta GET.
La respuesta real incluye `events` y `next_seq`; los eventos pueden ser filas planas de Postgres.

`actual` se toma tal cual: no se resta `devuelto` nuevamente.
`business.json` debe contener valores **reales** con esta estructura:

```json
{
  "organization_id": "<identificador real>",
  "sales_plans": [
    {
      "plant_id": "<planta real>",
      "period": "<fecha_inicio>_<fecha_fin>",
      "planned": "reemplazar por numero real, no una cadena",
      "unit": "MXN"
    }
  ]
}
```

No copiar el ejemplo sin sustituirlo: la configuración rechaza metas no numéricas,
duplicadas o en otra unidad. Sin meta publica el hecho ERP como `sin_meta`, con
`details.actual` real, `details.planned: null` y desviaciones null; no fabrica una
organización. Una meta configurada inválida conserva el cursor. Una comparación
con meta pero contexto insuficiente expone `input_not_calculable`. `/analyses` devuelve las entradas adaptadas y
`/api/tool/status` la última evaluación y publicación, con acceso según el modo SSO.
La declaración y regla de conexión están incorporadas al catálogo local, pero el
productor ERP de esta rama sigue siendo anterior al cierre de ventas de upstream.
El adaptador del bloque ERP vive en el consumidor federado; el handler puro sigue
recibiendo el formato rico de métricas. No usar el core local como consumidor del
bloque ERP bruto para validar este flujo.

### track_project_progress

Consume `KPI_REPORT_GENERATED`, publica `PROJECT_AT_RISK` si el proyecto está en riesgo
o atrasado. Un proyecto `on_track` avanza el cursor sin fabricar una alerta.
Para calcular necesita organización, ID/nombre del proyecto, fecha de evaluación,
inicio/fin planificados y porcentajes planificado/real. Hitos y presupuesto agregan
contexto. Un reporte de KPIs de ventas por sí solo no identifica un proyecto.
Si falta contexto conserva el evento, cursor y diagnóstico; `/records` expone los
proyectos recibidos y `/api/tool/status` los campos faltantes.

El paso ventas → KPIs → proyecto todavía necesita que el productor de KPIs entregue
ese contexto real. No se infiere una relación planta/proyecto ni se inventan hitos.
La edición de hitos de la interfaz de demostración depende de su servidor ERP demo;
este servicio de consumo no modifica el ERP por `/project-milestones`.

## 4. Registro central y evidencia de aceptación

El registro central consultado marca compare `live` y track `pending`, pero ambas
URLs de tool/health son null. No basta con que `/health` de cpa responda 200.
En el core configurar `PLATFORM_DOMAIN=orcalabs.mx` para resolver `subdomain: cpa`,
o `TOOL_URL_COMPARE_PLANNED_VS_ACTUAL=https://cpa.orcalabs.mx`.
Para track ya se verificó `https://tpp.orcalabs.mx/health`: falta registrar
`subdomain: tpp` o `TOOL_URL_TRACK_PROJECT_PROGRESS=https://tpp.orcalabs.mx` en el core.
La URL también decide que el router delegue:
verificarla antes de activar un consumidor externo para evitar ejecución duplicada.
Confirmar que las reglas posteriores siguen activas y no filtran la salida útil.
El registro local ya declara ambas federadas y desplegadas; estos cambios de catálogo
no han sido aplicados al core desplegado.

| Checklist | Evidencia comprobada | Pendiente |
| --- | --- | --- |
| Railway | Ambas versiones nuevas desplegadas y volumen confirmado | Ninguno para el proceso pausado |
| /health sin credenciales | HTTP 200, tool y SHA correctos en ambos dominios | Ninguno |
| SSO abierto | Plantilla y pruebas aprobadas; ambas versiones muestran `mode: open` | IdP real en la fase posterior |
| URL y API key | URL oficial y clave del usuario configuradas; GET central 200 en ambas | Confirmar publicación con evento real acordado |
| Tool viva en dashboard | Configuración de registro identificada | Resolver URLs, health y estado de ambas |
| Entrada y salida | Ciclos HTTP de ventas/proyecto y reintento probado | Evento real con metas/contexto confirmado |
| Cadena completa | Correlación/causación y cursor probados | Revisar `/events/chain/<correlation_id>` y dashboard central |

Validación local: `node scripts/test_tool_service.js`, pruebas existentes de compare,
track, contrato KPI/proyecto e hitos; `node scripts/validate-platform-data.js` y
`npm run cerebro:generar`. Las pruebas no publican en producción ni usan datos reales.

Evidencia del 2026-10-13: ambas imágenes (`isotools-compare:checklist` y
`isotools-track:checklist`) construidas y verificadas con `scripts/smoke_tool_image.js`.
La integración HTTP/SSO pasó también dentro de la imagen Node 22, sin red externa.
La validación de catálogo pasó con un aviso: SPC sin subdominio (preexistente).
Track ya declara `subdomain: tpp` localmente. `git diff --check` pasó.

Límites: un escritor por volumen; no hay failover ni soporte de múltiples réplicas.
Un evento inválido queda conservado en `rejected` con motivo y fecha, genera log y
permite avanzar la suscripción. Una configuración inválida requiere corrección y
conserva el cursor. Los registros se conservan en JSON;
usar un almacén transaccional y una política de retención cuando crezca el volumen.
