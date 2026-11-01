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

Estado de entrega: pruebas locales OIDC y configuracion aprobadas en Node 24.22.1. Tras un rechazo inicial de la revision automatica, el usuario autorizo expresamente publicar y desplegar esta correccion en CPA y TPP el 31 de octubre. Se conserva el estado previo en evidencias/oidc_antibucle_2026-10-31_antes.json; el despliegue y su comprobacion quedan en curso al publicar este diagnostico.

## Seguimiento

- El usuario confirmo que Carlos asigno operations.manager; operatios.manager era un error al escribir el mensaje. Falta verificar su entrega en una sesion real; no se inspecciono la consola administrativa.
- Evitar recargas o varios subdominios iniciando sesion mientras se aplica la limitacion. Revisar con el administrador las solicitudes y errores del tenant para identificar el origen y el alcance de la limitacion.
- Una vez restablecido el acceso, iniciar una sesion nueva y verificar /auth/me y una operacion autorizada. La nueva asignacion de rol todavia no se pudo comprobar por el bloqueo.
- Generar la key de lectura del ensayo no cambia los permisos humanos ni elimina la limitacion de Logto.

Referencia del proveedor: https://docs.logto.io/logto-cloud/system-limit. Documenta limites por tenant y HTTP 429; no prueba cual limite concreto afecto a este incidente.
