# Verificación del runbook de pruebas de IsoTools

Fecha de revisión: 19 de octubre de 2026. Auditoría inicial: 10:31; última verificación tras despliegue y QA: 15:57, America/Mexico_City.

Se aplicaron los secretos faltantes y se [desplegaron ambas tools](https://github.com/GuillermoMottu/IsoTools/actions/runs/39330751889), con autorización explícita, sobre `0f7af25780308e516ebe7a55a65ddcb2b1a07e16`. Ambas sirven ese SHA con SSO y rechazan el acceso anónimo. La [QA marcada nueva](https://github.com/GuillermoMottu/IsoTools/actions/runs/39331063240) pasó. Se conservaron volúmenes, cursores, registros anteriores y key central. Resultado y evidencia en [CIERRE_LOCAL_SSO_COMPARE_TRACK.md](CIERRE_LOCAL_SSO_COMPARE_TRACK.md).

La tabla incorpora las comprobaciones posteriores. **Sigue pendiente el login humano:** Logto rechaza las callbacks de ambas tools con `oidc.invalid_redirect_uri`. También siguen pendientes los roles/logout reales, la aceptación empresarial, la alineación del catálogo y las pruebas coordinadas de interrupción de plataforma.

El proyecto todavía no cumple todos los requisitos del runbook actualizado. La seguridad de acceso y la cadena QA de nuestras dos tools están verificadas en producción; el rechazo del proveedor de identidad impide completar una sesión humana y sus pruebas de permisos.

## Alcance y fuentes

- Documento de referencia: `D:/Descargas/Runbook_Pruebas_Tools_IsoTools (1).docx`, edición de octubre de 2026, incluyendo el bloque B.0 de Logto.
- Tools verificadas: `compare_planned_vs_actual` y `track_project_progress`. No se certifican las otras tools del catálogo.
- Rama local: `comm/sync_erp_data_local__compare_planned_vs_actual`.
- Commit de la auditoría inicial: `abc543d3b8b7f2dded8deba7579481e3bb42d3d1`.
- Commit servido por ambas tools después del despliegue: `0f7af25780308e516ebe7a55a65ddcb2b1a07e16`.
- Se revisaron código, configuración versionada, pruebas existentes, respuestas HTTP actuales, bundles y pantallas publicadas. La versión local y la desplegada se evalúan por separado.
- Las peticiones remotas de la auditoría fueron GET sin credenciales. Abrir las interfaces también ejecutó su evaluación habitual mediante su backend; esa ruta no publica ni modifica la fuente.
- Después de la auditoría inicial, el usuario autorizó aplicar secretos, desplegar y publicar dos entradas QA marcadas. Se realizó ese trabajo en nuestro fork y en los dos servicios propios, sin modificar el core ni upstream. Los archivos privados siguen ignorados y se conservaron los archivos no versionados preexistentes.

## Evidencia disponible

- [Resultados finales de las pruebas locales](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-audit/final-tests.json>).
- [Consultas remotas y revisión de bundles](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-audit/remote-and-bundles.json>).
- [Antecedentes del runbook anterior](RESULTADOS_RUNBOOK_COMPARE_TRACK.md), usados como referencia histórica, no como sustituto de las comprobaciones actuales.

Estados: **Cumple** significa que hay evidencia para el alcance indicado; **Local** acredita pruebas aisladas, sin aceptación productiva; **Parcial** conserva requisitos sin comprobar; **No cumple** indica una contradicción observada; **Bloqueado por plataforma** identifica una dependencia externa comprobada; **Pendiente** indica una comprobación no realizada.

## Checklist aplicado

| Punto del runbook | Estado | Evidencia y trabajo restante |
| --- | --- | --- |
| 1.1 Último despliegue Active en Railway | Parcial | El workflow de despliegue terminó correctamente y ambos servicios sirven el SHA nuevo con health y readiness 200. No se consultó directamente el estado privado Active del panel. |
| 1.2 Health público, HTTP 200 y JSON | Cumple | Core, cpa y tpp responden 200 JSON sin credenciales. Las tools informan su identidad y build. |
| 1.3 Readiness HTTP 200 | Cumple | Core y ambas tools responden 200; los consumidores informan `ready`. |
| A ERP Readiness independiente de que lleguen datos | Local | `test_runbook_consumer.js` comprueba suscripción vacía sin fallo de disponibilidad. No se interrumpió el ERP real. |
| 2.1 Variables ISOTOOLS_API_URL e ISOTOOLS_API_KEY | Cumple | Inspección privada confirma URL canónica y key configurada y válida en ambas tools. Se conservaron durante el despliegue. |
| 2.2 URL del core devuelve API y no HTML | Cumple | `https://api-events.orcalabs.mx/api/v1/health` devuelve JSON con `service=isotools`. |
| 2.3 Suscripción con key y scopes correctos | Cumple | GET autenticado con la key desplegada devolvió 200 y el contrato de suscripción esperado para ambas tools. |
| A ERP Evento ERP declarado en consumes | Cumple | El catálogo central de compare declara `ERP_SALES_PERIOD_CLOSED`; coincide con consumidor y catálogo locales. Track consume `KPI_REPORT_GENERATED`. |
| A ERP Sin credenciales de ERP o Cloudflare en la tool | Parcial | El flujo implementado usa el core. Sin inspección privada no se confirma ausencia de variables sobrantes en Railway. |
| 3.1 Registro federado completo y alineado | No cumple | URLs, salud y tipo federado correctos. En producción el owner de ambas sigue siendo `pendiente de asignar` y requiredRoles contiene solo `operations.manager`; localmente hay owner y también `platform.auditor`. |
| 3.2 Aparición en dashboard y salud verde | Cumple | Ambas aparecen `en linea` en la barra lateral y en el resumen del dashboard publicado. |
| B.0 Credenciales de Logto entregadas en Railway | Cumple en configuración | Issuer, client ID y secreto de aplicación presentes. SESSION_SECRET independiente aplicado en cada tool. El proveedor todavía rechaza las callbacks. |
| B.0.1 Callback, logout, secreto y cookie propios | Parcial | Callbacks exactas en Railway y secretos propios configurados. Handshake Secure/HttpOnly observado. Logto devuelve HTTP 400 invalid_redirect_uri; faltan registro de URIs, sesión humana y logout real. |
| B.0.2 Conectar nombres Logto con configuración OIDC | Cumple | Alias Logto implementados y probados con la librería real. Ambas tools desplegadas informan auth=sso; producción rechaza configuración incompleta. |
| B.0.3 Solicitar roles y traducirlos | Local | Scope predeterminado `openid profile email roles`; los tests de ambas tools comprueban roles y denegación por rol insuficiente con IdP simulado. Falta Logto real. |
| B.0.4 Secretos exclusivamente en backend | Cumple en revisión dirigida | Revisión privada y assets de ambas versiones nuevas sin marcadores ni prefijos reales de key central, secreto de aplicación y secreto de sesión. Ver alcance y límites de la revisión de secretos. |
| B.0.5 Login real, retorno y auth/me con roles | Bloqueado por plataforma | auth/me anónimo devuelve 401 mode=sso. Logto rechaza ambas callbacks con oidc.invalid_redirect_uri antes de pedir credenciales. |
| B ERP Polling independiente de sesión humana | Local | Consumidor usa `x-api-key`, separado del middleware humano; los tests no dependen de una sesión de navegador. |
| 4.1 y 4.2 Interfaz y API por mismo origen | Cumple | Las interfaces publicadas cargan y muestran registros. El cliente usa rutas relativas `/api/...` y `/auth/me`; las respuestas muestreadas no incluyen Access-Control-Allow-Origin. No se generó una captura HAR completa. |
| B ERP Interfaz sin llamadas directas a ERP o core | Cumple | El cliente de datos usa el backend propio; el acceso del consumidor al core está en backend. El enlace de navegación al dashboard no es una llamada de datos al ERP. |
| 5.1 Compilar interfaz | Cumple | Dos builds Vite exitosos, uno por tool, en directorios de evidencia separados. No se sobrescribió el dist del proyecto. |
| 5.2 Buscar nombres de secretos y prefijos reales | Cumple en assets revisados | Inspector de cada despliegue contrastó los marcadores y prefijos reales disponibles; sin coincidencias. La revisión de key, client secret y session secret figura como ejecutada. |
| 6.1 API sin cookie responde 401 JSON | Cumple | Estado, analyses/records y auth/me rechazan acceso anónimo con 401. Una key incorrecta también devuelve 401; la key propia válida permite acceso de servicio. |
| 6.2 Deep link sin sesión redirige y conserva destino | Parcial | Ambas responden 302 hacia auth/login conservando /deep/check?qa=1. Inicio OIDC con PKCE S256, state y nonce. El retorno completo depende de corregir Logto. |
| 6.3 Usuario sin roles no puede modificar o aprobar | Local | Pruebas de roles vacíos, desconocidos y auditor sin permiso de operación pasan. Falta prueba con usuarios reales de Logto. |
| 7.1 Consultar catálogo central | Cumple | Ambos endpoints públicos de catálogo devuelven 200 y la identidad correcta. |
| 7.2 Consumes y produces coinciden con código | Cumple | Compare: ERP_SALES_PERIOD_CLOSED → PRODUCTION_VARIANCE_DETECTED. Track: KPI_REPORT_GENERATED → PROJECT_AT_RISK. Coinciden catálogo remoto, contratos locales y pruebas. |
| C ERP Campos del conector y conversión numérica | Local | Tests pasan con importes como texto, fechas, periodo, planta y valores inválidos. La ruta `src/data/connectors/*.json` citada por el documento no existe en este checkout; falta validar el contrato del conector desplegado y una muestra real. |
| 8.1 Entrada recibida y procesada por servicio desplegado | Cumple en QA | Nueva entrada marcada por tool, registro autenticado y salida exacta comprobados por workflow. Compare sin_meta; track at_risk. |
| 8.2 Logs poll → procesamiento | Parcial | La secuencia está cubierta localmente y los estados remotos muestran cursores y publicaciones. No se revisaron logs operativos actuales de Railway. |
| 8.3 Otro ciclo sin duplicar efectos | Cumple en muestra QA | Tras nuevos ciclos, las entradas antiguas y nuevas de cada tool conservan una sola salida propia y no hay publicación pendiente. No se inyectó un duplicado deliberado en producción. |
| 8 Cursor next_seq y persistencia | Cumple en despliegue real | Volúmenes conservados; registros anteriores y cursores 7440/7445 sobrevivieron al reemplazo real de contenedores. Tras QA y nuevos ciclos: 7679/7684. No acredita pérdida abrupta de disco. |
| C ERP Mismo periodo actualiza sin duplicar | Local | El test cubre repetición sin cambios, corrección del importe y event_id repetido. La clave implementada incluye planta, periodo y separación QA. |
| 9.1 Publicación con 201 y reintento duplicate | Parcial | Las dos entradas nuevas produjeron salidas propias con HTTP 201. El caso duplicate y UUID estable pasan localmente; no se forzó ese acuse en el core real. |
| 9.2 Salida visible con module_id propio | Cumple en QA | Las dos salidas exactas se recuperaron del core dentro de sus cadenas QA. No se usó la mera presencia de cualquier evento de la cadena como prueba. |
| 9 Identidad, correlación y causación correctas | Cumple en QA | Se verificaron event_id propio, module_id de cada tool, correlation_id de entrada y causation_id correcto de ambas salidas almacenadas. |
| 10.1 y 10.2 Cadena completa consultable | Cumple en QA | Cadena nueva de compare con 5 eventos y de track con 3, comprobadas por API de máquina en Actions y relectura de consola. Causación y correlación de las salidas exactas coinciden. |
| C ERP Cadena productiva desde erp_connector | Pendiente | Las entradas verificadas tienen origen qa_runbook. No acreditan lectura empresarial del ERP ni contexto real de proyectos. |
| 11.1 Evento malformado no cae ni bloquea cursor | Local | Pasan cuarentena, rechazo, avance de cursor y ausencia de publicación para entrada no calculable. API local inválida devuelve 400. No se inyectó basura en producción. |
| 11.2 Core no disponible, backoff y recuperación | Local | Se prueban fallos simulados y esperas 10, 20, 40, 80, 160 y 300 segundos; persistencia del envío pendiente. Falta prueba operativa controlada de interrupción y recuperación. |
| C ERP Sin NaN y último dato con fecha | Parcial | Conversión y rechazo de valores inválidos pasan; la UI publicada muestra fuente y fecha. No se apagó planta ni túnel para ensayar el comportamiento operacional. |
| 12.1 Consistencia visual | Cumple en revisión básica | Se observaron compare, track y dashboard publicados: tema oscuro, tipografía y cabecera consistentes. No constituye auditoría visual exhaustiva de todos los tamaños. |
| 12.2 Aviso de modo abierto | No aplica en producción actual | Ambas tools sirven SSO y exigen autenticación. No se acepta volver a modo abierto para evitar el rechazo de Logto. |
| C ERP Fuente, frescura y marca QA visibles | Cumple | Ambas pantallas muestran `Datos de prueba`, fuente y fecha. Compare muestra `Sin meta`; track identifica explícitamente un proyecto QA sin proyecto real. |
| Aceptación funcional con datos empresariales reales | Pendiente | Las cadenas que se validaron son QA. Compare sigue sin meta aprobada y el proyecto validado de track es de prueba. No acreditan un cierre ERP o proyecto empresarial real. |

## Hallazgos iniciales y estado actual

### 1 Login humano bloqueado por Logto

**Estado actual:** el acceso abierto de las tools quedó corregido y desplegado. Ambas exigen SSO y rechazan APIs anónimas con 401. El proveedor Logto devuelve HTTP 400 `oidc.invalid_redirect_uri` para las callbacks correctas de cpa y tpp. Esto impide completar el login antes de introducir las credenciales.

**Acción restante:** plataforma debe registrar las dos callbacks en la aplicación correcta. Después nos corresponde probar sesión humana, roles, retorno y logout. Detalle exacto de la aplicación y URLs en el documento de cierre. No se cambió la autenticación del dashboard central.

**Código relacionado:** `src/tool-auth/oidc-config.js:25`, `src/tool-auth/index.js:28` y `src/tool-server.js:28`.

### 2 Requisito SSO de despliegue corregido

**Estado actual:** la preparación valida SSO antes de escribir variables; los criterios de aceptación exigen SSO y SHA exacto. El despliegue autorizado pasó estas comprobaciones en ambas tools. Se cargaron solo SESSION_SECRET y TOOL_API_KEY ausentes, conservando volúmenes, consumidores y key central.

**Comprobación:** regresiones locales y con Node 22 Linux; pruebas previas y verificaciones posteriores del workflow exitosas. El inspector contrastó los assets reales con los secretos disponibles sin coincidencias.

**Código relacionado:** `scripts/prepare_railway_tool.js:28`, `scripts/inspect_railway_tool.js:102`, `scripts/inspect_railway_tool.js:133` y `scripts/wait_tool_deployment.js:5`.

### 3 Registro local y central no coinciden

**Problema observado:** el archivo local tiene owner `Guillermo Mottu` y requiredRoles `operations.manager, platform.auditor`. El registro servido tiene owner `pendiente de asignar` y solo `operations.manager` para las dos tools.

**Acción mínima:** confirmar con plataforma la matriz definitiva y alinear el registro desplegado. Ver la tool en verde no prueba que owner y permisos estén terminados.

**Código relacionado:** `src/data/platform/deployments.json:84` y `src/data/platform/deployments.json:86`.

### 4 Falta aceptación operacional y empresarial

**Estado actual:** se ejecutó una QA nueva por tool y se verificaron las cadenas exactas. El reemplazo real de contenedores conservó registros y cursores; no se observaron duplicados en las entradas antiguas y nuevas. Compare sigue sin meta aprobada y track usa un proyecto QA.

**Acción restante:** coordinar interrupción y recuperación reales con plataforma y completar el flujo con cierre ERP, meta aprobada y contexto de proyecto reales. El caso de pérdida abrupta de almacenamiento no se ensayó. No inventar metas ni proyectos para hacer pasar la aceptación.

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
