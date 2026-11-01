# Prueba de aislamiento CPA/TPP frente a Logto

Fecha local: 31 de octubre de 2026. Alcance solicitado: probar lo que podemos hacer con nuestras tools para investigar el bloqueo. No se detiene el core, el ERP, bases de datos ni servicios de otros equipos.

## Procedimiento

El modo isolate de deploy-tools.yml exige confirm_pause=true y comparte el bloqueo de concurrencia con el despliegue normal. Los otros jobs de despliegue, QA y replay no se ejecutan en este modo.

Antes de cualquier parada se verifican las dos identidades, salud/disponibilidad, volumen persistente, estado sin publicacion pendiente, revision servida, IDs de despliegue exactos y canRedeploy=true. El plan contiene IDs y hashes/cantidades; no claves o registros empresariales. Se sube como evidencia de recuperacion antes de detener los procesos.

Se consulta una vez el endpoint publico de autorizacion desde el ejecutor de Actions, sin cookies y sin seguir redirecciones. Si no devuelve 429, se omite la pausa. Si devuelve 429, se detienen exclusivamente los despliegues identificados mediante deploymentStop, se confirma que ya no estan en SUCCESS ni sirven health, se espera un minuto y se repite una sola consulta al proveedor.

Se restauran los despliegues originales mediante deploymentRedeploy. No se cambia configuracion, codigo servido, credenciales, volumen, estado, registro central ni cursor. Se exige que el nuevo despliegue de recuperacion alcance SUCCESS y que health/ready y la revision esperada respondan; no basta una respuesta del proceso anterior durante su drenaje.

El bloque finally intenta restaurar ambos objetivos tambien ante fallos parciales. El workflow tiene ademas un paso always() de recuperacion y conserva el plan antes y despues. Si un ejecutor se pierde por completo, el plan inicial permite identificar los despliegues a recuperar; no es una garantia frente a una indisponibilidad del control de Railway.

Pruebas locales en Node 24 y Node 22 sin red exterior: no pausa sin 429, journal anterior a la mutacion, recuperacion tras fallo de segunda parada, comprobacion o consulta, y fallo explicito si la restauracion no termina.

## Limites de interpretacion

La prueba compara llamadas sin cookies desde un mismo ejecutor de Actions. Su origen de red puede diferir del navegador del usuario; no se equipara una respuesta del ejecutor con una sesion humana valida. La pestaña anterior mostraba texto plano de error; no se ha confirmado su cierre mediante el control disponible y se solicita no recargar durante la ventana.

Un 429 con ambas tools efectivamente detenidas demostraria que sus procesos activos no son necesarios para que persista el bloqueo en ese momento. No excluiria participacion anterior ni trafico de otros clientes. Un minuto no garantiza la expiracion de todos los limites o cuotas de Logto. Si el endpoint se recupera, la correlacion temporal no identifica por si sola la causa.

## Estado

Preparado y probado localmente; aun no ejecutado contra Railway al crear este documento.
