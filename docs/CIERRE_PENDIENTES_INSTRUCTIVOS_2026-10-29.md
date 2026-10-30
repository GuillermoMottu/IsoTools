# Aplicación de los instructivos a nuestros pendientes

Fecha local: 29 de octubre de 2026. Solo CPA/TPP. Desarrolladores y líder crean y validan en esta etapa.

## Diagnóstico remoto resuelto

Se publicó en nuestra rama del fork el diagnóstico sanitizado `59433c4` y se ejecutó [inspect 41007839950](https://github.com/GuillermoMottu/IsoTools/actions/runs/41007839950). Los pasos de preparación de variables, despliegue y publicación QA quedaron skipped; únicamente se leyeron servicios y configuración. El [informe guardado](evidencias/inspeccion_roles_41007839950.json) acredita, en ambas tools:

- GET al bus autenticado: 200. La clave operativa instalada funciona para lectura; no hace falta generar otra para resolver esa conexión.
- Scope roles solicitado, claim efectivo roles y ROLE_MAP por defecto. Los mapeos operations.manager → OperationsManager y platform.auditor → Auditor están activos. No se encontró una corrección pendiente de claim/mapeo en nuestra configuración.
- Sin fuga detectada en las entradas de bundle inspeccionadas al comparar claves efectivas de bus, cliente OIDC y sesión. Se cierra la falta de comparación actual de esos valores, dentro del alcance del inspector; no certifica todos los chunks/sourcemaps o archivos arbitrarios.
- Imagen servida conservada en 5dd8fb199636c51053a10055da508b4a659cf400 y deployment SUCCESS. No se alteraron consumidores, cursores o credenciales.

La última cuenta humana comprobada recibió roles reconocidos vacíos. Con la configuración de nuestras tools ya contrastada, falta que el desarrollador administrador/líder revise asignación y entrega de roles en Logto. No se ha observado el ID token crudo ni se ha repetido una sesión después de un cambio administrativo.

El usuario confirmó que Carlos o el líder administra Logto. Esa revisión no requiere nuevas credenciales personales del usuario ni otra modificación de nuestra política de permisos; se entrega a Carlos/líder con la configuración propia ya comprobada. No se envió un mensaje a terceros desde esta tarea.

## Diferencia de contrato TPP resuelta en una propuesta implementada

Rama propia: comm/generate_kpis__track_project_progress. Commit de implementación: dff646f. [PR borrador 3 dentro de nuestro fork](https://github.com/GuillermoMottu/IsoTools/pull/3), con destino a nuestra rama de tools, sin tocar main ni upstream. Se conserva en un checkout separado para no mezclar cambios locales y cumplir la regla de ramas por comunicación.

TPP ahora puede recibir solo projectId/project_id y resolver su contexto desde un registro explícito `projects` en TOOL_BUSINESS_CONFIG_FILE. La entrada completa anterior sigue funcionando; los campos explícitos prevalecen, los contextos faltantes siguen not_calculable y los proyectos de desarrollo propagan test=true. API, consumidor y replay comparten la resolución. No se cambió generate_kpis ni se inventó un proyecto a partir de KPIs agregados.

La API de desarrollo, consumidor y replay pasaron en Node 22 y 24 con un registro sintético. También pasaron las regresiones CPA/TPP/KPI, consumidor, replay, servicio HTTP y handshakes OIDC de ambas tools. La validación de plataforma pasó con un aviso previo de una tool ajena. Bitácoras y esquema de entrada se actualizaron en esa rama. No se agregaron tools ni reglas.

Todavía no está integrado en la rama de despliegue ni desplegado. Antes del ensayo compartido se debe acordar la fuente con el líder y el desarrollador productor. El evento debe identificar el proyecto: la implementación no deduce projectId cuando está ausente. Ya no es necesario exigir que el productor envíe nuestros ocho campos de evaluación si el proyecto está configurado en la tool.

## Registro central: cambio concreto listo para revisar

El [parche de registro](propuestas/registro-central-cpa-tpp.patch) se generó contra el blob original 41bf65ef4cfa3719c6b1a345e4d4189c18e40444. Pasó git apply --check y aplicación sobre una copia aislada. Solo cambia owner y requiredRoles de nuestras dos tools; conserva las demás entradas y la delegación federada.

Propuesta: owner Guillermo Mottu; roles operations.manager y platform.auditor. El líder debe revisar/aplicar ese cambio de datos en el core según el procedimiento de integración. No se hizo push, PR o escritura al repositorio original. Este archivo de registro no asigna roles a usuarios Logto.

## Acciones administrativas listas para ejecutar

No se envió este documento a ninguna otra persona. Las acciones las realiza el líder o desarrollador con el acceso correspondiente; no se requieren usuarios de negocio.

### Cuenta y roles en Logto

1. Abrir la administración del tenant correspondiente a https://pfwk8f.logto.app y verificar la cuenta de desarrollo utilizada. La aplicación pública observada es 7ms3ixe2j7nb4d98s3w98; confirmar que es la aplicación de ensayo de CPA/TPP.
2. Asignar el rol acordado: operations.manager para operar; platform.auditor para lectura. No conceder autoridad desde un body HTTP o cambiando nuestras reglas para dejar entrar usuarios sin rol.
3. Asegurar que el ID token entregue ese rol en el claim roles solicitado. Nuestras dos tools ya están configuradas para leerlo y mapearlo.
4. Cerrar la sesión anterior e iniciar una nueva. Nosotros verificamos auth/me, lectura, evaluación permitida/denegada según rol, retorno y logout. No compartir contraseñas, cookies ni tokens en el chat o repositorio.

### Key exclusiva de lectura del ensayo

La inspección de nombres de secretos del fork confirma que ISOTOOLS_READONLY_API_KEY aún no existe. El administrador del core puede ejecutar, en la shell del core conectada a su DB, la alternativa documentada:

```bash
node scripts/createApiKey.js compare-track-ensayo --scopes=events:read
```

Guardar el resultado directamente en el secreto ISOTOOLS_READONLY_API_KEY del fork, por el canal seguro acordado; no sustituir ISOTOOLS_API_KEY de los consumidores. El script imprime la clave una sola vez: no copiar su salida a evidencias públicas. Nosotros repetimos el replay con ese secreto y el administrador acredita los scopes en el registro central de claves. No se ejecutó el script ni se registró una nueva credencial durante esta tarea.

## Qué permanece abierto

- Aplicar los roles de cuenta en Logto y comprobar una sesión humana autorizada.
- Revisar/aplicar el parche del registro en el core y emitir la key exclusiva de lectura.
- Revisar/integrar/desplegar la propuesta TPP y configurar proyectos de desarrollo donde corresponda; acordar el projectId del evento con el productor.
- Repetir el ensayo sobre las entradas guardadas cuando tengan la identidad/contexto necesarios. La evidencia aislada de desarrollo no reemplaza una cadena compartida ni los PV de otras tools.
