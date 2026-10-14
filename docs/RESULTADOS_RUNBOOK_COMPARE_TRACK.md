# SSO y runbook — compare y track

Fecha: 2026-10-13. Fuente: `Runbook_Pruebas_Tools_IsoTools.docx` entregado por el usuario y `plantillas/integracion/sso/README.md` de upstream `feature/filter`.

## Evidencia y límites

| Punto del runbook | Implementación/verificación propia | Aceptación pendiente |
| --- | --- | --- |
| 1. Railway, health y ready | Ambas tools activas, health y ready públicos 200; lectura nueva iniciada desde el cursor más reciente | Llegada y aceptación de datos empresariales reales |
| 2. URL y API key | URL oficial; clave desde secreto de Actions; GET de ambas suscripciones y POST QA 201 aceptados | Sin pendiente técnico de credencial demostrado |
| 3. Registro y dashboard | Ambas URLs y healthUrl registrados en core, estado `live`, salud `up` HTTP 200 | Owner/roles definitivos con líder |
| 4. Mismo origen | UI publicada usa `/api/analyses` o `/api/records` y backend propio; abre sin error | UI con registros reales después de activar consumo |
| 5. Sin secretos en frontend | Inspector de ambas tools pasó después del despliegue: bundle comprobado, prefijo real comprobado, sin filtración | Ninguna filtración detectada |
| 6. SSO | Handshake con SDK real e IdP simulado: PKCE, firma, issuer, audience, expiración, state, nonce; API 401 JSON, browser redirect, deep link, cookie segura, roles y actor verificado | Credenciales del IdP y prueba real entre ambas tools; hoy modo abierto |
| 7. Contrato ERP | Ventas acepta importes y contadores como strings; fecha simple o rango; sin meta publica `sin_meta` | Track necesita contexto real del proyecto en su entrada |
| 8. Polling y persistencia | Polling Railway activo, cursores avanzan y registros QA conservados; reinicio local probado | Reinicio real con volumen Railway |
| 9. Publicación | UUID estable ante reintento; module propio, correlación, causación y marca QA conservados; ambas salidas aceptadas HTTP 201 | Aceptación de eventos reales desde los servicios activos |
| 10. Cadena | Contexto de proyecto preservado compare → KPIs en pruebas; cadenas QA de ambas salidas verificadas en API central | Cadena productiva visible en dashboard y contexto completo del origen |
| 11. Errores | Entrada inválida conservada en `rejected`, log y cursor avanza; configuración inválida retiene cursor; backoff 10–300 s; API inválida 400 | Prueba operacional de caída/recuperación del core coordinada |
| 12. UI | Verificación visual publicada: aviso de modo abierto, navegación central, ISO correcto y estado vacío honesto | Fuente/frescura con registros reales tras activar consumo |

Se habilita explícitamente la verificación de firmas del ID token en `openid-client` mediante `enableNonRepudiationChecks`. Una prueba negativa detectó que sin esa opción el token con firma inválida se aceptaba; ahora se rechaza.

Los cambios de hitos en UI ajustan la evaluación local. Se eliminó una llamada de autosave a un endpoint inexistente; la pantalla indica que no modifica la fuente.

## Ejecutar las comprobaciones

Pruebas: `node scripts/test_sso_handshake.js` y `--track`, `node scripts/test_runbook_consumer.js`, `node scripts/test_tool_service.js`, `node scripts/test_railway_inspection.js`.

El workflow `deploy-tools.yml`, modo `validate`, publica únicamente eventos con `module.id=qa_runbook` y `metadata.test=true`. Actualmente observa el consumidor Railway activo y comprueba sus registros y cadenas; no reinicia servicios. La primera versión ejecutaba un consumidor aislado: aquella prueba de reinicio validó el archivo de estado del runner, no el volumen Railway. Si el core conserva handlers locales de fallback, pueden aparecer otros eventos en esas cadenas.

Las metas no vienen descritas en el cierre ERP. El evento de KPIs sin ID, fechas ni avance de proyecto tampoco permite inventar un proyecto. El proveedor de ese contexto debe completarlo antes de aceptar el flujo real de track.

No se declara cerrado todo el checklist mientras falten registro central, IdP real y aceptación del consumo desplegado.

## Resultados ejecutados

- [Despliegue 38505386798](https://github.com/GuillermoMottu/IsoTools/actions/runs/38505386798): success en ambas tools. SHA servido `c8ce1198aad225a024fee3e2a9775322b918a0cd`; `/health` público 200, SSO abierto, clave central válida y volumen `/data` persistente. `/ready` continúa 503 `consumer_disabled` porque no se activó consumo productivo.
- [Validación QA 38505647432](https://github.com/GuillermoMottu/IsoTools/actions/runs/38505647432): success. Reinicio del runner sin segunda publicación y cadena central verificada para cada salida. La primera ejecución QA falló en el assert de cadena: el core devuelve el identificador en `tool`; se corrigió el runner, no el servicio desplegado.
- Node 22: handshake SSO completo con IdP simulado pasó para ambas imágenes; consumidor con cuarentena, deduplicación, actualización y reintentos pasó; smoke de ambas imágenes pasó. Servicio HTTP y catálogo pasaron; aviso preexistente de SPC sin subdominio.

| Tool | Correlación QA | Salida propia | Resultado |
| --- | --- | --- | --- |
| compare_planned_vs_actual | qa-runbook-ca47f987-e40e-4b3e-8673-f12201ec1166-compare_planned_vs_actual | 73f50052-a1dd-45a7-9cb4-841a59b8ab27 | HTTP 201, sin_meta |
| track_project_progress | qa-runbook-ca47f987-e40e-4b3e-8673-f12201ec1166-track_project_progress | b2d6e93e-acf8-4af1-a335-0144f7166900 | HTTP 201, at_risk |

Durante QA el core ejecutó además handlers de fallback: KPIs de ejemplo y un proyecto `ISO9001-IMPL`. Esas salidas no provienen de nuestras tools Railway ni acreditan contexto real del ERP. La comprobación valida el ID exacto de nuestra salida. La configuración/delegación de esos handlers pertenece al core del líder.

Última consulta pública del core: compare `https://cpa.orcalabs.mx`, health `https://cpa.orcalabs.mx/health`, `up`; track URL y healthUrl null, `unknown`/`sin desplegar`. El servicio propio de track sí responde 200 en `https://tpp.orcalabs.mx/health`. Registro central y despliegue propio tienen estados distintos.

Pendientes actuales: owner/roles en core; entrega/configuración de IdP; contexto real de proyecto desde el productor; probar el reinicio de su volumen Railway. No se debe confundir el reinicio aislado QA con esta última aceptación operacional.

## Activación y prueba a través de Railway — actualización posterior

El usuario reportó las pantallas vacías. Se confirmó `/ready` 503 `consumer_disabled`, cursor null y registros vacíos en ambas tools. En esta consulta ambas URLs ya estaban registradas en core con salud `up`; el pendiente de registro quedó resuelto.

Se añadió `activate_consumer=true` al workflow de despliegue. Antes de escribir variables, verifica clave central y registro federado de la URL y healthUrl exactos, saludables. Conserva volúmenes, datos y autenticación; no configura replay histórico.

- [Activación 38506459810](https://github.com/GuillermoMottu/IsoTools/actions/runs/38506459810): success, SHA desplegado `1e071b0`. Ambos `/ready` responden 200. Cursores iniciales compare 7428 y track 7434, correspondientes a los últimos eventos existentes: no se importaron históricos.
- [QA en consumidores Railway 38506668863](https://github.com/GuillermoMottu/IsoTools/actions/runs/38506668863): success. El runner solo publica las entradas QA y observa los servicios; no inicia un consumidor competidor. Ambos guardaron el registro con procedencia del evento y publicaron HTTP 201, cadena verificada.
- Correlaciones: `qa-runbook-73f4f0a5-b58a-4031-9e5c-996bf8ef394b-compare_planned_vs_actual` y `qa-runbook-73f4f0a5-b58a-4031-9e5c-996bf8ef394b-track_project_progress`.
- Salidas propias: compare `9e9b3f5d-4fb7-499b-816d-e24397687abf` (`sin_meta`); track `f1fa1d5f-c1f9-41df-a659-47ffc7ff5605` (`at_risk`).
- Consulta posterior: compare cursor 7440, un registro y cero descartados; track cursor 7445, un registro y dos entradas no calculables conservadas en `rejected`.
- Verificación visual: ambas pantallas muestran un registro identificado como **Datos de prueba**, con fuente y fecha. Esta evidencia acredita la lectura y publicación del servicio desplegado; no demuestra eventos empresariales reales ni reinicio del volumen.

El modo `validate` del workflow ahora observa los consumidores desplegados; requiere que estén listos. El runner aislado sigue disponible al ejecutar el script sin `VERIFY_DEPLOYED_CONSUMER=true`, y su evidencia histórica conserva el alcance anterior.
