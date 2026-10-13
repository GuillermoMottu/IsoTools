# Preparación del checklist de compare y track

Trabajo local en `comm/sync_erp_data_local__compare_planned_vs_actual`.
Este documento distingue lo probado localmente de la aceptación en Railway.
No se ha desplegado esta versión ni publicado eventos en el bus productivo.

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
- `deploy`: exige API URL/clave funcional, configuración abierta, volumen `/data`, ruta
  de estado compatible y URL de salud; después sube la tool, espera salud y verifica
  la identidad y modo SSO de la versión desplegada.

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
duplicadas o en otra unidad. Sin meta/organización calculable mantiene el cursor y
expone `input_not_calculable`. `/analyses` devuelve las entradas adaptadas y
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
Para track falta confirmar su dominio real y registrar `subdomain` o
`TOOL_URL_TRACK_PROJECT_PROGRESS`. La URL también decide que el router delegue:
verificarla antes de activar un consumidor externo para evitar ejecución duplicada.
Confirmar que las reglas posteriores siguen activas y no filtran la salida útil.
El registro local ya declara ambas federadas y conserva track como `pending`;
estos cambios de catálogo no han sido aplicados al core desplegado.

| Checklist | Evidencia local | Aceptación productiva pendiente |
| --- | --- | --- |
| Railway | Dockerfiles/config por servicio, imágenes construidas y arranque probado | Aplicar configuración/volumen y desplegar esta versión |
| /health sin credenciales | HTTP 200 probado en ambas imágenes | Comprobar ambas URLs reales tras despliegue |
| SSO abierto | Plantilla y pruebas de middleware aprobadas | Confirmar `/auth/me` de ambas versiones desplegadas |
| URL y API key | HTTP central simulado con clave y rutas correctas | Validar clave central configurada en Railway |
| Tool viva en dashboard | Configuración de registro identificada | Resolver URLs, health y estado de ambas |
| Entrada y salida | Ciclos HTTP de ventas/proyecto y reintento probado | Evento real con metas/contexto confirmado |
| Cadena completa | Correlación/causación y cursor probados | Revisar `/events/chain/<correlation_id>` y dashboard central |

Validación local: `node scripts/test_tool_service.js`, pruebas existentes de compare,
track, contrato KPI/proyecto e hitos; `node scripts/validate-platform-data.js` y
`npm run cerebro:generar`. Las pruebas no publican en producción ni usan datos reales.

Evidencia del 2026-10-13: ambas imágenes (`isotools-compare:checklist` y
`isotools-track:checklist`) construidas y verificadas con `scripts/smoke_tool_image.js`.
La integración HTTP/SSO pasó también dentro de la imagen Node 22, sin red externa.
La validación de catálogo pasó con dos avisos: SPC sin subdominio (preexistente)
y track sin dominio confirmado. `git diff --check` pasó.

Límites: un escritor por volumen; no hay failover ni soporte de múltiples réplicas.
Un evento inválido bloquea la suscripción y requiere corregir el origen/configuración:
no se elimina ni se salta silenciosamente. Los registros se conservan en JSON;
usar un almacén transaccional y una política de retención cuando crezca el volumen.
