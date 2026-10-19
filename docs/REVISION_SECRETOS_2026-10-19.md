# Revisión de secretos antes de publicar IsoTools

Fecha: 19 de octubre de 2026.

La revisión inicial se completó antes de publicar las correcciones en el fork `https://github.com/GuillermoMottu/IsoTools`, rama `comm/sync_erp_data_local__compare_planned_vs_actual`. Después, con autorización explícita, se aplicaron los cuatro secretos nuevos a Actions y a los dos servicios Railway y se desplegó `0f7af25780308e516ebe7a55a65ddcb2b1a07e16`. Se conservaron la key central y las credenciales Logto existentes. El remoto upstream `https://github.com/carcamfer/IsoTools` no se modificó y los archivos privados quedaron excluidos de la publicación.

## Resultado

Actualización remota: la [inspección inicial autorizada](https://github.com/GuillermoMottu/IsoTools/actions/runs/39329650233) no encontró coincidencias en los assets con marcadores ni prefijos reales de key central y secreto de aplicación; los secretos de sesión y máquina aún no existían. Tras configurarlos y [desplegar ambas tools](https://github.com/GuillermoMottu/IsoTools/actions/runs/39330751889), las verificaciones estrictas volvieron a pasar, incluyendo los prefijos reales de los secretos de sesión. Los valores permanecieron en memoria del runner; los informes contienen estados y nombres de variables. Ambas tools ahora responden 401 a sesión/API anónimas y a una key incorrecta. La QA con credenciales propias pasó. El login humano está bloqueado por `invalid_redirect_uri` en Logto y sigue sin certificar.

No se detectaron credenciales reales incrustadas en los archivos publicables mediante los patrones revisados, ni copias de los cinco valores privados locales comparados en esos archivos o en los objetos Git examinados. Las coincidencias heurísticas se contrastaron con el código: correspondían a nombres de campos, referencias a variables de entorno, placeholders, credenciales de pruebas o contraseñas de desarrollo documentadas.

Sí se encontró una key preexistente en `demo-frontend/.env.local`, bajo `VITE_ISOTOOLS_API_KEY`. Estaba ignorada por Git y no se encontró en los builds ni en los dos bundles publicados revisados. Aun así, era una ubicación inadecuada para un secreto de backend y las exclusiones de Docker permitían copiar ese archivo en una construcción local. Se corrigió antes de publicar.

## Hallazgos y correcciones locales

### 1 Key privada en el entorno del frontend

- Situación: el archivo local ignorado `demo-frontend/.env.local` contenía `VITE_ISOTOOLS_API_KEY`. El cliente actual no referencia esa variable; sus peticiones usan el backend propio.
- Riesgo: una variable VITE_ queda disponible para sustitución en el código del navegador cuando este la referencia. Mantener una credencial en ese entorno facilita una exposición futura.
- Corrección: se preservó primero el mismo valor en `.env.backend-key.local`, bajo `ISOTOOLS_API_KEY`, y luego se retiró la variable del archivo del frontend. La copia de backend no se carga automáticamente y está ignorada por Git y Docker. No se revocó, rotó ni modificó la key remota.
- Evidencia: se comparó el valor completo y su prefijo con los builds locales y los dos bundles desplegados conocidos. Todas las comparaciones fueron negativas. No se envió la key al servidor ni se utilizó para autenticarse durante esa comprobación.

### 2 Docker incluía archivos de entorno anidados

- Situación: `.dockerignore` tenía `.env` y `.env.*`, pero no las variantes recursivas. Los Dockerfiles copian `demo-frontend/` al contexto de construcción del frontend.
- Prueba previa: una construcción mínima FROM scratch, sin red y con secretos ficticios, excluyó el archivo privado de la raíz pero incluyó `demo-frontend/.env.local`.
- Corrección: se añadieron `**/.env` y `**/.env.*`.
- Prueba posterior: la misma construcción excluyó ambos archivos. No se introdujeron secretos reales en el experimento ni se construyó una imagen con ellos.

### 3 Un error de configuración imprimía el issuer recibido

- Situación: las tres copias del parser OIDC incluían el valor completo recibido en el error de URL inválida. Una variable mal configurada podía acabar en la salida de error del proceso.
- Corrección: se conserva el nombre de la variable en el mensaje y se omite su valor, tanto en las tools como en la plantilla y el parser del core. No se cambió la política de autenticación del core.
- Evidencia: la regresión de configuración verifica que un valor sensible ficticio no aparezca en el error. Pasó en Windows y en Linux Node 22 sin red.

## Alcance de la búsqueda

- 451 archivos versionados y 469 archivos de trabajo en total, incluyendo los no versionados publicables.
- 67 commits alcanzables desde las referencias locales y 746 blobs de texto, aproximadamente 6.56 MB. Se incluyeron ramas locales, referencias remotas ya presentes, stash y capturas locales de Codex. Esto no significa que todo ese contenido esté publicado en GitHub.
- Patrones de claves privadas, tokens de GitHub/AWS/Google/Slack, JWT, asignaciones de credenciales y URLs con contraseña.
- Comparación exacta de cuatro secretos candidatos generados y la key preexistente del frontend, sin imprimir valores ni prefijos.
- Inventario de archivos de entorno e inspección de exclusiones Git y Docker.
- Revisión de los pasos de preparación/inspección de Railway: los informes contienen estados y la clave se transmite a la CLI por stdin, no como argumento. La key central se usa contra el core y la credencial de cada tool contra su backend.
- Revisión de los bundles locales disponibles y lectura de los dos bundles públicos identificados anteriormente. La key se comparó en memoria, sin enviarla en headers o URLs.

Los cuatro secretos de sesión y de máquina conservan su copia local en `.env.*.local`, ignorados por Git y Docker. Se aplicaron por stdin a Actions y Railway, sin pasarlos como argumentos ni imprimir valores. La key antigua del frontend quedó preservada en el archivo privado de backend; una consulta posterior al core con ella fue rechazada con 401 y no se la usó para sustituir la key desplegada válida. No se incorporó a los cambios la contraseña de la cuenta de prueba compartida por el líder.

Los ejemplos de Postgres y Docker Compose contienen contraseñas públicas de desarrollo. No son una credencial productiva confirmada y no deben reutilizarse en producción. Este escaneo no verificó qué contraseña utiliza la base desplegada.

## Evidencia

- [Resultados heurísticos sin valores sensibles](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/secret-review/scan.json>).
- [Comparación con los builds locales](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/secret-review/local-build-key-check.json>).
- [Comparación con los bundles publicados](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/secret-review/deployed-key-check.json>).
- [Exclusiones Docker antes de corregir](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/secret-review/dockerignore-result.json>).
- [Exclusiones Docker después de corregir](</C:/Users/Guillermo Mottú/.codex/visualizations/2026/10/19/01a154cf-9a68-78f0-af01-96cd716fe5ed/secret-review/dockerignore-result-after.json>).

El JSON de resultados conserva candidatos del escaneo inicial, no una lista de fugas confirmadas. Algunos patrones genéricos, como `key`, también coinciden con columnas y campos de formularios; se revisaron antes de emitir el resultado.

## Límites

Fue un escaneo heurístico local y una revisión dirigida, no una certificación integral de seguridad. No se ejecutaron Gitleaks o TruffleHog porque no estaban instalados. El escáner limitaba blobs históricos a 2 MB y omitía binarios; en esta ejecución no hubo omisiones por esos dos límites.

No se descargaron referencias Git nuevas, no se auditaron todos los logs o artefactos históricos de Actions y no se ejecutó un análisis de vulnerabilidades de dependencias ni una prueba de penetración. Posteriormente sí se inspeccionó la configuración privada de ambas tools en Railway mediante el workflow autorizado: los secretos se usaron en memoria para las comprobaciones descritas, sin incluir sus valores en los informes. Esto no constituye una auditoría de todos los secretos del proyecto Railway.

Los hallazgos corregidos pertenecen al código y configuración locales. La activación de SSO, el reinicio real del volumen y la aceptación productiva continúan pendientes del despliegue autorizado y de los datos/roles que debe confirmar plataforma.
