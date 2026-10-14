# SSO y runbook — compare y track

Fecha: 2026-10-13. Fuente: `Runbook_Pruebas_Tools_IsoTools.docx` entregado por el usuario y `plantillas/integracion/sso/README.md` de upstream `feature/filter`.

## Evidencia y límites

| Punto del runbook | Implementación/verificación propia | Aceptación pendiente |
| --- | --- | --- |
| 1. Railway, health y ready | Imágenes Node 22; health público; ready no depende de que existan datos ERP | Consumidores desplegados pausados: ready informa 503 `consumer_disabled` |
| 2. URL y API key | URL oficial; clave desde secreto de Actions; suscripciones verificadas sin revelar el secreto | Verificación de escritura en bus en ejecución QA |
| 3. Registro y dashboard | Entradas propias con subdominio, ISO y roles | Líder debe registrar URLs en el core y comprobar dashboard verde |
| 4. Mismo origen | UI usa `/api/analyses` o `/api/records` y backend propio | Revisión del despliegue actualizado |
| 5. Sin secretos en frontend | Inspector comprueba nombres sensibles y prefijo de la clave; assets sin headers de credenciales | Inspector ejecutado después del despliegue |
| 6. SSO | Handshake con SDK real e IdP simulado: PKCE, firma, issuer, audience, expiración, state, nonce; API 401 JSON, browser redirect, deep link, cookie segura, roles y actor verificado | Credenciales del IdP y prueba real entre ambas tools; hoy modo abierto |
| 7. Contrato ERP | Ventas acepta importes y contadores como strings; fecha simple o rango; sin meta publica `sin_meta` | Track necesita contexto real del proyecto en su entrada |
| 8. Polling y persistencia | Logs, cursor durable, deduplicación por evento y periodo, actualización del mismo registro; reinicio local probado | Activación coordinada y reinicio real con volumen Railway |
| 9. Publicación | UUID estable ante reintento; module propio, correlación, causación y marca QA conservados | POST real y respuesta 201 en ejecución QA |
| 10. Cadena | Contexto de proyecto preservado compare → KPIs; runner consulta cadena del bus | Cadena visible en dashboard y contexto completo del origen |
| 11. Errores | Entrada inválida conservada en `rejected`, log y cursor avanza; configuración inválida retiene cursor; backoff 10–300 s; API inválida 400 | Prueba operacional de caída/recuperación del core coordinada |
| 12. UI | Aviso de modo abierto, navegación central, ISO correcto, fuente/frescura y datos QA identificados | Comprobación visual del despliegue actualizado |

Se habilita explícitamente la verificación de firmas del ID token en `openid-client` mediante `enableNonRepudiationChecks`. Una prueba negativa detectó que sin esa opción el token con firma inválida se aceptaba; ahora se rechaza.

Los cambios de hitos en UI ajustan la evaluación local. Se eliminó una llamada de autosave a un endpoint inexistente; la pantalla indica que no modifica la fuente.

## Ejecutar las comprobaciones

Pruebas: `node scripts/test_sso_handshake.js` y `--track`, `node scripts/test_runbook_consumer.js`, `node scripts/test_tool_service.js`, `node scripts/test_railway_inspection.js`.

El workflow `deploy-tools.yml`, modo `validate`, publica únicamente eventos con `module.id=qa_runbook` y `metadata.test=true`. Ejecuta el mismo consumidor de forma aislada, filtra exclusivamente sus entradas QA y consulta sus cadenas. Su reinicio valida el archivo de estado del runner; no demuestra el reinicio del volumen Railway ni activa los consumidores desplegados. Si el core conserva handlers locales de fallback, pueden aparecer otros eventos en esas cadenas.

Las metas no vienen descritas en el cierre ERP. El evento de KPIs sin ID, fechas ni avance de proyecto tampoco permite inventar un proyecto. El proveedor de ese contexto debe completarlo antes de aceptar el flujo real de track.

No se declara cerrado todo el checklist mientras falten registro central, IdP real y aceptación del consumo desplegado.
