# CPA y TPP: validación de desarrollo

Fecha: 29 de octubre de 2026. Responsables: desarrolladores de las tools y líder del proyecto. La validación de desarrollo no requiere aprobación de usuarios de negocio ni esperar a que se encienda Microsip.

Actualización del 30: [TPP integrado y desplegado, R2 e inventario actualizado](RESULTADO_CONTINUACION_2026-10-30.md). La solución por projectId ya se comprobó en el servicio real con un proyecto QA conservado; no queda pendiente su integración/despliegue. El acceso humano con roles sigue pendiente de Carlos/líder.

Estado posterior al aplicar los instructivos: [cierre y acciones concretas](CIERRE_PENDIENTES_INSTRUCTIVOS_2026-10-29.md). El diagnóstico de configuración SSO y el GET central ya se verificaron remotamente; la resolución TPP por projectId está implementada y probada en el PR 3 del fork. El parche de metadatos del registro central está preparado para el líder.

Revisión posterior de los instructivos originales: [pendientes frente a las guías](REVISION_INSTRUCCIONES_PENDIENTES_CPA_TPP.md). Corrige la atribución del contexto TPP al productor: los ocho campos son nuestro contrato extendido, todavía pendiente de alinear con el contrato original que recibe projectId. También identifica el registro central incompleto y la verificación de claim/mapeo aún no documentada.

## Entregable propio

El paquete [cpa_tpp_desarrollo.json](../scripts/fixtures/cpa_tpp_desarrollo.json) define datos sintéticos reproducibles: organización `QA-ORG-CPA-TPP`, planta `QA-PLANT-CPA-TPP`, metas y proyectos con prefijo QA. Son identificadores locales propuestos por nosotros; no se registró una organización en el core ni se cambió la configuración desplegada. El líder valida su uso compartido cuando se integren con los demás desarrolladores.

`sales_context` aporta el cuerpo del cierre; cada caso CPA agrega `period`, `periodStart` y `periodEnd` con su `date`, y aplica sus cambios de `data`. `project_context` más el `data` de cada caso TPP aporta el cuerpo del reporte KPI. Estos cuerpos sirven de ejemplos para los desarrolladores productores. El caso TPP incompleto omite intencionalmente todo el contexto.

El ejecutor arma eventos IES con `module.id=qa_runbook`, `metadata.test=true`, identificadores `qa-dev-*` y correlaciones `qa-runbook-development-*`. Usa el consumidor real de CPA/TPP con un bus sustituido en memoria y estado temporal en disco. No implementa ni ejecuta el conector ERP, `generate_kpis` o `automate_followups` para fabricar una integración completa.

| Caso | Resultado comprobado |
| --- | --- |
| CPA-SIN-META | Recibe 10000 MXN; publica sin_meta, planned=null y conserva actual=10000. |
| CPA-META-150 | La configuración propia define 15000 frente a actual=10000; publica critical con desviación adversa 33.33 %. El ERP de prueba no proporciona la meta. |
| CPA-AL-DIA | Meta y actual de 10000; publica on_track. |
| CPA-INVALIDO | Actual no numérico; descarta la entrada y avanza el cursor sin publicar. |
| TPP-RIESGO | Plan 40 %, avance 34 %; publica PROJECT_AT_RISK con status=at_risk. |
| TPP-ATRASADO | Plan 40 %, avance 15 %; publica PROJECT_AT_RISK con status=delayed. |
| TPP-AL-DIA | Plan y avance 40 %; conserva la evaluación sin publicar alerta. |
| TPP-INCOMPLETO | Detecta los ocho campos obligatorios ausentes; not_calculable, sin alerta y sin bloquear el cursor. |

En ambos consumidores se comprobó la conservación de registros y evaluaciones al recrearlos desde el estado persistido, sin publicaciones adicionales. Las salidas válidas mantienen causation_id, correlation_id, planta y la marca de prueba. El importe devuelto de 1000 MXN no se vuelve a descontar de actual. La meta 150 % existe únicamente en la configuración del fixture.

## Ejecución

Desde la raíz del repositorio, con Node y las dependencias existentes:

```powershell
npm.cmd run test:tools:desarrollo
node scripts/test_tool_service.js
```

El primer comando no usa red ni secretos; imprime un informe JSON y devuelve un código distinto de cero ante cualquier aserción fallida. El segundo abre servidores HTTP en localhost y usa sesiones firmadas con secretos sintéticos para probar autorización local; no inicia sesión en Logto. No cargar archivos privados de entorno al ejecutar estas pruebas.

Las pruebas del servicio ahora comprueban para CPA y TPP: anónimo 401; usuario sin roles 403 para lectura y evaluación; auditor lectura 200 y evaluación 403; operador evaluación válida 200. Un rol enviado en el cuerpo no cambia permisos y el actor de auditoría proviene de la sesión. También se conservan los casos de cookie alterada y retorno a deep links.

## Evidencia obtenida

En esta revisión pasaron los ocho casos del paquete y las pruebas HTTP locales de ambas tools en Node v24.22.1 y v22.23.3. La comprobación Node 22 usó una imagen Docker local sin red exterior, con el repositorio de solo lectura y archivos temporales en /tmp; la prueba HTTP usó NODE_ENV=test. También pasaron las regresiones `test_runbook_consumer.js`, `test_readonly_replay.js` y `test_kpi_project_contract.js` en Node 24. El [informe de los ocho casos en Node 24](evidencias/cpa_tpp_desarrollo_2026-10-29.json) incluye el SHA-256 del fixture para identificar exactamente los datos usados.

La primera ejecución HTTP fue bloqueada por EACCES del sandbox a 127.0.0.1; la ejecución con acceso local autorizado pasó. ESLint no tiene configuración en este checkout; la revisión de los dos scripts pasó suministrando explícitamente eslint-config-standard y el parser de módulos ES2022, sin crear configuración global. No se añadieron dependencias ni se cambiaron contratos, reglas o lógica de las tools.

Se añadió `test_tools_development.js` a las comprobaciones previas de los dos jobs de despliegue existentes, y se comprobó el YAML localmente. No se lanzó un workflow, no se hizo push y no se desplegaron cambios durante esta revisión.

## Responsables y acciones restantes

### Contraste con la información adicional del líder

Se consultaron en GitHub el [README de integración](https://github.com/carcamfer/IsoTools/blob/feature/filter/README.md), el [catálogo de tools](https://github.com/carcamfer/IsoTools/blob/feature/filter/src/data/agents/tools.json) y el [README de SSO](https://github.com/carcamfer/IsoTools/blob/feature/filter/plantillas/integracion/sso/README.md) de la rama feature/filter. El blob leído del README de SSO fue `38888a66b6a1884579e1e13e621f262b07c16710`. Las capturas aportadas por el usuario confirman el contrato de CPA y el procedimiento de entrega de la key al administrador; no se almacenó su valor en esta documentación.

- El ciclo normal GET → cálculo → POST → cursor ya existe en `src/services/toolConsumer.js`. Un POST fallido conserva la salida pendiente y su event_id; no se adelanta el cursor más allá de esa entrada. Al terminar el lote se guarda next_seq de la suscripción, no el seq devuelto por el POST.
- El catálogo consultado confirma `compare_planned_vs_actual`: ERP_SALES_PERIOD_CLOSED → PRODUCTION_VARIANCE_DETECTED, y `track_project_progress`: KPI_REPORT_GENERATED → PROJECT_AT_RISK. La captura del líder muestra CPA; el catálogo también confirma TPP.
- `compare-track` es el label comunicado para la credencial. Las rutas de suscripción siguen usando los dos IDs anteriores; no se sustituye el ID por ese label. El mensaje de entrega no demuestra por sí solo que el administrador haya registrado la key ni acredita sus scopes. La clave compartida no se probó ni se instaló durante este contraste.
- Para el consumidor normal se necesitan events:read y events:write. La key exclusiva events:read sigue siendo un pendiente específico del ensayo de solo lectura: el DOCX v1.3 la exige y prohíbe publicar las salidas recalculadas en el bus central. El mensaje del ciclo normal no cancela esa condición del ensayo.
- Las tools federadas consultan por poll. El README distingue ese funcionamiento del auto-disparo de handlers nativos. Nuestro POST hace disponible el evento para el siguiente consumidor; su desarrollador mantiene activo su propio poll.
- El README de SSO admite probar permisos con sesiones sintéticas locales y separa credencial de servicio y sesión humana. Nuestras pruebas locales ya cubren esa parte. La API key del bus no asigna roles Logto: sigue pendiente verificar la asignación/emisión y repetir el acceso humano autorizado.

Este contraste no requiere cambios en la lógica ni volver a copiar la plantilla. Los descartes por datos inválidos y la ausencia de alerta TPP para on_track son resultados deliberados, ya cubiertos por las pruebas de desarrollo.

| Actividad | Crea o ejecuta | Valida | Estado |
| --- | --- | --- | --- |
| Organización, planta, metas y proyectos locales de prueba | Nosotros, desarrollo CPA/TPP | Nosotros; líder para acordar la convención compartida | Preparados y probados. |
| Cálculo, alertas, datos incompletos, persistencia y trazabilidad de nuestras salidas | Nosotros | Nosotros; líder acepta el resultado del checklist | Ocho casos aprobados localmente. |
| Matriz de permisos de nuestras dos tools | Nosotros | Nosotros | Aprobada localmente con sesiones sintéticas. |
| Asignar roles y emitirlos para las cuentas Logto | Líder o desarrollador con acceso de administración de Logto | Ese desarrollador comprueba configuración; nosotros repetimos acceso real | Pendiente; última sesión humana comprobada llegó con roles reconocidos vacíos. |
| Emitir y guardar ISOTOOLS_READONLY_API_KEY con events:read exclusivamente | Líder o desarrollador administrador del core/Actions | Administrador confirma scopes; nosotros comprobamos uso | Pendiente. El replay ya admite ese secreto. |
| Generar cierres de ventas de desarrollo y guardarlos en el bus de ensayo | Desarrollador del conector ERP | Nosotros validamos el consumo CPA; líder coordina la integración | Fixture de entrada listo; publicación y ensayo compartido pendientes. |
| Acordar cómo TPP obtiene el contexto del proyecto y generar la entrada compatible | Nosotros + desarrollador de generate_kpis | Líder valida la interfaz; nosotros probamos TPP | Contrato extendido y ejemplos locales listos; alineación e integración en el original pendientes. |
| Arista hacia automate_followups y filtro del receptor | Desarrollador de automate_followups y desarrollador del core, según su integración | Ellos prueban el receptor; líder revisa la cadena; nosotros aportamos PROJECT_AT_RISK | Fuera de nuestra implementación. |
| Repetir replay con las entradas guardadas y revisar PV-7.1, PV-7.2 y nuestra parte de PV-7.4 | Nosotros, una vez disponibles las entradas | Líder acepta el checklist de desarrollo | Pendiente del ensayo compartido. |

Para el ensayo compartido se deben conservar las marcas de prueba y acordar el entorno y los identificadores con el líder. No se necesita una organización empresarial definitiva para continuar desarrollando. La identidad real que el usuario dejó pendiente permanece sin configurar.

La checklist original exige eventos guardados y una cadena auditable. Estos fixtures cierran la comprobación local de comportamiento; no sustituyen ese requisito ni certifican el reporte consolidado de generate_kpis (PV-7.3), la arista del core o el filtrado de automate_followups (PV-7.5). El [ensayo de solo lectura](ENSAYO_CPA_TPP_SOLO_LECTURA.md) conserva la evidencia histórica del entorno desplegado.
