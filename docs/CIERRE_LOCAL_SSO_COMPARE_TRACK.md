# Cierre técnico de compare y track

Fecha: 19 de octubre de 2026. Última comprobación de estado: 21:57 UTC (15:57 de Ciudad de México).

Actualización del 20: la [revisión completa del runbook](REVISION_CHECKLIST_RUNBOOK_2026-10-20.md) es el estado vigente. Se confirmaron deployments SUCCESS y logs por CI, se ejecutó la resiliencia con procesos reales y se preparó la [entrega al líder](ENTREGA_LIDER_RUNBOOK_2026-10-20.md). Los datos ERP reales y las metas aprobadas se separan como aceptación empresarial adicional; el documento permite QA simulada. La prueba literal de URL inválida afecta a la tool, no exige apagar el core.

**Nuestras dos tools ya están desplegadas con SSO obligatorio y la QA marcada pasó. El login humano sigue bloqueado por la configuración de callbacks en Logto.** No se considera aceptado todo el runbook mientras ese bloqueo y las pruebas empresariales y operativas pendientes sigan abiertos.

## Cambios aplicados

- Rama del fork: `comm/sync_erp_data_local__compare_planned_vs_actual`.
- Código servido por ambos servicios: `0f7af25780308e516ebe7a55a65ddcb2b1a07e16`.
- [Inspección inicial autorizada](https://github.com/GuillermoMottu/IsoTools/actions/runs/39329650233): encontró Logto y callbacks configuradas, pero SESSION_SECRET y TOOL_API_KEY ausentes.
- [Despliegue autorizado, finalizado correctamente](https://github.com/GuillermoMottu/IsoTools/actions/runs/39330751889): incorporó únicamente los secretos faltantes y desplegó ambas tools. Las pruebas con Node 22 pasaron antes de escribir variables.
- Se conservaron los volúmenes existentes, los consumidores habilitados y la key central. No se creó otro volumen, no se rotaron credenciales existentes y no se reprodujo el historial.
- [QA marcada autorizada, finalizada correctamente](https://github.com/GuillermoMottu/IsoTools/actions/runs/39331063240): publicó dos entradas QA y verificó los registros desplegados, el acuse 201 y sus cadenas exactas.

## Verificación productiva actual

| Comprobación | Compare | Track |
| --- | --- | --- |
| Health y readiness | 200 | 200 |
| Identidad y SHA servido | Correctos | Correctos |
| Autenticación | SSO | SSO |
| SESSION_SECRET y TOOL_API_KEY | Configurados | Configurados |
| Sesión y API anónimas | 401 | 401 |
| API con key incorrecta | 401 | 401 |
| API con credencial propia de servicio | 200 | 200 |
| Deep link sin sesión | 302, destino conservado | 302, destino conservado |
| Inicio OIDC | PKCE S256, state y nonce | PKCE S256, state y nonce |
| Cookie de handshake | Secure y HttpOnly | Secure y HttpOnly |
| Volumen existente y ruta persistente | Conservados | Conservados |
| Registros anteriores tras reemplazar el contenedor | Conservados | Conservados |
| Cursor antes → después del despliegue, antes de QA nueva | 7440 → 7440 | 7445 → 7445 |
| Cursor en la comprobación posterior a QA | 7679 | 7684 |
| Assets contrastados con marcadores y prefijos de secretos | Sin coincidencias | Sin coincidencias |
| Login humano completo | Bloqueado en Logto | Bloqueado en Logto |

La persistencia se comprobó mediante el reemplazo real de los contenedores durante el despliegue, comparando antes y después los identificadores anteriores y el cursor. Las cadenas antiguas y nuevas conservaban una sola publicación propia por entrada después de más ciclos de polling. No se provocó una caída del core, ERP o túnel, ni se hizo una prueba de pérdida abrupta del volumen.

## QA y corrección del informe

Prefijo: `qa-runbook-0d49984c-65f4-4275-a222-92a2abe273e3`.

| Tool | Evento de salida propio | Resultado real | Cadena |
| --- | --- | --- | --- |
| compare_planned_vs_actual | `229406da-7160-45b3-964d-aff51dfe7ea9` | `sin_meta` | 5 eventos |
| track_project_progress | `ab53486f-5c06-4fc1-980f-f002362f8714` | `at_risk` | 3 eventos |

Se verificaron event_id, identidad de la tool, correlation_id, causation_id y el resultado exacto de esas salidas, además de los registros autenticados del consumidor. Las cuatro entradas revisadas —las dos antiguas y las dos nuevas— tenían una sola salida propia cada una. No quedaron publicaciones pendientes.

El resumen original del workflow informó `not_calculable` para track porque usaba `last_evaluation`, que ya correspondía a otra entrada posterior. La salida QA exacta y su evaluación por registro son `at_risk`. Se corrigió `verify_runbook_bus.js` para leer el resultado del evento de salida exacto y comprobar su correlación y causación. La regresión reproduce una evaluación posterior ajena y pasó en Windows y Node 22 Linux. Este ajuste afecta al verificador, no cambia los contratos ni requiere volver a desplegar los servidores. No se publicaron entradas adicionales para corregir el informe.

El verificador también usa ahora una planta y un asset explícitamente QA e independientes por ejecución. Así una repetición el mismo día no queda bloqueada por la deduplicación correcta de un periodo QA anterior sin cambios. La regresión valida el payload y la clave de periodo de esa planta aislada; este ajuste se comprobó con fixtures, sin publicar más eventos.

`sin_meta` en compare es el comportamiento esperado sin una meta aprobada; no acredita una comparación empresarial terminada. El proyecto de track es explícitamente de prueba, no una aceptación con un proyecto real.

## Bloqueo concreto de Logto

En ambas navegaciones reales, y de nuevo mediante GET al proveedor, Logto respondió HTTP 400 con `oidc.invalid_redirect_uri`. El rechazo ocurre antes de pedir usuario y contraseña; no se introdujeron credenciales de la cuenta de prueba.

Datos para que plataforma corrija o confirme la aplicación:

| Campo | Valor observado |
| --- | --- |
| Proveedor | `https://pfwk8f.logto.app` |
| Client ID utilizado por ambas tools | `7ms3ixe2j7nb4d98s3w98` |
| Callback de compare que se debe registrar | `https://cpa.orcalabs.mx/auth/callback` |
| Callback de track que se debe registrar | `https://tpp.orcalabs.mx/auth/callback` |
| Scopes enviados con la configuración existente | `openid roles` |

El Client ID es un identificador público, no APP_SECRETS. Plataforma debe confirmar si ambas tools deben usar esa misma aplicación y registrar las dos URLs en su lista de Redirect URIs, o entregar las credenciales de la aplicación correcta para cada servicio. Crear OIDC_REDIRECT_URI en Railway no registra la callback en Logto.

Después de esa corrección: repetir login y retorno al deep link, verificar la cookie de sesión propia, roles efectivos, denegación con usuarios sin permisos y logout real. Confirmar también el alcance de claims y la URI de cierre de sesión; no se certificaron durante esta ejecución.

## Secretos y alcance

Los cuatro secretos nuevos se copiaron desde archivos locales ignorados a Actions y, durante la preparación autorizada, a Railway por stdin. No se imprimieron valores ni prefijos ni se incluyeron secretos en commits.

| Archivo local privado | Secreto de Actions | Variable Railway |
| --- | --- | --- |
| `.env.cpa.session.local` | COMPARE_SESSION_SECRET | SESSION_SECRET de compare |
| `.env.tpp.session.local` | TRACK_SESSION_SECRET | SESSION_SECRET de track |
| `.env.cpa.service.local` | COMPARE_TOOL_API_KEY | TOOL_API_KEY de compare |
| `.env.tpp.service.local` | TRACK_TOOL_API_KEY | TOOL_API_KEY de track |

La preparación rechaza claves de máquina existentes diferentes de la de CI y valida el plan SSO completo antes de escribir secretos. Conserva los secretos de sesión existentes. No se modificaron las credenciales Logto ni la política del core/dashboard. No se envió ningún secreto ni mensaje a otra persona.

La revisión de código, historial local y exclusiones, con sus límites, está en [REVISION_SECRETOS_2026-10-19.md](REVISION_SECRETOS_2026-10-19.md). La ausencia de coincidencias en assets no equivale a una certificación integral de seguridad.

## Pendientes compartidos y de plataforma

- Registrar o corregir las callbacks de Logto y confirmar aplicaciones, claims, roles y logout. Después nos corresponde repetir las pruebas humanas.
- Alinear owner y requiredRoles del catálogo central con la matriz definitiva.
- Proporcionar una meta aprobada, un cierre ERP real y contexto real de proyecto para la aceptación funcional.
- Coordinar una interrupción y recuperación real del core/ERP/túnel. El backoff y los reintentos ya pasaron en pruebas aisladas; no se interrumpieron servicios de plataforma.
- El estado privado Active del último deployment y los logs operativos del servicio no se inspeccionaron directamente. El enlace de deployment abierto en el navegador devolvió 404 con la sesión disponible. La ejecución de despliegue exitosa, health, readiness y SHA sí se verificaron.

No cambiaron contratos de eventos ni se agregaron tools o reglas de comunicación; no corresponde regenerar el cerebro ni modificar sus bitácoras por estos ajustes.

## Evidencia

- [Informes sanitizados de preparación y despliegue](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-application/deployment-39330751889.json>).
- [Comprobaciones HTTP reales con SSO](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-application/live-sso-verification.json>).
- [QA original del workflow](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-application/qa-39331063240.json>).
- [Persistencia y salidas exactas contrastadas después de QA](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-application/persistence-and-exact-outputs.json>).
- [Rechazo de callbacks por Logto](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-application/logto-callback-check.json>).
- [Pruebas locales iniciales](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/tests.json>) y [Node 22 Linux](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/node22-linux-tests.log>).
