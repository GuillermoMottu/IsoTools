# Verificación del runbook de pruebas de IsoTools

Fecha de revisión: 19 de octubre de 2026. Consulta remota principal: 10:31, America/Mexico_City.

Actualización posterior del mismo día: se resolvieron la compatibilidad Logto, el requisito SSO en producción, las comprobaciones de despliegue y la validación QA autenticada. Las correcciones se publicaron en nuestro fork en el commit `3285195`. Las tablas siguientes conservan la evidencia de la auditoría original; producción no se modificó y la inspección privada sigue pendiente de autorización explícita. Cambios, secretos locales preparados, pruebas y pendientes en [CIERRE_LOCAL_SSO_COMPARE_TRACK.md](CIERRE_LOCAL_SSO_COMPARE_TRACK.md).

El proyecto todavía no cumple todos los requisitos del runbook actualizado. Las dos tools responden, sus contratos públicos coinciden y las pruebas locales pasan, pero ambas están abiertas sin autenticación en producción. También faltan aceptación con datos empresariales reales, pruebas operativas y alineación del registro central.

## Alcance y fuentes

- Documento de referencia: `D:/Descargas/Runbook_Pruebas_Tools_IsoTools (1).docx`, edición de octubre de 2026, incluyendo el bloque B.0 de Logto.
- Tools verificadas: `compare_planned_vs_actual` y `track_project_progress`. No se certifican las otras tools del catálogo.
- Rama local: `comm/sync_erp_data_local__compare_planned_vs_actual`.
- Commit local y de esa rama remota: `abc543d3b8b7f2dded8deba7579481e3bb42d3d1`.
- Commit informado por ambas tools desplegadas: `1e071b02d1c21fa4bef5ea41ad7a2389d1f1e1fb`.
- Se revisaron código, configuración versionada, pruebas existentes, respuestas HTTP actuales, bundles y pantallas publicadas. La versión local y la desplegada se evalúan por separado.
- Las peticiones remotas de la auditoría fueron GET sin credenciales. Abrir las interfaces también ejecutó su evaluación habitual mediante su backend; esa ruta no publica ni modifica la fuente.
- No se publicaron entradas QA nuevas, no se cambiaron variables, no se reiniciaron servicios, no se provocaron fallos en producción y no se hizo commit ni push. El único archivo añadido al repositorio por esta revisión es este informe; se conservaron los archivos no versionados que ya existían.

## Evidencia disponible

- [Resultados finales de las pruebas locales](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-audit/final-tests.json>).
- [Consultas remotas y revisión de bundles](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-audit/remote-and-bundles.json>).
- [Antecedentes del runbook anterior](RESULTADOS_RUNBOOK_COMPARE_TRACK.md), usados como referencia histórica, no como sustituto de las comprobaciones actuales.

Estados: **Cumple** significa que hay evidencia actual para el alcance indicado; **Local** acredita pruebas aisladas, sin aceptación productiva; **Parcial** conserva requisitos sin comprobar; **No cumple** indica una contradicción observada; **Pendiente** indica una comprobación no realizada.

## Checklist aplicado

| Punto del runbook | Estado | Evidencia y trabajo restante |
| --- | --- | --- |
| 1.1 Último despliegue Active en Railway | Pendiente | Las URLs responden, pero no se accedió al estado privado del último deploy. HTTP 200 no demuestra el estado del panel. |
| 1.2 Health público, HTTP 200 y JSON | Cumple | Core, cpa y tpp responden 200 JSON sin credenciales. Las tools informan su identidad y build. |
| 1.3 Readiness HTTP 200 | Cumple | Core y ambas tools responden 200; los consumidores informan `ready`. |
| A ERP Readiness independiente de que lleguen datos | Local | `test_runbook_consumer.js` comprueba suscripción vacía sin fallo de disponibilidad. No se interrumpió el ERP real. |
| 2.1 Variables ISOTOOLS_API_URL e ISOTOOLS_API_KEY | Parcial | El código usa los nombres requeridos y el consumidor está listo. Falta inspeccionar los valores/configuración privados de Railway. |
| 2.2 URL del core devuelve API y no HTML | Cumple | `https://api-events.orcalabs.mx/api/v1/health` devuelve JSON con `service=isotools`. |
| 2.3 Suscripción con key y scopes correctos | Parcial | `ready` es evidencia de polling satisfactorio según el código. Las suscripciones anónimas rechazan con 401. No se ejecutó una consulta directa actual con la key desplegada. |
| A ERP Evento ERP declarado en consumes | Cumple | El catálogo central de compare declara `ERP_SALES_PERIOD_CLOSED`; coincide con consumidor y catálogo locales. Track consume `KPI_REPORT_GENERATED`. |
| A ERP Sin credenciales de ERP o Cloudflare en la tool | Parcial | El flujo implementado usa el core. Sin inspección privada no se confirma ausencia de variables sobrantes en Railway. |
| 3.1 Registro federado completo y alineado | No cumple | URLs, salud y tipo federado correctos. En producción el owner de ambas sigue siendo `pendiente de asignar` y requiredRoles contiene solo `operations.manager`; localmente hay owner y también `platform.auditor`. |
| 3.2 Aparición en dashboard y salud verde | Cumple | Ambas aparecen `en linea` en la barra lateral y en el resumen del dashboard publicado. |
| B.0 Credenciales de Logto entregadas en Railway | Pendiente | La afirmación del documento no se tomó como prueba de su presencia actual. Falta inspección privada. |
| B.0.1 Callback, logout, secreto y cookie propios | Parcial | Docker define `cpa_session` y `tpp_session`; las pruebas verifican cookies seguras. Faltan configuración y registro de URIs reales en Logto. |
| B.0.2 Conectar nombres Logto con configuración OIDC | No cumple | `src/tool-auth/oidc-config.js` solo lee OIDC_ISSUER, OIDC_CLIENT_ID y OIDC_CLIENT_SECRET. Un ensayo con únicamente ISSUER_ENDPOINT, APP_ID y APP_SECRETS devuelve configuración desactivada. |
| B.0.3 Solicitar roles y traducirlos | Local | Scope predeterminado `openid profile email roles`; los tests de ambas tools comprueban roles y denegación por rol insuficiente con IdP simulado. Falta Logto real. |
| B.0.4 Secretos exclusivamente en backend | Parcial | No aparecen los marcadores buscados en los dos builds ni en los bundles desplegados. Falta contrastar los prefijos reales de APP_SECRETS y de la API key, y revisar las variables privadas. |
| B.0.5 Login real, retorno y auth/me con roles | No cumple | Ambas `/auth/me` responden 200 con `mode=open`, `authenticated=false`; no hay login obligatorio. Las pantallas muestran el aviso de modo abierto. |
| B ERP Polling independiente de sesión humana | Local | Consumidor usa `x-api-key`, separado del middleware humano; los tests no dependen de una sesión de navegador. |
| 4.1 y 4.2 Interfaz y API por mismo origen | Cumple | Las interfaces publicadas cargan y muestran registros. El cliente usa rutas relativas `/api/...` y `/auth/me`; las respuestas muestreadas no incluyen Access-Control-Allow-Origin. No se generó una captura HAR completa. |
| B ERP Interfaz sin llamadas directas a ERP o core | Cumple | El cliente de datos usa el backend propio; el acceso del consumidor al core está en backend. El enlace de navegación al dashboard no es una llamada de datos al ERP. |
| 5.1 Compilar interfaz | Cumple | Dos builds Vite exitosos, uno por tool, en directorios de evidencia separados. No se sobrescribió el dist del proyecto. |
| 5.2 Buscar nombres de secretos y prefijos reales | Parcial | Sin coincidencias de ISOTOOLS_API_KEY, TOOL_API_KEY, APP_SECRETS, SESSION_SECRET, CF_ACCESS, erp-planta1 y MICROSIP en los bundles JS examinados. No se dispuso de los valores privados para comparar prefijos reales. |
| 6.1 API sin cookie responde 401 JSON | No cumple | `/api/analyses`, `/api/records` y `/api/tool/status` responden 200 sin cookie ni key. En local sí se demuestra el 401 cuando SSO está configurado. |
| 6.2 Deep link sin sesión redirige y conserva destino | No cumple | `/deep/check` devuelve HTML 200 en ambas tools sin redirección. El comportamiento protegido pasa en pruebas locales con SSO. |
| 6.3 Usuario sin roles no puede modificar o aprobar | Local | Pruebas de roles vacíos, desconocidos y auditor sin permiso de operación pasan. Falta prueba con usuarios reales de Logto. |
| 7.1 Consultar catálogo central | Cumple | Ambos endpoints públicos de catálogo devuelven 200 y la identidad correcta. |
| 7.2 Consumes y produces coinciden con código | Cumple | Compare: ERP_SALES_PERIOD_CLOSED → PRODUCTION_VARIANCE_DETECTED. Track: KPI_REPORT_GENERATED → PROJECT_AT_RISK. Coinciden catálogo remoto, contratos locales y pruebas. |
| C ERP Campos del conector y conversión numérica | Local | Tests pasan con importes como texto, fechas, periodo, planta y valores inválidos. La ruta `src/data/connectors/*.json` citada por el documento no existe en este checkout; falta validar el contrato del conector desplegado y una muestra real. |
| 8.1 Entrada recibida y procesada por servicio desplegado | Parcial | Cada servicio conserva un registro QA y su salida exacta existe en el core. Esta auditoría releyó esa evidencia; no publicó una entrada nueva. |
| 8.2 Logs poll → procesamiento | Parcial | La secuencia está cubierta localmente y los estados remotos muestran cursores y publicaciones. No se revisaron logs operativos actuales de Railway. |
| 8.3 Otro ciclo sin duplicar efectos | Local | Pasan deduplicación por event_id, repetición de periodo y retención de UUID durante reintentos. La lectura remota de registros es una instantánea, no una nueva prueba de estímulo. |
| 8 Cursor next_seq y persistencia | Local | Pruebas pasan con persistencia y recreación del consumidor; cursores remotos compare=7440 y track=7445. Falta verificar montaje y reinicio del volumen Railway. |
| C ERP Mismo periodo actualiza sin duplicar | Local | El test cubre repetición sin cambios, corrección del importe y event_id repetido. La clave implementada incluye planta, periodo y separación QA. |
| 9.1 Publicación con 201 y reintento duplicate | Parcial | Los últimos acuses remotos conservados indican HTTP 201 accepted. Las pruebas locales cubren reintentos y UUID estable. No hubo nueva publicación al core durante esta revisión. |
| 9.2 Salida visible con module_id propio | Cumple en QA | Las dos salidas exactas se recuperaron del core dentro de sus cadenas QA. No se usó la mera presencia de cualquier evento de la cadena como prueba. |
| 9 Identidad, correlación y causación correctas | Cumple en QA | Se verificaron event_id propio, module_id de cada tool, correlation_id de entrada y causation_id correcto de ambas salidas almacenadas. |
| 10.1 y 10.2 Cadena completa consultable | Cumple en QA | Compare tiene cadena QA de 5 eventos; track, de 3. Entrada y salida propias enlazadas y sucesores presentes. Se consultó la API de consola; el endpoint máquina con API key queda sin prueba directa actual. |
| C ERP Cadena productiva desde erp_connector | Pendiente | Las entradas verificadas tienen origen qa_runbook. No acreditan lectura empresarial del ERP ni contexto real de proyectos. |
| 11.1 Evento malformado no cae ni bloquea cursor | Local | Pasan cuarentena, rechazo, avance de cursor y ausencia de publicación para entrada no calculable. API local inválida devuelve 400. No se inyectó basura en producción. |
| 11.2 Core no disponible, backoff y recuperación | Local | Se prueban fallos simulados y esperas 10, 20, 40, 80, 160 y 300 segundos; persistencia del envío pendiente. Falta prueba operativa controlada de interrupción y recuperación. |
| C ERP Sin NaN y último dato con fecha | Parcial | Conversión y rechazo de valores inválidos pasan; la UI publicada muestra fuente y fecha. No se apagó planta ni túnel para ensayar el comportamiento operacional. |
| 12.1 Consistencia visual | Cumple en revisión básica | Se observaron compare, track y dashboard publicados: tema oscuro, tipografía y cabecera consistentes. No constituye auditoría visual exhaustiva de todos los tamaños. |
| 12.2 Aviso de modo abierto | No válido para aceptar producción | El aviso existe y describe correctamente la situación actual. El propio B.0 exige login obligatorio; mostrar el aviso no resuelve ese incumplimiento. |
| C ERP Fuente, frescura y marca QA visibles | Cumple | Ambas pantallas muestran `Datos de prueba`, fuente y fecha. Compare muestra `Sin meta`; track identifica explícitamente un proyecto QA sin proyecto real. |
| Aceptación funcional con datos empresariales reales | Pendiente | Cada tool tiene 1 registro QA y 0 registros no QA almacenados. Esto no prueba ausencia de eventos en todo el core; acredita ausencia de registros empresariales en el estado observado de estas tools. |

## Hallazgos que impiden cerrar el checklist

### 1 Autenticación desactivada en producción

**Problema observado:** las dos tools informan `auth=open`; datos y estado del consumidor se leen sin sesión. Los deep links tampoco solicitan login. El dashboard central también muestra `SSO desactivado · modo desarrollo`.

**Acción mínima:** conectar la configuración real de Logto, comprobar callbacks, cookies y roles, y repetir los puntos B.0 y 6 en los servicios desplegados. Las credenciales de Logto no deben reemplazar la API key del consumidor.

**Código relacionado:** `src/tool-auth/oidc-config.js:25`, `src/tool-auth/index.js:28` y `src/tool-server.js:28`.

### 2 Configuración y comprobaciones de despliegue todavía exigen modo abierto

**Problema observado:** `runtimePlan` rechaza autenticación configurada; `deploymentConfigurationReady`, la comprobación posterior y `deploymentIsCurrent` requieren modo abierto. Un ensayo directo con un health válido pero `auth=sso` fue rechazado por `deploymentIsCurrent`.

**Acción mínima:** adaptar esos criterios al requisito de autenticación del nuevo runbook y actualizar sus pruebas. No basta con configurar Logto si el proceso de despliegue sigue aceptando únicamente open.

**Código relacionado:** `scripts/prepare_railway_tool.js:28`, `scripts/inspect_railway_tool.js:102`, `scripts/inspect_railway_tool.js:133` y `scripts/wait_tool_deployment.js:5`.

### 3 Registro local y central no coinciden

**Problema observado:** el archivo local tiene owner `Guillermo Mottu` y requiredRoles `operations.manager, platform.auditor`. El registro servido tiene owner `pendiente de asignar` y solo `operations.manager` para las dos tools.

**Acción mínima:** confirmar con plataforma la matriz definitiva y alinear el registro desplegado. Ver la tool en verde no prueba que owner y permisos estén terminados.

**Código relacionado:** `src/data/platform/deployments.json:84` y `src/data/platform/deployments.json:86`.

### 4 Falta aceptación operacional y empresarial

**Problema observado:** solo hay registros QA; compare no tiene meta aprobada en el registro observado y track muestra un proyecto de prueba. El reinicio de un consumidor local no prueba recuperación del volumen desplegado.

**Acción mínima:** verificar volumen, realizar reinicio controlado, repetir idempotencia con estímulo nuevo, comprobar recuperación ante fallo y completar el flujo con un cierre ERP real y contexto de proyecto suficiente. No inventar metas ni proyectos para hacer pasar la prueba.

## Pruebas ejecutadas

**17 de 17 comprobaciones locales terminaron con exit code 0**, además de dos compilaciones de interfaz exitosas:

- `test_compare_planned_vs_actual.js`
- `test_track_project_progress.js`
- `test_frontend_evaluation.js`
- `test_frontend_values.js`
- `test_frontend_explanations.js`
- `test_frontend_erp.js`
- `test_frontend_history.js`
- `test_project_milestones.js`
- `test_project_switch.js`
- `test_kpi_project_contract.js`
- `test_runbook_consumer.js`
- `test_tool_service.js`
- `test_sso_handshake.js`
- `test_sso_handshake.js --track`
- `test_railway_inspection.js`
- `test_railway_preparation.js`
- `validate-platform-data.js`

El validador informó 125 tools, 16 registradas y 10 roles. Conserva un aviso local sobre falta de subdominio de `detect_out_of_control_signals`; está fuera de las dos tools revisadas y el registro remoto ya muestra esa otra tool desplegada.

Las pruebas se ejecutaron con Node v25.9.0 en Windows. Los Dockerfiles usan Node 22 Linux; no se ejecutaron esos contenedores. Las pruebas SSO usan la librería OIDC real con IdP simulado y no acreditan una sesión real de Logto.

Los primeros intentos tuvieron restricciones del entorno: EPERM en temporales y EACCES al conectar a localhost. El consumidor pasó al usar temporales dentro del espacio autorizado; las pruebas HTTP locales pasaron al ejecutarse fuera de la restricción de red. Se conservaron logs de intentos iniciales y resultados finales.

## Límites y bloqueo de inspección privada

Se confirmó acceso de lectura a GitHub fuera de la restricción de red. La primera consulta dentro del sandbox había indicado un token inválido; la consulta autorizada posterior confirmó que la sesión era válida, por lo que no se cambió ninguna credencial.

La rama `main` remota apunta a `f9fd7a01b6940db0257862a4e1ff0e0aa69133ee` y su workflow únicamente despliega: no tiene modo inspect. No se ejecutó. La rama remota de trabajo coincide con el commit local; se verificó que el workflow y el script inspector fueran idénticos a los revisados localmente.

Después se solicitó ejecutar únicamente el workflow de esa rama con `tool=all`, `mode=inspect`, `activate_consumer=false`. La revisión automática de permisos rechazó la ejecución porque usaría secretos del repositorio y acceso a Railway sin autorización explícita del usuario para ese workflow. No se lanzó ningún workflow ni se intentó un mecanismo alternativo para eludir el rechazo.

Quedan pendientes por ese bloqueo la lectura privada de variables, la verificación directa de credencial, la comparación de prefijos reales de secretos y la inspección de volúmenes. Su autorización no resolvería por sí sola las pruebas de login real, reinicio ni fallos operativos.

## Checklist de cierre restante

- [x] Resolver los nombres de variables Logto en el código de las tools, validado localmente; falta aplicar la versión en Railway.
- [x] Adaptar las comprobaciones de despliegue para exigir SSO en producción, validado localmente y publicado en nuestro fork; falta aplicar el workflow actualizado.
- [x] Preparar secretos independientes de sesión y credenciales de máquina en archivos locales ignorados, sin reemplazar ni enviar secretos existentes.
- [ ] Inspeccionar la configuración privada y el volumen de ambas tools con autorización para el workflow de lectura.
- [ ] Confirmar callback, logout, roles y cuentas de prueba con plataforma.
- [ ] Validar login real, 401 JSON sin sesión, deep links y denegación por rol insuficiente en producción.
- [ ] Alinear owner y requiredRoles del registro central con la decisión de plataforma.
- [ ] Completar el escaneo de bundles con prefijos reales de API key y secreto Logto sin imprimirlos.
- [ ] Confirmar el volumen persistente y probar reinicio real sin duplicar datos ni publicaciones.
- [ ] Probar una entrada nueva marcada QA con el consumidor desplegado y verificar su salida exacta.
- [ ] Probar una interrupción controlada y la recuperación sin pérdidas.
- [ ] Validar un cierre ERP real, meta aprobada cuando corresponda y contexto real de proyecto.
- [ ] Actualizar la evidencia y declarar aceptación únicamente cuando estén resueltos incumplimientos y pendientes.

**Veredicto:** no cerrar el runbook todavía. Hay cobertura local amplia y evidencia QA desplegada, pero la autenticación productiva no cumple y la aceptación operacional y empresarial sigue pendiente.
