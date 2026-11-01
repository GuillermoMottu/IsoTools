# Prueba de aislamiento CPA/TPP frente a Logto

Fecha local: 31 de octubre de 2026. Alcance solicitado: probar lo que podemos hacer con nuestras tools para investigar el bloqueo. No se detiene el core, el ERP, bases de datos ni servicios de otros equipos.

## Procedimiento

El modo isolate de deploy-tools.yml exige confirm_pause=true y comparte el bloqueo de concurrencia con el despliegue normal. Los otros jobs de despliegue, QA y replay no se ejecutan en este modo.

Antes de cualquier parada se verifican las dos identidades, salud/disponibilidad, volumen persistente, estado sin publicacion pendiente, revision servida, IDs de despliegue exactos y canRedeploy=true. El plan contiene IDs y hashes/cantidades; no claves o registros empresariales. Se sube como evidencia de recuperacion antes de detener los procesos.

Se consulta una vez el endpoint publico de autorizacion desde el ejecutor de Actions, sin cookies y sin seguir redirecciones. Si no devuelve 429, se omite la pausa. Si devuelve 429, se detienen exclusivamente los despliegues identificados mediante deploymentStop. Se exige el acuse true del control y dos observaciones consecutivas sin health disponible en ambos servicios, se espera un minuto y se repite una sola consulta al proveedor. El campo historico status del despliegue no se usa como prueba unica de que su proceso esta detenido.

Se restauran los despliegues originales mediante deploymentRedeploy. No se cambia configuracion, codigo servido, credenciales, volumen, estado, registro central ni cursor. Se exige que el nuevo despliegue de recuperacion alcance SUCCESS y que health/ready y la revision esperada respondan; no basta una respuesta del proceso anterior durante su drenaje.

El bloque finally intenta restaurar ambos objetivos tambien ante fallos parciales. El workflow tiene ademas un paso always() de recuperacion y conserva el plan antes y despues. Si un ejecutor se pierde por completo, el plan inicial permite identificar los despliegues a recuperar; no es una garantia frente a una indisponibilidad del control de Railway.

Pruebas locales en Node 24 y Node 22 sin red exterior: no pausa sin 429, journal anterior a la mutacion, recuperacion tras fallo de segunda parada, comprobacion o consulta, y fallo explicito si la restauracion no termina.

## Limites de interpretacion

La prueba compara llamadas sin cookies desde un mismo ejecutor de Actions. Su origen de red puede diferir del navegador del usuario; no se equipara una respuesta del ejecutor con una sesion humana valida. La pestaña anterior mostraba texto plano de error; no se ha confirmado su cierre mediante el control disponible y se solicita no recargar durante la ventana.

Un 429 con ambas tools efectivamente detenidas demostraria que sus procesos activos no son necesarios para que persista el bloqueo en ese momento. No excluiria participacion anterior ni trafico de otros clientes. Un minuto no garantiza la expiracion de todos los limites o cuotas de Logto. Si el endpoint se recupera, la correlacion temporal no identifica por si sola la causa.

## Estado

La primera ejecucion 41273905560 no completo la comprobacion formal de parada y activo la restauracion. Ambas tools quedaron restauradas desde los mismos despliegues, con health/ready 200 y hashes completos de estado identicos. La consulta local del periodo de interrupcion devolvio 429. No se declara esa primera ejecucion como ensayo completo.

La repeticion [41274254031](https://github.com/GuillermoMottu/IsoTools/actions/runs/41274254031) termino success. Ambas paradas recibieron acuse true y cada servicio tuvo dos comprobaciones de health sin respuesta. La pausa se confirmo a las 04:45:19 UTC del 1 de noviembre (22:45:19 del 31 de octubre, Mexico). Tras 60 segundos sin consultas al proveedor por este ensayo, Logto volvio a responder 429 Too Many Requests a las 04:46:19 UTC, sin Retry-After. La consulta inicial del mismo ejecutor tambien habia respondido 429. Los identificadores CF-Ray quedaron en la evidencia; no identifican por si solos al responsable del limite.

La recuperacion creo los despliegues df735fc7-cc00-47bb-b04b-a26e3c0f30bf (CPA) y 66876529-3018-49f6-bd2b-5eb2dd05e5f5 (TPP), ambos SUCCESS. Se conserva la revision servida 2862cefc37ba75f258268e595f695bb64a09db99. El paso always() termino sin recuperaciones pendientes.

Una verificacion independiente a las 04:47:31 UTC confirmo health/ready 200 y modo SSO en ambas tools. Las APIs y /auth/me rechazan peticiones anonimas con 401. Los hashes completos coinciden exactamente antes y despues: CPA mantiene cursor 7679, dos registros y cero rechazos; TPP cursor 7684, tres registros y cuatro rechazos historicos. Ninguna tiene publicacion pendiente. La consulta local adicional posterior a la recuperacion omitio consultar Logto al encontrar ambas tools disponibles.

Evidencia: [resultado del ejecutor](evidencias/aislamiento_41274254031_resultado.json), [verificacion independiente](evidencias/aislamiento_41274254031_verificacion.json) y [comprobacion local adicional](evidencias/aislamiento_41274254031_local.json).

La [inspeccion final de Railway 41274445012](https://github.com/GuillermoMottu/IsoTools/actions/runs/41274445012) tambien termino success en ambos servicios, sin despliegue. Confirmo consumidores activos, claves centrales aceptadas con HTTP 200, volumen persistente, SSO configurado, assets inspeccionados y cero eventos posteriores al cursor en ambas suscripciones. Los logs consultados despues del reinicio muestran polling; las muestras de autenticacion estan vacias. Esta ventana acotada no demuestra ausencia historica de intentos. [Informe sanitizado](evidencias/aislamiento_41274445012_inspeccion.json).

Conclusion acotada: el bloqueo persistio durante la parada de CPA y TPP. No se sostiene que sus procesos activos sean necesarios para mantener ese 429. El ensayo no identifica la causa, no descarta trafico anterior, otros clientes ni limites de mayor duracion, y no valida la sesion humana con operations.manager. Ambas tools quedan operativas.
