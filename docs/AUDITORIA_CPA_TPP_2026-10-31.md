# Auditoria CPA/TPP — 31 de octubre de 2026

Actualizacion durante la correccion: el hallazgo inicial de organizacion ausente se rectifica en la seccion 3 al contrastarlo con el contrato ERP y las regresiones existentes. Las correcciones y su validacion se registran en CORRECCIONES_CPA_TPP_2026-10-31.md. Este informe conserva el estado observado antes de aplicarlas.

## Dictamen

Las dos tools estan operativas y conservan su estado. La correccion del reinicio automatico por handshake ausente esta activa en ambas. No se encontro un proceso de nuestras tools que consulte Logto periodicamente ni un reintento automatico dentro de una misma solicitud fallida.

Sin embargo, hay problemas propios reproducibles y una falta de evidencia historica de autenticacion. No se puede certificar que nuestro codigo no haya contribuido al bloqueo de Logto. Los resultados de esta auditoria no atribuyen la causa a otra persona o servicio.

Auditoria de solo lectura: no se modificaron fuentes, contratos, dependencias, secretos, permisos o configuracion. No se publico en el bus, no se desplego y no se volvio a intentar iniciar sesion en Logto. Se ejecutaron fixtures locales, se consultaron registros y APIs de nuestras tools y se genero este informe.

## Alcance y carga

CPA y TPP: entrada src/tool-server.js, gateway src/tool-auth, consumidores, adaptador ERP, evaluadores, contexto de proyecto, cliente servido demo-frontend, Dockerfiles, workflow de tools, configuracion efectiva y muestras de logs de Railway. Se revisaron tambien los catalogos mediante su validador.

Carga asumida: una replica por tool, volumen con un solo escritor, pocos desarrolladores y polling de eventos cada 10 segundos. La limitacion de un escritor esta documentada en el consumidor y en los TOML; no se ejecutaron ensayos de varias replicas ni de carga contra servicios externos. El core, Logto administracion, ERP y otras tools no son una certificacion de este informe.

## Hallazgos priorizados

### 1. Atender: dependencia afectada en el parser publico de peticiones

Referencia: src/tool-server.js:27 y pnpm-lock.yaml:205.

El lockfile de ejecucion instala body-parser 2.3.0 a traves de Express. express.json se monta antes de autenticar y mantiene la descompresion predeterminada. El proveedor publico un aviso para versiones anteriores a 2.4.0: ciertos cuerpos comprimidos con bytes adicionales pueden terminar el proceso.

Se verificaron version y ruta expuesta. Una prueba exploratoria contra un proceso local desechable NO reprodujo la caida; no se declara una explotacion comprobada en nuestras tools. Nunca se envio esa prueba a Railway.

Correccion minima: actualizar a la version corregida compatible o desactivar inflate si el contrato no requiere cuerpos comprimidos, con una prueba de regresion. Dejarlo pendiente conserva una dependencia afectada en una ruta publica, aunque no explica el 429 de Logto.

Fuente primaria: https://github.com/advisories/GHSA-27r3-jxmh-p828

### 2. Atender: login sin limite de rafagas ni pausa tras fallo de discovery

Referencias: src/tool-server.js:36; src/tool-auth/auth-gateway.js:43 y :67.

El limitador existente protege la evaluacion POST, pero no /auth/login. Con un IdP simulado, 20 solicitudes locales consecutivas devolvieron 20 redirecciones. Cuando discovery devolvio 429, seis nuevas solicitudes produjeron seis nuevas consultas al proveedor: la promesa rechazada se descarta sin un periodo de espera.

Esto requiere multiples solicitudes entrantes; no es un bucle autonomo del servidor. No demuestra que haya ocurrido durante el incidente. Una rafaga iniciada por un cliente puede seguir generando trafico hacia el tenant compartido incluso despues de la correccion del callback.

Correccion minima: limitar el inicio de sesion y establecer una pausa acotada tras errores/429 de discovery. Mantener los errores como respuestas terminales, sin redireccion automatica. La prueba debe comprobar que una rafaga se limita y que solicitudes nuevas durante la pausa no vuelven a consultar el IdP.

### 3. Rectificacion: CPA sin organizacion puede publicar sin_meta

Referencia: src/services/toolConsumer.js:76.

Se reprodujo con un cierre QA sin organizacion ni meta una publicacion sin_meta con organization_id=null. Al contrastarlo con cerebro/comunicaciones/sync_erp_data_local__compare_planned_vs_actual.md y scripts/test_tool_service.js se confirmo que ese comportamiento esta permitido expresamente para preservar el hecho ERP sin inventar una organizacion. Clasificar ese caso aislado como defecto en la auditoria inicial fue un error.

Se conserva esa regla. La correccion se limita a que sin_meta no oculte otros campos invalidos, especialmente as_of_date o configuracion. El ensayo con una meta y los calculos que requieren organizacion siguen mostrando los datos faltantes; no se configura una identidad real ni se modifican publicaciones historicas.

### 4. Atender: booleanos y espacios aceptados como numeros

Referencias: src/tools/compare_planned_vs_actual.js:186 y src/tools/track_project_progress.js:136.

Number(false) y Number(' ') producen cero. Con entradas completas excepto esos valores, CPA y TPP devolvieron on_track en lugar de rechazar los datos. TPP no emitio advertencias; CPA solo la advertencia de meta cero. Los casos se reprodujeron localmente en Node 22.

Correccion minima: validar tipo y contenido antes de convertir; rechazar booleanos, cadenas vacias/espacios y estructuras, preservando solo formatos numericos admitidos por el contrato. Agregar regresiones para ambas tools. Si se omite, una captura mal formada puede aparecer como una evaluacion valida.

### 5. Mejorar para diagnosticar: falta trazabilidad de solicitudes de autenticacion

Referencias: src/tool-server.js:33 y src/tool-auth/auth-gateway.js:201.

El servicio registra eventos del consumidor y algunos errores del gateway, pero no instrumenta todos los inicios, callbacks, resultados o duraciones de autenticacion. La inspeccion de Railway obtuvo 100 lineas por tool y su resumen conservado mostro polling; no constituye un historial completo de accesos ni permite contar logins exitosos, cookies ausentes o redirecciones del incidente.

Correccion minima: registrar fase, resultado, duracion e identificador de solicitud/instancia, con campos permitidos expresamente. Excluir query strings, codigos OIDC, cookies, tokens, secretos y cuerpos. Correlacionar despues con los registros del tenant. Sin esto no podemos demostrar el volumen de solicitudes que nuestras tools generaron durante el bloqueo.

## Dependencias: alcance de los avisos

pnpm audit --prod --json sobre el lockfile utilizado por Railway reporto 20 avisos: 1 critico, 8 altos, 9 moderados y 2 bajos. Son avisos de dependencias, no 20 explotaciones demostradas. Incluyen body-parser, proxy-addr, fast-uri, qs, morgan y uuid.

El aviso critico de proxy-addr requiere determinadas subredes IPv6 de confianza mal configuradas. Nuestras tools usan trust proxy=1; no se encontro esa condicion concreta. No se declara explotable aqui solo por su etiqueta critica. Morgan esta instalado, pero no se usa como middleware de acceso de estas dos tools. Debe revisarse el resto segun uso efectivo al actualizar.

Fuentes primarias:

- https://github.com/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/advisories/GHSA-27r3-jxmh-p828

El lockfile del cliente reporto tres paquetes afectados: vite 7.3.6, nanoid 3.3.16 y source-map-js 1.2.1. Los Dockerfiles usan Vite para compilar y sirven el resultado con Express; no arrancan un servidor Vite publico en Railway. Son tareas de mantenimiento del entorno de compilacion/desarrollo, sin evidencia de relacion con el bloqueo de Logto.

Fuentes primarias:

- https://github.com/advisories/GHSA-698v-4r3x-3vcv
- https://github.com/advisories/GHSA-2v37-7h3g-55p8
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q

## Comprobaciones aprobadas

- 24 ejecuciones de pruebas de tools, servicio, contrato, proyecto, cliente, configuracion, consumidores, persistencia, reintentos, replay y OIDC. Node 22.23.3, Docker sin red exterior, repositorio de solo lectura y estado temporal. Incluye handshake para ambas tools.
- test_tool_service.js fallo inicialmente al heredar NODE_ENV=production de la imagen: comienza probando el modo de desarrollo sin IdP. Se repitio con NODE_ENV=test y paso. No se modifico la politica de produccion ni el codigo para aceptar la prueba.
- Validador del catalogo: 125 tools, 16 registradas, 10 roles, ningun error. Un aviso corresponde a detect_out_of_control_signals, fuera de nuestras tools.
- No se ejecuto test_package_iso.js porque publica en un bus configurado. Las publicaciones de las otras pruebas fueron exclusivamente hacia fixtures.
- Sesiones falsas/alteradas rechazadas; estado, nonce, PKCE, firma, emisor, audiencia y vencimiento comprobados con IdP local. Usuario sin rol 403, auditor lectura permitida/escritura denegada, operador permitido; sin redireccion por falta de permisos.
- En el servicio real, GET /auth/callback sin handshake devuelve 400 AUTH_LOGIN_EXPIRED, sin Location, tanto CPA como TPP. La correccion desplegada detiene ese caso.
- /health y /ready: HTTP 200 en ambas. SHA servido: 006d260665cd36d7eb437c0bd7ed630eefa84adb.
- Clave central aceptada, consumidores activos, configuracion SSO completa, claim/mapeo de roles correctos, volumen persistente y fuente GitHub desconectada en ambos servicios. Esto no asigna roles a la cuenta humana.
- CPA: cursor 7679, 2 registros, 0 rechazos. TPP: cursor 7684, 3 registros, 4 rechazos conservados. Hashes de registros iguales al estado previo; ninguna publicacion pendiente y suscripciones sin entradas posteriores al cursor.
- Los bundles efectivos fueron inspeccionados contra las claves reales disponibles, client secret y session secret, sin coincidencias. Un escaneo adicional de 488 archivos versionados actuales contra seis secretos locales conocidos tampoco encontro coincidencias. No es un escaneo completo del historial Git ni de secretos desconocidos.

Inspeccion Railway: https://github.com/GuillermoMottu/IsoTools/actions/runs/41265108354

## Evidencias locales de esta auditoria

Directorio: C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/29/01a18643-a407-7923-89e9-0ce38f5c7e94/audit-cpa-tpp-2026-10-31.

- railway-inspection.json: resumen sanitizado del workflow.
- tests-summary.json: inventario y resultado de las 24 ejecuciones.
- dependency-runtime.json y dependency-frontend.json: respuestas de auditoria de dependencias.
- tracked-secret-scan.json: cantidades y coincidencias, sin valores de secretos.
- auth-probes.mjs y data-probes.mjs: reproducciones locales con fixtures, sin credenciales reales.
- body-probe.mjs: intento exploratorio de reproduccion local de la alerta de compresion, sin caida observada.

## Limites y siguiente paso

No se accedio a la administracion ni al historial completo de Logto. No se verifico una sesion humana nueva con operations.manager debido al bloqueo observado anteriormente. No se ejecutaron cargas, interrupciones o payloads de seguridad contra servicios desplegados; tampoco pruebas SQL del core ni integraciones de otros equipos.

Prioridad propia: atender parser/dependencias, proteccion de login y trazabilidad; corregir luego las validaciones CPA/TPP con sus regresiones. Despues repetir las comprobaciones y una unica sesion humana cuando el proveedor permita el acceso. Para identificar la causa historica del incidente siguen haciendo falta los registros de Logto del mismo periodo.

## Evidencia adicional: video de Carlos

Se inspeccionaron fotogramas del archivo WhatsApp Video 2026-10-31 at 8.36.54 PM.mp4, de 12.73 segundos. La pantalla muestra cloud.logto.io/pfwk8f/audit-logs, tenant IsoTools Dev, con multiples avisos Too Many Requests. La seccion Audit logs no carga y muestra JSON.parse: unexpected character at line 1 column 1 of the JSON data. El reloj visible marca 31 de octubre, aproximadamente 20:34–20:35; no se comprobo la zona horaria del equipo grabado.

Esto confirma que el acceso a los registros de administracion tambien falla. El error de JSON es compatible con una respuesta de error que no sea JSON, pero el video no muestra la respuesta de red ni sus cabeceras y no permite demostrarlo. La pila de avisos no prueba por si sola un bucle ni identifica que aplicacion origino las solicitudes.

Si la consola sigue sin permitir consultar registros, el administrador puede conservar el video y recoger, de una unica peticion fallida en las herramientas de red del navegador, el endpoint sin parametros sensibles, el estado HTTP, Retry-After y un request ID si existen. Esa evidencia permite solicitar revision a soporte de Logto sin depender de la pantalla Audit logs. No compartir cookies, tokens ni un HAR completo sin sanear. En esta revision no se hicieron nuevos intentos contra Logto ni se contacto a soporte.
