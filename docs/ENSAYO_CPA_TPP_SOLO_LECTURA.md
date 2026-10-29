# Ensayo de CPA y TPP con eventos guardados

Alcance: `compare_planned_vs_actual` y `track_project_progress`, para el escenario 7 de PR-ORCA-ENS-001 v1.3. Las otras tools conservan sus responsables.

## Estado del 29 de octubre de 2026

La [inspección 40831459970](https://github.com/GuillermoMottu/IsoTools/actions/runs/40831459970) confirmó que Railway conservaba key central válida, variables SSO completas, consumidores habilitados y volúmenes persistentes. La imagen servida no correspondía al servidor propio de las tools.

El [despliegue correctivo 40831691763](https://github.com/GuillermoMottu/IsoTools/actions/runs/40831691763), desde `5dd8fb199636c51053a10055da508b4a659cf400`, pasó para ambas tools. Las comprobaciones posteriores observaron:

| Comprobación | CPA | TPP |
| --- | --- | --- |
| Health con identidad, SSO y SHA esperado | 200 | 200 |
| Readiness JSON | 200 ready | 200 ready |
| Sesión anónima | 401, mode=sso | 401, mode=sso |
| Estado con key propia del servicio | 200 | 200 |
| Cursor conservado | 7679 | 7684 |
| Registros conservados | 2 | 3 |
| Publicación pendiente | No | No |
| Inicio de login y PKCE S256 | 302 hacia Logto | 302 hacia Logto |
| Respuesta inicial del proveedor | 303, sin invalid_redirect_uri | 303, sin invalid_redirect_uri |

Esto no acredita una sesión humana completa ni roles/logout reales. No se usaron contraseñas de usuarios ni se fabricaron cookies para probar producción. La key local rechazada anteriormente no se reemplazó ni se copió desde Railway: el replay usa la key ya guardada en Actions, sin imprimirla.

El identificador real de organización queda pendiente por indicación del usuario. No se utiliza `ORG-001` ni otra identidad de demostración para completar datos reales. No se configuraron metas en producción.

## Cómo ejecutar el replay

En el workflow **Deploy ORCA tools to Railway**, seleccionar la rama que contiene esta implementación y `mode=replay`, con `tool=all` o la tool concreta. Este modo no ejecuta los jobs de despliegue ni el job `validate` que publica entradas QA.

El script `scripts/replay_tools_readonly.js` solo hace GET de suscripciones y cadenas. Lee desde `since_seq=0` con paginación, usando variables en memoria; no importa `createToolConsumer`, no abre archivos de estado ni llama a su tick. Selecciona la última entrada sin marcas de prueba de cada tool e identifica su procedencia ERP cuando está presente en la cadena. Una entrada sin marca no se declara automáticamente de negocio real.

El informe registra cantidades, IDs, hash de entrada, versiones de cálculo/regla, campos faltantes y comparación de status. No imprime eventos crudos, importes de negocio, configuración o credenciales. Cuenta únicamente las salidas de la tool cuyo causation_id coincide con la entrada seleccionada; otra salida de la misma cadena no sustituye esa evidencia.

Para ejecución local con una key de lectura ya configurada:

```powershell
node scripts/replay_tools_readonly.js
```

Variables opcionales: `TOOL_SELECTED` (all o una de nuestras dos tools), `REPLAY_ORGANIZATION_ID` (solo cuando esté acordado), y `TOOL_REPLAY_CONFIG_FILE` (JSON privado con organization_id y sales_plans reales). En Actions, la organización opcional se toma de `ISOTOOLS_ORGANIZATION_ID`, variable del repositorio. No se crea ni rellena automáticamente.

El evaluador y el consumidor comparten las mismas funciones puras de adaptación y cálculo. No se alteraron contratos ni reglas de negocio para habilitar el replay.

## Qué significan los resultados

- **Baseline:** evaluación con el contexto suministrado. Un cierre válido sin meta conserva actual y devuelve sin_meta, igual que el consumidor.
- **Ensayo de meta 150 %:** para un cierre ERP se crea una meta exclusivamente en memoria. Falta de organización u otro contexto queda visible como not_calculable. Nunca se publica esa meta ni el resultado del ensayo.
- **TPP:** exige organization_id, project_id, project_name, as_of_date, planned_start_date, planned_end_date, planned_progress_percent y actual_progress_percent; acepta los alias camelCase que ya contempla el evaluador. Los hitos, presupuesto y destinos de seguimiento se validan cuando se suministran. No se reconstruye un proyecto con KPIs agregados ni valores fijos.
- **no_non_test_input:** la suscripción se leyó por completo, pero no contiene una entrada sin marcas de prueba que se pueda seleccionar. Debe documentarse el escenario como no ejecutable con entradas reales disponibles. No se convierte una QA en evidencia real.
- **requires_review:** faltan datos, no hay procedencia ERP comprobada, falta salida propia o hay duplicados/diferencia de status.
- **status_matches_requires_configuration_review:** coincidencia de status de una salida propia y procedencia ERP visible. No significa equivalencia completa: la versión, meta y configuración histórica siguen requiriendo revisión.
- Un error de autorización o paginación falla el job; no se interpreta como ausencia de entradas.

Un job exitoso acredita que la consulta terminó. No significa que CPA o TPP hayan aprobado el ensayo. El replay no certifica que la key de Actions tenga exclusivamente events:read; el propio programa limita sus operaciones a GET. La key limitada a lectura sigue siendo un requisito separado de la jornada de ensayo.

## Pendientes propios

1. Proporcionar la organización real y acordar la meta y contexto del ensayo cuando corresponda.
2. Disponer de entradas guardadas con la procedencia y el contexto requeridos; si faltan, registrar esa dependencia en el contrato sin implementar otra tool.
3. Completar login humano, roles, deep link y logout.
4. Revisar los resultados del replay y la configuración histórica antes de aprobar los PV de nuestras tools.

## Validación

`node scripts/test_readonly_replay.js` cubre GET exclusivamente, rechazo de redirects, paginación, exclusión de QA, causación exacta, salidas duplicadas, contexto faltante, ausencia de datos y errores 401. Las regresiones existentes del consumidor y de los contratos cubren que extraer los evaluadores compartidos conserva publicación, deduplicación y persistencia. Los datos de esos tests son fixtures y no evidencia de negocio.
