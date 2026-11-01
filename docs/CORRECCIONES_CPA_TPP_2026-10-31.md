# Correcciones propias de CPA y TPP — 31 de octubre de 2026

## Cambios

- Autenticacion: diez solicitudes por fase/IP y minuto, treinta en total por tool y minuto. Incluye inicio de sesion, callbacks con handshake valido y logout. Los callbacks sin handshake siguen terminando en 400, sin consultar al proveedor. Cuota en memoria para la replica unica configurada; no es una cuota compartida de todo Logto.
- Errores de discovery, red, HTTP 429 y HTTP 5xx activan una pausa local de al menos 30 segundos. Se toma Retry-After numerico o fecha HTTP cuando existe, con tope de una hora. Durante la pausa se devuelve 503 con Retry-After y no se inicia otro viaje al proveedor. No hay reintento automatico. Logout borra la sesion local y no redirige a un proveedor en pausa.
- Trazas: fase, request ID generado por el servicio, instancia, revision, estado HTTP y duracion. No se registra el error crudo del proveedor ni URL, query, cuerpo, cookies, codigos, tokens, IP o identidad de usuario. La inspeccion de Railway conserva muestras de estos campos mediante una lista permitida; no es un historial exhaustivo.
- Datos: CPA y TPP rechazan booleanos, espacios, arreglos y objetos en cantidades/porcentajes antes de convertirlos. Mantienen numeros finitos y strings decimales validos. Objetos con metodos de conversion no validos tampoco disparan excepciones. Se conserva la politica existente de advertencias para peso/presupuesto opcionales.
- CPA: sin_meta no oculta una fecha u otra configuracion invalida. Se conserva el contrato ERP que permite publicar el real sin meta con la organizacion pendiente. El hallazgo contrario de la auditoria inicial se rectifico; no se inventa una organizacion ni se cambian hechos historicos.
- HTTP: cuerpos gzip/deflate se rechazan con 415 antes de crear un decodificador; solicitudes demasiado grandes mantienen 413 y JSON invalido 400.
- Dependencias: actualizaciones compatibles de runtime y cliente; uuid pasa de 9 a 11 y se comprobo el uso existente de v4. Se sincronizaron pnpm-lock.yaml, package-lock.json y el lockfile del cliente. Sin dependencias nuevas.

## Validacion local

- 26 ejecuciones de pruebas de las tools y del cliente en Node 24.22.1, incluido handshake CPA/TPP. Se volvieron a probar calculos y calidad de datos despues del ultimo ajuste de conversion numerica.
- 19 ejecuciones de backend en Node 22.23.4 desde la imagen final, sin red exterior, con scripts de solo lectura y estado temporal. La comprobacion de configuracion requirio repetirla con las plantillas de referencia montadas; esas plantillas no forman parte de la imagen productiva.
- Ambas imagenes construidas con sus Dockerfiles reales y lockfiles congelados. Cliente compilado con Vite 7.3.7. Smoke de arranque y assets aprobado para cada imagen. Los smokes abiertos fueron solo locales con NODE_ENV=test; las pruebas OIDC verificaron por separado la politica protegida con un IdP simulado.
- Regresiones de rafaga por cliente y global, repeticion de callback, 429 en discovery y en token, red/5xx, recuperacion despues de pausa, logout local y secreto ausente en las trazas.
- Auditoria pnpm de produccion: cero avisos. Auditoria del cliente: cero avisos. Sigue un aviso moderado de minimatch en linters heredados de desarrollo; no se instala en las imagenes de runtime. No se forzo una sustitucion mayor incompatible de los linters del core para ocultar ese aviso.
- No se ejecuto el script que publica en el bus central. Ninguna prueba de carga o seguridad fue contra Railway o Logto. No se rotaron secretos, alteraron roles ni se cambiaron cursores o registros existentes.

## Evidencia

Directorio local: C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/29/01a18643-a407-7923-89e9-0ce38f5c7e94/fixes-cpa-tpp-2026-10-31.

Informes: tests-node24.json, tests-node22-verified.json, audit-runtime.json, audit-frontend.json y audit-development.json. tests-node22.json conserva tambien la primera falla de montaje de una plantilla de prueba, corregida al repetirla. No contiene credenciales reales.

## Entrega

Implementado como [86eb927](https://github.com/GuillermoMottu/IsoTools/commit/86eb927) y desplegado en CPA y TPP con la revision 2862cefc37ba75f258268e595f695bb64a09db99, tras la autorizacion explicita del usuario. El [workflow de despliegue 41269893796](https://github.com/GuillermoMottu/IsoTools/actions/runs/41269893796) termino success para ambas tools, con los preflight aprobados y los jobs de publicacion QA/replay skipped.

## Verificacion de los servicios desplegados

- /health y /ready: 200, modo SSO y revision esperada en ambos servicios. /auth/me sin sesion: 401 sin redireccion.
- Callback sin handshake: 400 AUTH_LOGIN_EXPIRED, sin redireccion y con request ID. La inspeccion de logs encontro ese mismo request ID con http_status=400 en cada servicio: las trazas funcionan en Railway.
- En cada API de evaluacion se envio un fixture completo con cantidades booleanas: 400/not_calculable. El fixture numerico valido devolvio 200/deviation en CPA y 200/at_risk en TPP. Son credenciales de servicio y datos sinteticos; no acreditan permisos humanos ni una cadena ERP historica.
- El hash del estado completo del consumidor fue identico antes y despues del despliegue y de las evaluaciones. CPA conserva cursor 7679, dos registros y cero rechazos. TPP conserva cursor 7684, tres registros y cuatro rechazos anteriores. Sin publicaciones pendientes ni entradas posteriores al cursor.
- Claves de servicio y central operativas, consumidores activos, volumen persistente y assets efectivos sin las claves/client secret/session secret inspeccionados. Fuente GitHub desconectada en ambos servicios; no se cambio el core ni main.
- Los limites y la pausa del proveedor se comprobaron con fixtures locales; no se generaron rafagas ni nuevos intentos contra Logto en los servicios reales. No se publico ningun evento central durante esta entrega.

Evidencia: [antes](evidencias/endurecimiento_41269893796_antes.json), [evaluaciones y estado despues](evidencias/endurecimiento_41269893796_despues.json) e [inspeccion final](evidencias/endurecimiento_41270098282_inspeccion.json). La [inspeccion 41270098282](https://github.com/GuillermoMottu/IsoTools/actions/runs/41270098282) termino success en ambas tools.

El desbloqueo de Logto y la sesion humana con operations.manager siguen sin verificarse. Las nuevas trazas permiten observar solicitudes futuras; no reconstruyen el incidente anterior ni prueban que hayamos sido su causa. El aviso moderado del tooling heredado no forma parte del runtime desplegado.
