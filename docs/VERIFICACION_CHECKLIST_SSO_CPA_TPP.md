# Verificación del checklist SSO de CPA y TPP

Fecha local: 29 de octubre de 2026. Se revisaron las secciones 7 y 8 del [README indicado](https://github.com/carcamfer/IsoTools/blob/feature%2Ffilter/plantillas%2Fintegracion%2Fsso%2FREADME.md), recuperado por la API de GitHub desde feature/filter. Blob consultado: `38888a66b6a1884579e1e13e621f262b07c16710`. El texto de la sección 7 contiene nueve puntos; la sección 8 describe cinco fallas comunes, no un historial de incidencias del servicio.

Actualización posterior: la [aplicación de los instructivos](CIERRE_PENDIENTES_INSTRUCTIVOS_2026-10-29.md) incluye la inspección remota 41007839950. Confirmó claim roles y mapeos efectivos correctos en ambas tools, GET central 200 y comparación actual de secretos efectivos en las entradas del bundle inspeccionadas. Quedan la cuenta/entrega de roles en Logto y la actualización del registro central. Los límites sobre archivos no recorridos siguen vigentes.

## Evidencia y alcance

- Comprobación actual: GET públicos de CPA y TPP, inicio de login sin completar una sesión humana, lectura del registro original y prueba local de arranque sin SESSION_SECRET. El [informe JSON](evidencias/sso_readme_verificacion_2026-10-29.json) registra resultados y fecha UTC. No se imprimieron claves, tokens ni cookies.
- Pruebas locales repetidas: test_sso_configuration.js pasó en Node 24; test_sso_handshake.js y su variante --track pasaron en una imagen local Node 22, sin red exterior y con el repositorio de solo lectura. El [resumen de sus resultados](evidencias/sso_readme_pruebas_locales_2026-10-29.json) conserva sus códigos de salida. Usan un IdP sintético y la librería OIDC real. Los mensajes de rechazo de JWT/claims en esos tests son negativos deliberados, no fallas observadas de Logto.
- Evidencia humana previa: login, consentimiento, retorno a /deep/check?qa=1 y logout de ambas tools, documentados en [Ensayo CPA/TPP](ENSAYO_CPA_TPP_SOLO_LECTURA.md). La cuenta autenticó con roles reconocidos vacíos; se observó lectura denegada. Esa sesión no se repitió en esta revisión y no acredita acceso con roles autorizados.
- La imagen actualmente identificada por ambos health sigue siendo `5dd8fb199636c51053a10055da508b4a659cf400`, auth=sso. No se desplegó código ni se escribieron variables, cuentas, roles o eventos. Tampoco se reconsultaron logs privados de Railway.

## Los nueve puntos de la sección 7

| # | Requisito del README | CPA | TPP | Evidencia y límite |
| --- | --- | --- | --- | --- |
| 1 | /health responde 200 sin credenciales | Comprobado ahora | Comprobado ahora | Identidad correcta y SSO. También /ready respondió 200 en ambos. |
| 2 | Deep link anónimo redirige y vuelve al destino tras login | Inicio comprobado ahora; retorno humano previo | Inicio comprobado ahora; retorno humano previo | La redirección preserva /deep/check?qa=1; el inicio usa Logto y PKCE S256. El retorno humano completo está en la evidencia anterior, no se fabricó una nueva sesión. |
| 3 | GET /api sin cookie devuelve 401 JSON, no 302 | Comprobado ahora | Comprobado ahora | /api/analyses y /api/records devolvieron authentication_required con content-type JSON. |
| 4 | Con issuer definido y sin SESSION_SECRET, el proceso no arranca | Comprobado localmente | Comprobado localmente | Se lanzó src/tool-server.js con entorno sintético completo salvo SESSION_SECRET; ambos procesos terminaron con error antes de servir. No se borró el secreto de Railway. |
| 5 | Usuario sin rol mapeado autentica pero no autoriza | Prueba OIDC local aprobada; lectura humana previa denegada | Prueba OIDC local aprobada; lectura humana previa denegada | Con [] y roles desconocidos el fixture local niega POST con 403; no se hizo un POST con la cuenta humana real. El acceso positivo real con rol sigue pendiente. |
| 6 | authorizedByRole enviado en el body no concede permisos | Comprobado localmente | Comprobado localmente | Los tests OIDC rechazan el POST del auditor/sin rol aunque declare OperationsManager. bindActor toma la identidad de la sesión verificada. No se atribuye esta prueba sintética al servicio desplegado. |
| 7 | SPA y API salen por el mismo origen, sin CORS | Implementado y superficies públicas comprobadas | Implementado y superficies públicas comprobadas | El servidor sirve API, auth y assets juntos; el cliente usa /api relativo. La respuesta API inspeccionada no emitió Access-Control-Allow-Origin. No se repitió un recorrido Network de navegador autenticado. |
| 8 | ISOTOOLS_API_KEY y TOOL_API_KEY no aparecen en el bundle | Comparación efectiva renovada, sin fuga detectada | Comparación efectiva renovada, sin fuga detectada | La inspección 41007839950 volvió a comparar valores efectivos de bus/Logto/sesión en las entradas del manifest. El script no audita todos los chunks, sourcemaps o archivos arbitrarios: no es una certificación integral del frontend. |
| 9 | Entrada registrada en deployments.json del core | Registrada, metadatos incompletos | Registrada, metadatos incompletos | El original las declara federated/live con subdominios cpa/tpp y cláusulas ISO, pero owner sigue pendiente de asignar y no tiene requiredRoles explícitos. Debe completarse con el líder. |

El punto 8 no se debe reducir a buscar nombres de variables: comparar solo marcadores o una clave local no certifica la ausencia de todos los secretos efectivos. La nueva inspección sí utilizó variables efectivas y conserva el SHA servido; sus límites siguen siendo el inventario de archivos recorrido y el detector de marcadores/prefijos.

## Las cinco fallas comunes de la sección 8

### 1. Entro, pero no puedo hacer nada / no tengo roles

**Coincide con el síntoma humano observado.** La última sesión real devolvió user.roles=[] y role=null en ambas tools. Los inicios de login revisados ahora solicitan el scope roles; las pruebas locales convierten correctamente operations.manager y platform.auditor y descartan roles desconocidos.

El README orienta hacia la emisión del claim en el IdP. La evidencia disponible es el rol ya mapeado, no los claims crudos. Por eso el diagnóstico concreto sigue abierto entre asignación de cuenta, emisión/nombre del claim y mapeo efectivo del despliegue. Antes de cambiar políticas, nosotros debemos verificar OIDC_ROLES_CLAIM y ROLE_MAP efectivos; el líder/desarrollador administrador debe comprobar cuenta y emisión. Después se inicia una sesión nueva y se repite el acceso autorizado. No se concede autoridad por código ni por un rol enviado desde el cliente.

### 2. redirect_uri_mismatch

**Falla histórica superada en la última prueba humana.** Ambas callbacks permitieron completar el login y devolver al deep link. El inicio actual también envía las callbacks públicas propias. No hay evidencia actual de que este error siga bloqueando nuestras tools. Esa prueba no verifica la lista de callbacks localhost del administrador.

### 3. Login correcto, pero al recargar se pierde la sesión

**No se reprodujo ese síntoma.** Ambas URLs públicas usan HTTPS. El fixture OIDC comprueba cookie HttpOnly, Secure, SameSite=Lax, Path=/ y ausencia de Domain. En local HTTP la guía indica SESSION_INSECURE_COOKIES=true; esa opción no debe copiarse al despliegue HTTPS. No se realizó una prueba humana específica de recarga en esta revisión.

### 4. Login intermitente con varias instancias

**La implementación sigue el mecanismo indicado.** Code verifier, state, nonce y returnTo viajan en la cookie firmada del handshake con vencimiento; no dependen de un Map en memoria del proceso. La caché en memoria del discovery es distinta del estado del handshake. No se realizó una prueba con varias réplicas de Railway, por lo que no se declara validado el comportamiento bajo esa topología.

### 5. Bloqueado esperando plataforma para correr localmente

**No bloquea las pruebas aisladas ya realizadas.** Usamos configuración sintética e IdP local interceptado; ambas tools pasaron. La guía pide autorizar también callbacks localhost para una prueba local con Logto real. No se inspeccionó la lista administrativa de Redirect URIs y su registro local sigue sin comprobarse. La evidencia local sintética no acredita esa autorización.

## Acciones que quedan de esta revisión

1. Nosotros: inspeccionar claim y mapeo efectivos, preparar el ajuste de owner/roles del registro central y conservar las pruebas locales como evidencia técnica.
2. Líder/desarrollador administrador: verificar la cuenta y emisión de roles en Logto, revisar callbacks localhost si se necesita una sesión local real y aplicar los metadatos acordados en el core.
3. Nosotros con una cuenta autorizada: repetir la sesión humana, comprobar lectura/evaluación según rol y logout. El acceso positivo real no está cerrado.
4. Para refrescar completamente el punto 8: comparar las claves efectivas de servidor y ampliar el inventario a los archivos de bundle que se quieran certificar, sin exponer secretos ni modificar el servicio.

Estas acciones se refieren al checklist SSO de este README. No cierran el contrato de proyecto TPP ni los PV del ensayo integral, que tienen evidencia y responsables separados en [la revisión de pendientes](REVISION_INSTRUCCIONES_PENDIENTES_CPA_TPP.md).
