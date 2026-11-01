# Bloqueo de acceso Logto: CPA y TPP

Fecha local: 31 de octubre de 2026.

## Observaciones

- La pestaña existente en el dominio de Logto muestra `Too many requests. Please try again later.` No se recargo ni se enviaron nuevos intentos al proveedor.
- CPA y TPP respondieron HTTP 200 en /health y /ready. Sin cookies, /auth/me devolvio 401 JSON, sin Location. El bloqueo de acceso no demuestra una caida de las tools o del consumidor.
- Los builds observados antes del cambio fueron CPA 5dd8fb199636c51053a10055da508b4a659cf400 y TPP 479decaf4435b40db5219e46dde9b0b4eafe3c73.
- La UI consulta /auth/me una vez por montaje; la comprobacion periodica de salud consulta nuestra tool, no Logto. Un usuario sin rol recibe 403, sin reinicio automatico de login.

## Posible repeticion reproducida y correccion

En el gateway propio src/tool-auth/auth-gateway.js, un callback sin cookie de handshake valida devolvia 302 /auth/login. Si el navegador pierde o rechaza reiteradamente esa cookie, el viaje entre proveedor y callback puede repetirse. Se reprodujo ese primer salto localmente. No se cuenta con una traza del incidente que demuestre que esa fue la causa de la limitacion observada.

Ahora un handshake ausente, alterado o vencido termina con 400 AUTH_LOGIN_EXPIRED, sin redireccion y sin consultar al IdP. Se limpia la cookie de handshake y se requiere un nuevo inicio explicito. No se cambian roles, cookies de sesion validas, credenciales del bus ni cursores.

Las regresiones OIDC de ambas tools comprueban esos tres casos, un intercambio de token rechazado con 429 sin reintentos, login valido, PKCE, firmas/claims, deep links, logout y permisos. El proveedor de esas pruebas es una simulacion local; no verifica el rol asignado en Logto real.

El cambio se limita al gateway de nuestras tools. El gateway del core y la plantilla original no se modifican.

Estado de entrega: publicado y desplegado en CPA y TPP como 006d260665cd36d7eb437c0bd7ed630eefa84adb. Tras un rechazo inicial de la revision automatica, el usuario autorizo expresamente este despliegue el 31 de octubre. El [workflow 41263685369](https://github.com/GuillermoMottu/IsoTools/actions/runs/41263685369) termino success en ambos jobs. Las pruebas locales pasaron en Node 24.22.1 y los preflight del workflow en Node 22. Los jobs de replay y publicacion QA quedaron skipped.

## Comprobacion del despliegue

Las consultas directas a ambos servicios verificaron health y ready HTTP 200, modo SSO y el SHA esperado. GET /auth/callback sin cookie devolvio 400 AUTH_LOGIN_EXPIRED, sin Location, con cache-control no-store y borrado de la cookie de handshake. No se siguieron redirecciones ni se inicio sesion en Logto.

| Tool | Cursor antes/despues | Registros | Rechazos conservados | Estado |
| --- | --- | --- | --- | --- |
| CPA | 7679 / 7679 | 2 | 0 | Hash de registros identico, sin publicacion pendiente. |
| TPP | 7684 / 7684 | 3 | 4 | Hash de registros identico, sin publicacion pendiente. |

Se verifico ademas que las claves de servicio existentes siguen funcionando y que /auth/me sin sesion mantiene 401 sin redireccion. Evidencias sanitizadas: [antes](evidencias/oidc_antibucle_2026-10-31_antes.json) y [despues](evidencias/oidc_antibucle_2026-10-31_despues.json). Estos resultados no prueban el desbloqueo del proveedor ni la asignacion efectiva del rol en una sesion nueva.

## Seguimiento

- El usuario confirmo que Carlos asigno operations.manager; operatios.manager era un error al escribir el mensaje. Falta verificar su entrega en una sesion real; no se inspecciono la consola administrativa.
- Evitar recargas o varios subdominios iniciando sesion mientras se aplica la limitacion. Revisar con el administrador las solicitudes y errores del tenant para identificar el origen y el alcance de la limitacion.
- Una vez restablecido el acceso, iniciar una sesion nueva y verificar /auth/me y una operacion autorizada. La nueva asignacion de rol todavia no se pudo comprobar por el bloqueo.
- Generar la key de lectura del ensayo no cambia los permisos humanos ni elimina la limitacion de Logto.

Referencia del proveedor: https://docs.logto.io/logto-cloud/system-limit. Documenta limites por tenant y HTTP 429; no prueba cual limite concreto afecto a este incidente.
