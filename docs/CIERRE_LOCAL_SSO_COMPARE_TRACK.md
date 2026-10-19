# Correcciones locales de SSO para compare y track

Fecha: 19 de octubre de 2026.

La parte de código de nuestras dos tools está corregida y probada. Este documento acredita el cierre local; no declara que el SSO esté activo en Railway. No se hizo commit, push, despliegue, cambio de variables remoto ni publicación de eventos QA al core durante esta implementación.

## Cambios implementados

- Configuración de las tools y plantilla: se aceptan `ISSUER_ENDPOINT`, `APP_ID` y `APP_SECRETS` sin duplicar variables. Los nombres `OIDC_ISSUER`, `OIDC_CLIENT_ID` y `OIDC_CLIENT_SECRET` tienen prioridad cuando contienen un valor.
- Con `NODE_ENV=production` se exige SSO completo, issuer y callback HTTPS y cookies Secure. Sin configuración válida el proceso no arranca abierto. Desarrollo sin configuración de identidad conserva el modo abierto.
- La preparación de Railway exige configuración SSO completa y la callback exacta de cada tool antes de escribir variables. Conserva secretos existentes, el volumen y el cursor; no activa consumidores pausados salvo la opción explícita ya existente.
- La aceptación del despliegue exige `auth=sso`, identidad y SHA esperados, y rechazo 401 de consultas anónimas a `/auth/me` y `/api/tool/status`.
- Las imágenes generan `assets/manifest.json`. Así se pueden revisar los archivos públicos compilados aunque la pantalla HTML requiera login. La pantalla sigue protegida.
- El inspector busca nombres y prefijos reales de API key, secreto Logto, secreto de sesión y credencial de máquina. Una clave sellada no se presenta como valor comprobado. La comprobación estricta del bundle falla si faltan los valores necesarios para certificar esos prefijos.
- La QA desplegada admite una credencial de máquina independiente por tool, usando el plano `TOOL_API_KEY` que el backend ya soportaba. Verifica acceso y SSO antes de publicar la entrada QA de esa tool. No manda la key del core a las tools.
- El workflow incorpora pruebas con Node 22 antes de preparar o desplegar servicios. Los ejemplos de entorno y la plantilla documentan el requisito actualizado.

La política de autenticación del core/dashboard en `src/auth/` no se modificó: corresponde al equipo de plataforma. En una revisión posterior solo se eliminó del mensaje de error el valor de un issuer inválido, para evitar imprimir variables sensibles. Las tools utilizan `src/tool-auth/` y autentican directamente contra Logto.

## Credenciales preparadas localmente

Se generaron candidatos independientes de 32 bytes aleatorios por secreto. Los valores no se imprimieron en las salidas de herramientas y los archivos están excluidos por `.gitignore`.

| Tool | Archivo local de sesión | Archivo local de credencial de máquina |
| --- | --- | --- |
| compare_planned_vs_actual | `.env.cpa.session.local` | `.env.cpa.service.local` |
| track_project_progress | `.env.tpp.session.local` | `.env.tpp.service.local` |

Los archivos de sesión contienen `SESSION_SECRET`, nombre de cookie y URIs. Son los secretos de sesión que pidió el líder. Los archivos de servicio contienen `TOOL_API_KEY`, para el acceso automatizado a APIs protegidas de cada tool. No son secretos de aplicación de Logto ni la key del core.

Antes de aplicar cualquiera, inspeccionar el servicio. Si ya existe un secreto válido, conservarlo y no sustituirlo por el candidato local. No se enviaron secretos a otra persona ni se configuraron en Railway o GitHub.

## Configuración por servicio

| Campo | Compare | Track |
| --- | --- | --- |
| Servicio Railway | compare-planned-vs-actual | track-project-progress |
| TOOL_PAGE_ID | compare_planned_vs_actual | track_project_progress |
| OIDC_REDIRECT_URI | https://cpa.orcalabs.mx/auth/callback | https://tpp.orcalabs.mx/auth/callback |
| SESSION_COOKIE_NAME | cpa_session | tpp_session |
| OIDC_POST_LOGOUT_REDIRECT_URI | https://api-events.orcalabs.mx/ | https://api-events.orcalabs.mx/ |
| OIDC_SCOPES | openid profile email roles | openid profile email roles |
| ISOTOOLS_API_URL | https://api-events.orcalabs.mx/api/v1 | https://api-events.orcalabs.mx/api/v1 |
| Credencial de CI para API propia | COMPARE_TOOL_API_KEY | TRACK_TOOL_API_KEY |

`ISSUER_ENDPOINT`, `APP_ID` y `APP_SECRETS` deben corresponder a la aplicación Logto de cada tool. La callback también debe estar registrada en Logto; crear la variable en Railway no registra una URI en el proveedor de identidad.

Para ejecutar la QA por Actions con SSO activo, el valor de `TOOL_API_KEY` del backend de compare debe coincidir con el secreto de Actions `COMPARE_TOOL_API_KEY`; para track, con `TRACK_TOOL_API_KEY`. Son opcionales para el uso humano de la tool, pero necesarios para esa inspección automatizada del estado. La clave central continúa en `ISOTOOLS_API_KEY` y conserva sus scopes propios.

## Evidencia ejecutada

- 19 de 19 comprobaciones locales pasaron con Node v25.9.0 en Windows: las 17 de la auditoría más `test_sso_configuration.js` y `test_runbook_deployed_auth.js`.
- 11 de 11 comprobaciones del backend pasaron con Node v22.23.3 en Linux, dentro de un contenedor sin red, con el código actual montado en solo lectura y temporales aislados.
- Dos compilaciones Vite, una por tool, generaron sus manifiestos correctamente.
- Los dos builds se sirvieron con el backend actual en contenedores Node 22 con `NODE_ENV=production`, Logto simulado y red deshabilitada. Se comprobó health 200 con SSO, APIs anónimas 401, pantalla 302 y manifiesto público 200, además de la revisión de sus assets.
- Las pruebas de handshake usan las variables con nombres Logto y verifican PKCE, firma RSA/JWKS, state, nonce, emisor, audiencia, expiración, callback, deep link, logout y denegación a usuarios sin rol o sin permiso de operación.
- La nueva regresión QA comprueba que las claves del core y de las tools no se cruzan; con credencial ausente o incorrecta no publica ninguna entrada de prueba en ese caso. Con las dos credenciales válidas verifica ambos flujos simulados.
- YAML del workflow, orden de pruebas antes de cambios remotos, manifiestos y ausencia de marcadores de secretos/prefijos de los candidatos locales en los builds: comprobados.
- Análisis estático explícito `no-undef` y `no-unused-vars` de los JavaScript cambiados: pasó. El lint general del repositorio no pudo ejecutarse con sus valores predeterminados porque falta una configuración ESLint; no se agregó una configuración global fuera de este alcance.
- `git diff --check`: pasó.

Evidencia local:

- [Resultados de las 19 comprobaciones](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/tests.json>).
- [Resultados Linux Node 22](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/node22-linux-tests.log>).
- [Build real y backend de compare en modo producción](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/production-compare_planned_vs_actual.log>).
- [Build real y backend de track en modo producción](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/runbook-fixes/production-track_project_progress.log>).

Se reutilizó una imagen local para el runtime Linux con las dependencias que ya contenía, montando el código actual. No se descargaron ni reconstruyeron imágenes completas y no se desplegó ese contenedor. Estas pruebas no son una sesión real con Logto ni un reinicio del volumen Railway.

La revisión posterior de secretos encontró y corrigió un archivo local de frontend con una variable privada VITE_, exclusiones insuficientes de `.env` anidados en Docker y el mensaje de issuer inválido. Evidencia y límites en [REVISION_SECRETOS_2026-10-19.md](REVISION_SECRETOS_2026-10-19.md).

## Aplicación remota pendiente

La auditoría anterior encontró ambas tools abiertas y un registro QA por servicio. No se cambió ese estado durante esta implementación. Las comprobaciones de aceptación productiva siguen pendientes hasta aplicar y probar esta versión.

La ejecución del workflow de inspección privada había sido rechazada por la revisión automática de permisos porque utiliza secretos del repositorio y acceso a Railway sin autorización explícita para ese workflow. No se intentó eludir ese rechazo. El código actual está preparado para revisión antes de publicar o desplegar.

Orden de aplicación:

1. Autorizar la inspección privada de la rama verificada, con `deploy-tools.yml`, `tool=all`, `mode=inspect`, `activate_consumer=false`.
2. Confirmar variables y volumen de cada servicio, preservar secretos ya existentes y acordar con el líder los que falten. Nunca imprimir ni pasar secretos como argumentos de CLI.
3. Confirmar las dos aplicaciones Logto, callbacks, logout y usuarios/roles con plataforma. Los campos faltantes detienen el despliegue antes de escribir variables.
4. Publicar los cambios revisados en la rama de trabajo y ejecutar las pruebas/despliegue con SSO configurado, conservando los volúmenes y consumidores activos.
5. Validar login real, 401 anónimo, deep links, logout y permisos con cuentas de Logto.
6. Ejecutar una QA marcada nueva y verificar salida y cadena exactas de cada consumidor desplegado.
7. Coordinar reinicio real del servicio y prueba de fallo/recuperación; verificar persistencia y ausencia de duplicados.
8. Completar aceptación con cierre ERP real, meta aprobada cuando corresponda y contexto real de proyecto.

## Dependencias del líder y plataforma

- Confirmar las credenciales y URIs de cada aplicación Logto y los roles asignados a las cuentas de prueba.
- Alinear owner y requiredRoles del registro central con la matriz definitiva; el archivo local ya contiene responsable y roles.
- Proporcionar o confirmar la meta aprobada y el contexto real de proyecto. No se generan datos empresariales ficticios para cerrar esos puntos.
- Coordinar las pruebas que interrumpan el servicio o dependan del ERP y túnel de planta.

No cambió ningún contrato de eventos ni se agregaron tools o reglas de comunicación, por lo que no corresponde regenerar el cerebro ni modificar las bitácoras de comunicaciones por este cambio de autenticación y validación.
