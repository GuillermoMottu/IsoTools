# Entrega al líder para cerrar el runbook

Fecha: 20 de octubre de 2026. Este archivo no contiene secretos y no se envió automáticamente a otra persona.

Actualización del 29 de octubre: la [validación de desarrollo CPA/TPP](DESARROLLO_CPA_TPP.md) contiene los casos locales y responsables vigentes. Solo desarrolladores y líder crean o validan en esta etapa. Las referencias posteriores a callbacks rechazadas y a aceptación empresarial pertenecen a la revisión histórica del día 20; no son bloqueos actuales para desarrollar.

Actualización: este documento conserva la evidencia histórica del día 20. El cierre y los pendientes vigentes de nuestras dos tools están en [Ensayo de solo lectura CPA/TPP](ENSAYO_CPA_TPP_SOLO_LECTURA.md). Login humano, callbacks, retorno al deep link y logout ya fueron comprobados en ambas tools. La cuenta de prueba autentica, pero recibe roles reconocidos vacíos y no puede consultar registros; queda pendiente asignar/emitir los roles correctos y comprobar el acceso autorizado. El PR preventivo #2 ya está integrado.

Nuestras tools ya tienen SSO obligatorio, secretos propios, consumidor habilitado y volumen persistente. Los deployments consultados por CI están en SUCCESS. Faltan las acciones y pruebas de cierre siguientes.

## Logto

Proveedor observado: `https://pfwk8f.logto.app`. Ambas tools están usando el Client ID público `7ms3ixe2j7nb4d98s3w98`. Confirmar si esa aplicación compartida es la correcta o si cada tool debe usar otra. No hace falta volver a crear SESSION_SECRET.

| Tool | Callback productiva que hoy se rechaza | Callback de desarrollo propuesta |
| --- | --- | --- |
| compare_planned_vs_actual | `https://cpa.orcalabs.mx/auth/callback` | `http://localhost:8106/auth/callback` |
| track_project_progress | `https://tpp.orcalabs.mx/auth/callback` | `http://localhost:8107/auth/callback` |

Los puertos de desarrollo son una propuesta explícita para ejecutar ambas tools por separado: compare corresponde al localPort 8106 del registro local y para track se propone PORT=8107. Si el equipo utiliza otros puertos, deben cambiar juntos PORT, OIDC_REDIRECT_URI y la URI registrada. El callback local va al backend que sirve la tool, no al puerto separado del servidor Vite.

El error de ambas URIs productivas es HTTP 400 `oidc.invalid_redirect_uri`, antes de pedir usuario o contraseña. Registrar las URIs exactas en la aplicación correcta. Nunca sustituirlas por una callback de otra tool para eludir el rechazo.

El logout desplegado envía `post_logout_redirect_uri=https://api-events.orcalabs.mx` sin barra final. El ejemplo del documento usa `https://api-events.orcalabs.mx/`. Confirmar y registrar la URI exacta acordada; la coincidencia de origen no acredita que Logto acepte la cadena concreta. No se cambió esa variable durante esta revisión.

Confirmar cuentas de prueba con `operations.manager`, `platform.auditor` y sin roles. El scope `roles` ya se solicita. Después nos corresponde comprobar auth/me, retorno al deep link, permisos, logout y Network en una sesión real. No se necesitan contraseñas o tokens dentro del repositorio ni pegados en este informe.

## Registro central

El registro publicado todavía muestra owner `pendiente de asignar` y requiredRoles solo `operations.manager`. Las entradas locales incluyen responsable y acceso de auditor. Propuesta para confirmar y aplicar en el registro central de plataforma:

```json
[
  {
    "toolId": "compare_planned_vs_actual",
    "kind": "federated",
    "status": "live",
    "subdomain": "cpa",
    "owner": "Guillermo Mottu",
    "isoClause": "9.1.1",
    "requiredRoles": ["operations.manager", "platform.auditor"]
  },
  {
    "toolId": "track_project_progress",
    "kind": "federated",
    "status": "live",
    "subdomain": "tpp",
    "owner": "Guillermo Mottu",
    "isoClause": "6.2",
    "requiredRoles": ["operations.manager", "platform.auditor"]
  }
]
```

No se modificó el core ni se hizo push a upstream. Estos roles deben coincidir con la matriz que confirme plataforma.

## Ensayos finales en los servicios

La prueba nueva `node scripts/test_runbook_runtime.js` ya pasó para ambas tools con procesos Node 22 Linux y un core HTTP local: malformed → descarte → siguiente entrada válida, core inaccesible → health 200 → backoff 10/20 segundos, restauración y reinicios con cursor y UUID conservados.

Para certificar literalmente los puntos 11.1 y 11.2 en Railway:

1. Acordar la ventana del ensayo y conservar una referencia del estado y cursor de cada tool.
2. Publicar únicamente entradas QA identificables, con module.id=qa_runbook y metadata.test=true, del tipo que consume cada tool pero con data incompleta. Comprobar descarte, health 200 y que el cursor no se bloquee. No se han publicado entradas malformadas nuevas durante esta revisión.
3. Para 11.2 no se necesita apagar el core: se cambia temporalmente la URL de conexión de la tool, conservando su volumen y credenciales. Definir de antemano la restauración de la URL canónica `https://api-events.orcalabs.mx/api/v1`, incluso si el ensayo falla. El workflow normal de despliegue rechaza una URL inválida; no se eliminaron esas comprobaciones para forzar la prueba.
4. Comprobar health 200 durante la pérdida de conexión, reintentos crecientes y recuperación desde el cursor anterior después de restaurar. Readiness puede informar 503 durante esa pérdida; una suscripción simplemente vacía debe mantener 200.
5. Cerrar con una sola salida por entrada calculable, ningún pendiente de publicación y evidencia del entorno desplegado.

Nosotros podemos verificar resultados y completar la checklist con los accesos de CI disponibles. No se requiere que el usuario entregue una cuenta personal de Railway.

## Alcance de datos empresariales

El runbook permite eventos ERP simulados; sus pruebas técnicas no deben quedar bloqueadas esperando la planta. La meta comercial aprobada, el cierre ERP real y el proyecto real se conservan como aceptación empresarial posterior, separada del cumplimiento de la QA simulada.
