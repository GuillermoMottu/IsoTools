# Ensayo de CPA y TPP con eventos guardados

Alcance: `compare_planned_vs_actual` y `track_project_progress`, para el escenario 7 de PR-ORCA-ENS-001 v1.3. Las otras tools conservan sus responsables.

## Estado del 29 de octubre de 2026

La [inspección 40831459970](https://github.com/GuillermoMottu/IsoTools/actions/runs/40831459970) confirmó que Railway conservaba key central válida, variables SSO completas, consumidores habilitados y volúmenes persistentes. La imagen servida no correspondía al servidor propio de las tools.

El [despliegue correctivo 40831691763](https://github.com/GuillermoMottu/IsoTools/actions/runs/40831691763), desde `5dd8fb199636c51053a10055da508b4a659cf400`, pasó para ambas tools. Las comprobaciones posteriores observaron:

| Comprobación | CPA | TPP |
| --- | --- | --- |
| Health con identidad, SSO y SHA esperado | 200 | 200 |
| Readiness JSON | 200 ready | 200 ready |
| Sesión anónima | 401, mode=sso | 401, mode=sso |
| Estado con key propia del servicio | 200 | 200 |
| Cursor conservado | 7679 | 7684 |
| Registros conservados | 2 | 3 |
| Publicación pendiente | No | No |
| Inicio de login y PKCE S256 | 302 hacia Logto | 302 hacia Logto |
| Respuesta inicial del proveedor | 303, sin invalid_redirect_uri | 303, sin invalid_redirect_uri |

La inspección inicial por HTTP no acreditaba la sesión humana. Las pruebas interactivas posteriores de login, retorno y logout se detallan en el cierre de SSO más abajo. Las credenciales fueron introducidas por el usuario; no se fabricaron cookies para probar producción. La key local rechazada anteriormente no se reemplazó ni se copió desde Railway: el replay usa la key ya guardada en Actions, sin imprimirla.

El identificador real de organización queda pendiente por indicación del usuario. No se utiliza `ORG-001` ni otra identidad de demostración para completar datos reales. No se configuraron metas en producción.

## Resultado del replay del 29 de octubre

El [replay definitivo 40833405930](https://github.com/GuillermoMottu/IsoTools/actions/runs/40833405930), desde `73a7018`, terminó correctamente. Solo se ejecutó el job de replay; los dos despliegues y la publicación QA quedaron skipped. Las pruebas de sus límites y su ejecución corrieron en Node 22 en Actions.

| Tool | Inventario leído | Resultado |
| --- | --- | --- |
| CPA | 4 ERP_SALES_PERIOD_CLOSED; los 4 identificados como prueba | No hay entrada real disponible para completar PV-7.1/7.2. No se fabricó otro cierre. |
| TPP | 15 KPI_REPORT_GENERATED; 11 identificados como prueba por marca o correlación | La última entrada restante seleccionada es seq=53, no tiene procedencia ERP comprobada en su cadena y devuelve not_calculable por ocho campos faltantes. No se convirtió en evidencia real. |

La entrada de TPP seleccionada tiene event_id `fe8eb46b-50c4-4877-b0ba-7db99503442b` y correlation_id `f140073c-d6a8-49cd-bc4c-5a89d37e0395`. No contiene organization_id, project_id, project_name, as_of_date, planned_start_date, planned_end_date, planned_progress_percent ni actual_progress_percent. No se encontró salida propia con causation_id igual a esa entrada. Estos resultados no acreditan un proyecto de negocio ni una cadena ERP completa.

La primera ejecución, 40832924093, detectó que algunos descendientes QA habían perdido metadata.test. Se corrigió la exclusión por correlación y por ancestros QA y se añadieron regresiones antes del replay definitivo. La primera selección queda sustituida por los resultados anteriores.

Después del replay se releyó el estado autenticado de ambos servicios: los cursores siguen en 7679 y 7684, los registros en 2 y 3, las últimas publicaciones son las mismas y no hay publicación pendiente. No se publicaron entradas QA durante esta restauración y replay.

Para impedir que una ejecución futura desde el main antiguo vuelva a reemplazar nuestros servicios por el core, se integró el [PR 2 del fork](https://github.com/GuillermoMottu/IsoTools/pull/2). Solo cambia el workflow de CPA/TPP. El main sin runtime aislado ahora se rechaza; para desplegar la implementación propia se debe seleccionar nuestra rama de trabajo en Run workflow.

## Continuación de los pendientes

La [reconsulta 40977402839](https://github.com/GuillermoMottu/IsoTools/actions/runs/40977402839) conserva el resultado anterior: cuatro cierres CPA, todos QA, y quince entradas KPI, once identificadas como prueba. La entrada TPP seleccionada continúa en seq=53 con los ocho campos obligatorios ausentes. No hay evidencia nueva para aprobar el escenario real.

La [inspección 40978055458](https://github.com/GuillermoMottu/IsoTools/actions/runs/40978055458) volvió a confirmar consumidores habilitados, key central válida, identidad correcta y SSO en ambos servicios. Además consultó la configuración de Railway sin descifrar variables: ninguno de nuestros dos servicios tiene fuente GitHub conectada. La consulta usa la API GraphQL oficial únicamente con una operación query; no cambia la configuración del proveedor.

El PR preventivo #2 quedó reducido a un diff de 16 adiciones, con checks aprobados sobre `55cf5c2f1c8143cd4c8f7fb288ec21f91676d892`. Después de recibir autorización explícita se integró con los workflows automáticos omitidos solo en ese commit de mantenimiento, para evitar el despliegue ajeno del core. No se deshabilitaron workflows permanentemente ni se modificó código del core.

El usuario completó el login y el consentimiento de Logto. Login, retorno al deep link, sesión en TPP y logout quedaron comprobados. La prueba positiva de permisos queda pendiente porque la cuenta de prueba no recibe roles reconocidos por las tools; no se fabricaron cookies ni se concedieron permisos por código.

## Cierre de integración y SSO humano

El usuario autorizó expresamente integrar el PR #2. Se fusionó en main del fork como `928e11d93cee68b14be05449202ee28658d97d35`, con un diff de 16 adiciones al workflow de nuestras dos tools. Sus checks estaban aprobados y el commit de mantenimiento omitió los workflows automáticos; la consulta de runs para ese SHA devolvió una lista vacía.

La protección se comprobó con los dos pasos shell exactos extraídos del workflow fusionado. Se ejecutaron en una imagen local Node 22.23.3, sin red, sin credenciales de despliegue, con raíz de solo lectura y fixtures públicos: el main sin runtime aislado fue rechazado para CPA y TPP; los archivos del runtime correcto fueron aceptados y seleccionaron el railway.toml de cada tool. No se ejecutó el workflow potencialmente productivo para esta prueba ni se desplegaron nuevas imágenes.

Con participación del usuario se completó una sesión real de Logto. El usuario introdujo sus credenciales y autorizó el consentimiento; no se guardaron credenciales, tokens, cookies ni datos identificativos de la cuenta en esta evidencia.

| Prueba humana | CPA | TPP |
| --- | --- | --- |
| Retorno del login a la tool | Comprobado | Comprobado reutilizando la sesión del IdP, sin otra contraseña |
| auth/me con sesión real | authenticated=true, mode=sso | authenticated=true, mode=sso |
| Roles reconocidos por la tool | roles=[], role=null | roles=[], role=null |
| Consulta de registros sin rol | insufficient_role; exige OperationsManager o Auditor | insufficient_role; exige OperationsManager o Auditor |
| Retorno real al enlace solicitado | /deep/check?qa=1 | /deep/check?qa=1 |
| Logout desde la interfaz | Retorna a https://api-events.orcalabs.mx/ | Retorna a https://api-events.orcalabs.mx/ |
| auth/me después de logout | authenticated=false, mode=sso | authenticated=false, mode=sso |

La prueba de lectura denegada sin roles está observada con usuario real. No se realizó una operación de negocio ni se declara cerrada la prueba positiva con un usuario autorizado. Tampoco se observaron los claims crudos del ID token: roles=[] es el resultado reconocido por nuestras tools y no distingue por sí solo entre rol no asignado, claim no emitido o vocabulario no mapeado.

Plataforma debe verificar la cuenta de prueba, asignar el rol que corresponda y asegurar su entrega en el ID token solicitado por nuestras tools. El mapeo implementado reconoce `operations.manager` como `OperationsManager` y `platform.auditor` como `Auditor`; el acceso de operación requiere OperationsManager y el auditor tiene lectura. Las tools ya solicitan el scope roles. La documentación oficial de Logto describe la combinación entre scope y configuración del claim en [Custom ID token](https://docs.logto.io/developers/custom-id-token). Después de ajustar la autorización hay que iniciar una sesión nueva y repetir el caso positivo. No se concedieron roles desde el código ni se cambió la política para eludir la denegación.

## Cómo ejecutar el replay

En el workflow **Deploy ORCA tools to Railway**, seleccionar la rama que contiene esta implementación y `mode=replay`, con `tool=all` o la tool concreta. Este modo no ejecuta los jobs de despliegue ni el job `validate` que publica entradas QA.

El script `scripts/replay_tools_readonly.js` solo hace GET de suscripciones y cadenas. Lee desde `since_seq=0` con paginación, usando variables en memoria; no importa `createToolConsumer`, no abre archivos de estado ni llama a su tick. Selecciona la última entrada sin marcas de prueba de cada tool e identifica su procedencia ERP cuando está presente en la cadena. También excluye correlaciones conocidas de QA y descendientes cuya cadena contiene un origen QA, aunque hayan perdido metadata.test. Una entrada sin marca no se declara automáticamente de negocio real.

El informe registra cantidades, IDs, hash de entrada, versiones de cálculo/regla, campos faltantes y comparación de status. No imprime eventos crudos, importes de negocio, configuración o credenciales. Cuenta únicamente las salidas de la tool cuyo causation_id coincide con la entrada seleccionada; otra salida de la misma cadena no sustituye esa evidencia.

Para ejecución local con una key de lectura ya configurada:

```powershell
node scripts/replay_tools_readonly.js
```

Variables opcionales: `TOOL_SELECTED` (all o una de nuestras dos tools), `REPLAY_ORGANIZATION_ID` (solo cuando esté acordado), y `TOOL_REPLAY_CONFIG_FILE` (JSON privado con organization_id y sales_plans reales). En Actions, la organización opcional se toma de `ISOTOOLS_ORGANIZATION_ID`, variable del repositorio. No se crea ni rellena automáticamente.

Actions ahora prefiere el secreto `ISOTOOLS_READONLY_API_KEY` para este job, y conserva `ISOTOOLS_API_KEY` como alternativa para las consultas GET existentes. El secreto dedicado todavía no existe en el fork. Plataforma debe emitir una key cuyo único scope sea `events:read`, y guardarla en ese secreto sin sustituir la key del consumidor productivo. El nombre del secreto por sí solo no certifica sus scopes: deben confirmarse en el registro de la key. No se creó una credencial en el core ni se rotaron secretos de nuestras tools.

El evaluador y el consumidor comparten las mismas funciones puras de adaptación y cálculo. No se alteraron contratos ni reglas de negocio para habilitar el replay.

## Qué significan los resultados

- **Baseline:** evaluación con el contexto suministrado. Un cierre válido sin meta conserva actual y devuelve sin_meta, igual que el consumidor.
- **Ensayo de meta 150 %:** para un cierre ERP se crea una meta exclusivamente en memoria. Falta de organización u otro contexto queda visible como not_calculable. Nunca se publica esa meta ni el resultado del ensayo.
- **TPP:** exige organization_id, project_id, project_name, as_of_date, planned_start_date, planned_end_date, planned_progress_percent y actual_progress_percent; acepta los alias camelCase que ya contempla el evaluador. Los hitos, presupuesto y destinos de seguimiento se validan cuando se suministran. No se reconstruye un proyecto con KPIs agregados ni valores fijos.
- **no_non_test_input:** la suscripción se leyó por completo, pero no contiene una entrada sin marcas de prueba que se pueda seleccionar. Debe documentarse el escenario como no ejecutable con entradas reales disponibles. No se convierte una QA en evidencia real.
- **requires_review:** faltan datos, no hay procedencia ERP comprobada, falta salida propia o hay duplicados/diferencia de status.
- **status_matches_requires_configuration_review:** coincidencia de status de una salida propia y procedencia ERP visible. No significa equivalencia completa: la versión, meta y configuración histórica siguen requiriendo revisión.
- Un error de autorización o paginación falla el job; no se interpreta como ausencia de entradas.

Un job exitoso acredita que la consulta terminó. No significa que CPA o TPP hayan aprobado el ensayo. El replay no certifica que la key de Actions tenga exclusivamente events:read; el propio programa limita sus operaciones a GET. La key limitada a lectura sigue siendo un requisito separado de la jornada de ensayo.

## Pendientes propios

1. Proporcionar la organización real y acordar la meta y contexto del ensayo cuando corresponda.
2. Disponer de entradas guardadas con la procedencia y el contexto requeridos; si faltan, registrar esa dependencia en el contrato sin implementar otra tool.
3. Completar las pruebas de permisos con cuentas reales autorizadas. Login humano, deep link y logout ya están comprobados; la lectura sin rol fue rechazada. No se probó una operación de negocio con esa cuenta.
4. Revisar los resultados del replay y la configuración histórica antes de aprobar los PV de nuestras tools.

## Validación

`node scripts/test_readonly_replay.js` cubre GET exclusivamente, rechazo de redirects, paginación, exclusión de QA, causación exacta, salidas duplicadas, contexto faltante, ausencia de datos y errores 401. Las regresiones existentes del consumidor y de los contratos cubren que extraer los evaluadores compartidos conserva publicación, deduplicación y persistencia. Los datos de esos tests son fixtures y no evidencia de negocio.
