# Pendientes CPA/TPP frente a las instrucciones originales

Revisión del 29 de octubre de 2026. Alcance: localizar instrucciones que permitan resolver pendientes de nuestras tools y distinguir pasos incompletos de dependencias administrativas. No se cambió lógica, configuración remota, roles, claves ni contratos compartidos durante esta revisión.

La revisión ya dio lugar a acciones: ver [aplicación y cierre de pendientes](CIERRE_PENDIENTES_INSTRUCTIVOS_2026-10-29.md). Resume la inspección efectiva de roles, la implementación TPP por projectId y el parche de datos del registro central. El análisis que sigue conserva las diferencias detectadas antes de esas acciones.

La comprobación posterior de los nueve puntos y cinco fallas comunes del README SSO está en [Verificación del checklist SSO CPA/TPP](VERIFICACION_CHECKLIST_SSO_CPA_TPP.md), con GET actuales, pruebas OIDC locales y límites de la evidencia humana previa.

## Fuentes y ramas

Se consultó el repositorio original carcamfer/IsoTools. main y feature/filter apuntaban a `4a1781ddd855bc256ed5b849aac4f953c03fbea4`; también se revisaron los índices de `feat/erp-eventos-inventario-ventas` y `comm/calculate_control_charts__detect_out_of_control_signals`. Los README relevantes de raíz e integración tienen los mismos blobs en las cuatro ramas. Hay diferencias en otros archivos; no se declara que todas las ramas sean idénticas.

Se leyeron las guías de SSO, integración, despliegue, Docker, API, ERP, simulación y pruebas, además del catálogo, brief, registro central y notas de comunicación aplicables. El inventario público descargado para la revisión conserva los SHA de las fuentes. No se consultó una consola administrativa ni se ejecutaron acciones de despliegue o publicación.

## 1. Contrato TPP: diferencia que debemos cerrar nosotros

El [brief original](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/src/data/agents/tools-dev-spec.json) describe una entrada `projectId` y la consulta de entregables, hitos y presupuesto para obtener el avance. El [catálogo original](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/src/data/agents/tools.json) exige solo `projectId` en inputSchema de TPP. Nuestra evaluación requiere ocho campos explícitos; esa ampliación figura en nuestra nota local `generate_kpis__track_project_progress.md` y nuestras pruebas la cubren.

La [nota original de comunicación](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/cerebro/comunicaciones/generate_kpis__track_project_progress.md) sigue mostrando data vacío como forma pendiente de implementar. Prescribe acordar el payload, actualizar su bitácora y presentar el cambio de datos/contrato a feature/filter. Por tanto, la ausencia de esos ocho campos no prueba por sí sola incumplimiento del desarrollador productor respecto del contrato original.

**Acción propia:** nosotros y el desarrollador de generate_kpis debemos cerrar con el líder si TPP recibe el contexto completo o resuelve projectId mediante una fuente de proyectos. Después se documenta e integra el contrato compartido y su prueba. La guía no identifica una API/BD de proyectos utilizable por nuestra tool, y el handler original devuelve porcentajes fijos: no constituye una implementación de esa consulta. No se debe sustituir el cálculo por esos valores ni inventar el contexto para aparentar cumplimiento.

Esto corrige la clasificación anterior «el productor debe aportar los ocho campos»: son el contrato extendido de nuestra implementación, pendiente de alineación entre equipos. Los fixtures existentes permiten validar ese contrato local mientras se acuerda la integración.

También hay diferencias entre el catálogo original y nuestra salida CPA: por ejemplo, el original define details como array y no incorpora sin_meta al enum, aunque la documentación ERP sí describe sin_meta. El catálogo de nuestro fork ya está alineado con nuestra implementación. La aceptación compartida debe revisar ese contrato de salida y no asumir que la validación del sobre IES acredita compatibilidad del data con todos los consumidores.

## 2. Roles: procedimiento conocido, comprobación incompleta

La [guía de integración](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/plantillas/integracion/README.md) y el [README SSO, secciones 5–8](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/plantillas/integracion/sso/README.md) explican el mapeo y las pruebas locales. Nuestra implementación solicita roles por defecto, admite configurar el nombre del claim y mapea operations.manager → OperationsManager y platform.auditor → Auditor. Esos IDs existen en el vocabulario original. Las pruebas locales de ambas tools ya pasaron.

La inspección remota guardada de la ejecución 40978055458 acreditó roles_scope_configured=true en ambas tools. No documentó los valores efectivos de OIDC_ROLES_CLAIM y ROLE_MAP. La última prueba humana guardada observó roles reconocidos vacíos, no los claims crudos.

**Acción propia antes de un nuevo diagnóstico definitivo:** verificar las opciones efectivas de claim y mapeo sin divulgar tokens o secretos. **Acción del desarrollador administrador de Logto/líder:** revisar asignación y emisión del rol para las cuentas de desarrollo y repetir con nosotros una sesión nueva. roles=[] no permite distinguir por sí solo entre rol no asignado, claim diferente/no emitido o rol descartado por el mapeo.

La presencia de platform.admin o la visibilidad en el dashboard no debe convertirse automáticamente en autoridad de operación en CPA/TPP. El registro central y los roles de sesión son configuraciones distintas.

## 3. Registro central: paso expresamente pedido y todavía incompleto

La [integración, paso 5](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/plantillas/integracion/README.md#L57-L61) exige registrar subdomain, owner, isoClause y requiredRoles en deployments.json del core.

En el [registro original consultado](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/src/data/platform/deployments.json), CPA y TPP ya están como federated/live, con subdominios y cláusulas ISO; ambas conservan owner="pendiente de asignar" y carecen de requiredRoles explícitos. El servicio del core puede resolver roles por categoría: la ausencia del campo no significa acceso abierto ni registro inexistente.

Nuestro fork contiene owner y roles explícitos. **El paso incompleto es llevar la propuesta de datos al registro original**, con revisión del líder/administrador del core. La propuesta ya estaba preparada en la entrega histórica; no debe confundirse con un cambio ya aplicado en upstream. Completarla no asigna roles a las cuentas Logto ni resuelve por sí solo roles=[].

## 4. Key de lectura: sí existe un instructivo concreto

El [Paso 2, sección 2.4](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/pasos/02-api-central.md) explica el bootstrap en Railway y la alternativa de generación con createApiKey.js. El script original admite --scopes=events:read. La ejecución debe hacerse por el desarrollador administrador, conectado a la base del core; ejecutarlo en nuestra laptop sin esa configuración no registra una key en la plataforma central.

**Acción del administrador:** emitir una credencial de ensayo limitada a events:read y entregarla por el canal de secretos correspondiente. **Acción propia:** instalarla en ISOTOOLS_READONLY_API_KEY de Actions y verificar el replay. El consumidor normal conserva su credencial de lectura/escritura. El DOCX v1.3 exige una key exclusivamente de lectura para el ensayo, de modo que la clave operativa entregada anteriormente no acredita ese requisito.

## 5. Desarrollo sin ERP: no hay que esperar datos empresariales

La [guía ERP, sección 2](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/docs/ERP_CENTRAL.md#L58-L85) ofrece un gateway MOCK. El [README SSO, sección 5](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/plantillas/integracion/sso/README.md) permite probar permisos localmente sin un IdP real.

Nuestro paquete de ocho fixtures y las pruebas locales de permisos ya resuelven la validación aislada de nuestras tools. Un ensayo compartido con el gateway/conector simulado corresponde coordinarlo con su desarrollador y el líder. No exige involucrar usuarios de negocio ni autoriza a encender un conector mock contra el bus compartido sin acordarlo. La comparación con eventos guardados que pide el nuevo checklist sigue siendo otra evidencia.

La [documentación ERP](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/docs/ERP_CENTRAL.md#L471-L476) y la nota central de CPA también atribuyen la meta al servicio, no al ERP. Nuestra configuración y ensayo del 150 % ya cumplen ese reparto de responsabilidad.

## 6. Límites y documentación contradictoria

- Los README remiten a docs/PLATAFORMA-SSO.md, pero ese archivo no aparece en los árboles de las cuatro ramas consultadas. El contrato completo entre equipos debe solicitarse al líder; no se puede dar por leído ni cumplido a partir de un enlace inexistente.
- GUIA_TOOLS.md conserva descripciones antiguas sobre no usar pull, y el checklist de merge de tools nativas conserva afirmaciones sobre inexistencia del bus. No deben aplicarse literalmente a nuestras tools federadas. La integración y el README principal describen el consumo por poll y la delegación actuales.
- La guía de despliegue pide un proyecto/token por tool y callbacks locales además de las públicas. La inspección guardada confirma runtime/SSO/volúmenes, pero no certifica aquí separación de proyectos ni el alta de callbacks localhost. Son verificaciones pendientes de documentar con el líder, no fallos observados del servicio ni motivo para migrar infraestructura de inmediato.
- La [bitácora original TPP → followups](https://github.com/carcamfer/IsoTools/blob/4a1781ddd855bc256ed5b849aac4f953c03fbea4/cerebro/comunicaciones/track_project_progress__automate_followups.md#L40-L42) ya explica que el receptor federado filtra status=at_risk. Eso sigue siendo responsabilidad de ese desarrollador; nosotros publicamos el status y contexto acordados.

## Orden de cierre

1. Nosotros: completar la revisión efectiva de claim/mapeo y preparar la actualización de datos del registro central.
2. Nosotros + desarrollador de generate_kpis + líder: acordar y documentar la interfaz de proyecto TPP y las diferencias de contrato CPA que afecten consumidores.
3. Desarrollador administrador/líder: aplicar registro, configuración de roles y credencial de lectura según las guías.
4. Nosotros: repetir sesión humana y ensayo con entradas guardadas; líder valida el cierre de desarrollo con las evidencias de cada nivel.
