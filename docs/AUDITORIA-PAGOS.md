# Auditoría de cargos, pagos e historial — CEA Gestión

Fecha: 24-sep-2026 · Alcance: `pagos.controller.js`, `cargos.cron.js`, `estudiantes.controller.js`, `horarios.controller.js` y el front (`pagos.js`, `perfil-estudiante.js`, `perfil-maestro.js`, `calendario-global.js`, `calendario-grupos.js`, `reportes.js`, `dashboard.js`, `estudiantes.js`).

Método: lectura completa del código + auditoría **de solo lectura** sobre los datos reales de Supabase (nada se escribió ni se borró) + 26 ataques contra los controladores usando una base falsa en memoria.

> **Actualización 25-sep-2026 — ya corregido:** 22 de los 25 huecos confirmados están arreglados (`src/services/cargos.service.js`, cambios en `pagos.controller.js`, `cargos.cron.js`, `horarios.controller.js`). El generador de cargos ahora es único e idempotente (cron, arranque y `/generar` comparten la misma función); asignar una clase genera el cargo del mes en el servidor, sin depender del modal; hay validación de monto/estado/tipo, 404 en vez de 500, y borrar un cargo ya cobrado exige confirmación explícita (`?force=true`). Quedan 3 huecos abiertos a propósito, documentados como roadmap: doble clic en inscripción/ajuste (mitigable con el índice `scripts/2026-09-unique-inscripcion.sql`, aún sin correr en Supabase) y falta de bloqueo optimista para dos cobros simultáneos del mismo pago. Verificar con `node scripts/prueba-ataques-pagos.js` y `node scripts/prueba-limpieza-calendario.js`. Los 29 cargos faltantes de septiembre **no se han creado** — eso lo decide la encargada. Además ahora existe el botón "Limpiar calendario" en Calendario Global (borra horarios y cargos sin cobrar, conserva los pagados).

---

## 1. Resumen

**Por qué "a veces no se registran los cargos".** Hay tres causas distintas, todas confirmadas:

1. **El cargo del mes siguiente no existe para quien recibe clase después de que corrió el cron.** El cron solo corre una vez al mes (día 25) y nada crea el cargo del mes siguiente a quien entra después. Hoy hay **29 alumnos activos con clase sin cargo de septiembre** (todos recibieron su clase entre el 27-ago y el 1-sep, después de la tanda del 26-ago). Su lista sale de `node scripts/auditar-pagos.js`.
2. **El cargo mensual solo se crea si la encargada toca "Guardar" en el modal de precio.** Si el alumno ya tiene precio y elige **"El precio no cambia"**, se salta la creación del cargo (`perfil-estudiante.js:543-546`). Igual pasa al unirse a un grupo desde Calendario Global (`calendario-global.js:973`, no manda `nuevaClase=true`), o si se cierra la pestaña a la mitad.
3. **El cron nunca se ha ejecutado en su horario.** Las tandas masivas se crearon el 26-ago a las 15:38 (CDMX) y el 25-jul a las 11:46, no a las 00:05 del día 25. Es decir, el servidor no está encendido a esa hora y lo que salvó los cargos fue la "red de seguridad" al arrancar (solo válida los días 25-27, y que se apaga con **un solo** cargo adelantado manual). **Mañana 25-sep es la próxima prueba.**

**Dinero que puede fugarse (sin que quede rastro):** no existen abonos, así que cobrar menos se resuelve editando el monto (la diferencia desaparece); no hay bitácora de quién cambió/borró qué; cualquier usuario con sesión puede borrar un pago ya cobrado; dos personas pueden cobrar el mismo cargo a la vez.

**Bomba de tiempo:** la pantalla Pagos pide todos los pagos sin paginar. Hoy hay 598; con 1000 filas (≈ noviembre) empezará a mostrar la lista **truncada sin avisar**, y los que desaparecen son los cargos pendientes más viejos.

Resultado del banco de ataques: **25 huecos de 26 pruebas** (una era comportamiento por diseño). Detalle en la sección 4.

---

## 2. Datos reales encontrados (solo lectura)

| Hallazgo | Cantidad |
|---|---|
| Alumnos / horarios / pagos | 335 / 504 / 598 |
| Pagos por tipo · estado | 597 mensual + 1 ajuste · 598 pendientes (aún no se cobra nada en el sistema) |
| Activos con clase **sin cargo de septiembre** | **29** |
| Cargos de **$0** (creados en la tanda del 26-ago) | 6 (pagos 617, 618, 627, 628, 730, 734) |
| Cargo mensual pendiente de alumno **sin horario** | 6 (pagos 304, 323, 499, 500, 627, 628; los dos últimos también son de $0) |
| Alumnos con clase y precio vacío/0 | 0 |
| Duplicados alumno+mes · mes no día 1 · huérfanos · estados raros | 0 |
| Alumnos activos **sin ningún cargo de inscripción** | 285 (la UI no crea inscripciones; ver H17) |
| Nombre duplicado | "Regina Martínez Rodríguez" (ids 259 y 303) |

Lo bueno: el índice único `idx_pagos_mensual_unico` sí está funcionando (0 duplicados) y los datos existentes no tienen montos negativos ni estados inválidos. Todavía es buen momento para blindar, porque aún no hay cobros registrados.

---

## 3. Mapa de flujos

| # | Flujo | Dónde | Qué pasa con el dinero |
|---|---|---|---|
| F1 | Alta de alumno | `estudiantes.js:161` (precio 0) · `calendario-global.js` `naGuardar` (con precio) | No crea cargo. Con precio 0 obliga a pasar por F2 |
| F2 | Asignar clase individual → `?nuevaClase=true` | `perfil-maestro.js:138`, `calendario-global.js:894` → `perfil-estudiante.js:99` | Modal precio → (solo "Guardar") crea mensual del **mes actual** → modal "cargo extra" crea un **ajuste** |
| F3 | Unirse a grupo/matros | `calendario-global.js:973` (sin cargo) · `calendario-global.js:1357` y `perfil-maestro.js:948` (con `nuevaClase`) | Inconsistente: el primero nunca ofrece cobro |
| F4 | Asignar varios días a la vez | `calendario-global.js:856-897` | Un solo cargo mensual; redirige aunque solo un día haya funcionado |
| F5 | Mover/editar bloque | `horarios.controller.js` `actualizar` | No toca cargos |
| F6 | Eliminar clase / quitar de grupo / eliminar grupo | `perfil-estudiante.js:439`, `calendario-global.js:1177,1198`, `perfil-maestro.js` | Ofrece "descuento": resta al monto de un cargo pendiente (desde el navegador) |
| F7 | Cron día 25 00:05 + arranque | `cargos.cron.js:265-283` | Crea mensual del **mes siguiente** para activos con clase y precio > 0 |
| F8 | `POST /api/pagos/generar` | `pagos.controller.js:81` | Sin botón en la UI; tiene bugs (G1, G2) |
| F9 | Cargo adelantado | `pagos.js:302-428` | Crea mensual de cualquier mes de los próximos 13, pendiente o pagado |
| F10 | Registrar pago + recibo | `pagos.js:174-216`, `actualizar` | PATCH libre de estado/monto/método/fecha/notas |
| F11 | Editar pago ya cobrado | mismo modal | Se puede cambiar monto/estado sin rastro |
| F12 | Eliminar cargo | `pagos.js:229`, `eliminar` | Borrado físico, incluso de cobrados |
| F13 | Lista/filtros de Pagos | `pagos.js:49-124` | Sin paginación; filtro Maestro no filtra |
| F14 | Historial en perfil del alumno | `perfil-estudiante.js:775-834` | Total pendiente = suma de pendientes |
| F15 | Reporte mensual + CSV | `reportes.js` | Por mes **del cargo**, no por fecha de cobro |
| F16 | Contador del dashboard · asteriscos en Calendario Grupos | `dashboard.js:73`, `calendario-grupos.js:86` | Cuenta cualquier pendiente (incluye meses futuros) |
| F17 | Baja / reactivar / eliminar alumno | `estudiantes.controller.js:108-146` | Baja borra sus horarios; no avisa de deuda; no revisa respuesta |
| F18 | Cambiar `precio_mensual` | perfil / `estudiantes.js` | No modifica cargos ya generados (esperado, pero nadie lo avisa) |
| F19 | Cargo único de mantenimiento (may-2026) | `cargos.cron.js:187-257` | Ya pasó; queda código muerto y no aparece en reportes por mes |
| F20 | Inscripción | `crear` con `es_inscripcion` | Solo API, sin UI |

---

## 4. Hallazgos (ordenados por gravedad)

Las claves C/U/D/G/K corresponden al banco de ataques (`scripts/prueba-ataques-pagos.js`).

### A. Cargos que no se crean

| ID | Hallazgo | Evidencia |
|---|---|---|
| H1 | Quien entra después del día 25 no recibe el cargo del mes siguiente | 29 alumnos hoy |
| H2 | "El precio no cambia" no crea el cargo del mes | `perfil-estudiante.js:543` (latente: aplica a todo alumno con precio > 0, p. ej. creado desde Calendario Global con precio o que regresa tras una pausa) |
| H3 | Unirse a grupo desde Calendario Global no ofrece cobro; cerrar/recargar antes de terminar tampoco. El POST del cargo no revisa `res.ok`, así que un error 500 pasa en silencio | `calendario-global.js:973`, `perfil-estudiante.js:591-599` |
| H4 | El cron no corre a su hora y la red de seguridad se apaga con un solo cargo adelantado (K3) | Tandas del 25-jul 11:46 y 26-ago 15:38 |
| H5 | `/generar` no crea el mensual si el alumno ya tiene un **ajuste** o mantenimiento ese mes (no filtra `tipo='mensual'`) y crea cargos de $0 sin precio (G1, G2) | `pagos.controller.js:102-104,112` |
| H6 | Alumno con clase y precio 0 no se cobra; el aviso solo sale en la consola del servidor (K1) | `cargos.cron.js:89-95` |
| H7 | Hay 6 cargos de $0 y 6 mensuales pendientes de alumnos sin clase | Sección 2 |

### B. Dinero que puede perderse o cambiar sin rastro

| ID | Hallazgo | Prueba |
|---|---|---|
| H8 | **No hay abonos.** Cobrar menos = editar el monto; la diferencia desaparece y no queda el monto original | U3 |
| H9 | **Sin bitácora** y sin roles: cualquier sesión puede editar/borrar todo, sin quién/cuándo/por qué | — |
| H10 | Se puede **borrar un pago cobrado**; borrar un id inexistente responde "éxito" | D1, D2 |
| H11 | El descuento tras eliminar clase calcula sobre el monto guardado en el navegador (U7), puede caer en un cargo de **otro mes** (toma el pendiente más antiguo) o en uno que otra persona ya cobró, y no deja registro ni motivo. `Math.max(0, …)` oculta descuentos mayores al monto | `perfil-estudiante.js:701`, `calendario-global.js:1309`, `perfil-maestro.js:899` |
| H12 | Dos personas cobrando el mismo cargo: ambas reciben 200 y 2 recibos; gana la última escritura (U6) | U6 |
| H13 | Sin validación en servidor: monto negativo, absurdo, faltante ($0), tipo/estado inválidos (un `estado` raro deja el dinero fuera de todos los totales), "pagado" sin método/fecha, regresar a "pendiente" deja método y fecha (C1-C5, C10, C12, U1, U2, U4) | Banco de ataques |
| H14 | Duplicados: `mes` que no es día 1 salta el índice único (C6); inscripción duplicable (C8); ajuste duplicable con doble clic o **F5 en `?nuevaClase=true`** (C9); doble clic en mensual devuelve 500 crudo de Postgres (C7) | Banco de ataques |

### C. Visibilidad y reportes

| ID | Hallazgo |
|---|---|
| H15 | `GET /api/pagos` sin paginar: tope de 1000 filas → lista truncada y sin aviso (hoy 598, ≈ +285 por mes). Igual para los asteriscos de Calendario Grupos |
| H16 | El filtro **Maestro** de Pagos no hace nada (`pagos.js:434` recarga pero no lo usa) |
| H17 | El reporte agrupa por mes del cargo, no por fecha de cobro: no sirve como corte de caja. Cargos tipo `mantenimiento` no aparecen en reportes por mes. Inscripciones no se crean desde la UI y 285 alumnos activos no tienen ninguna: confirmar si es intencional |
| H18 | La fecha de pago propuesta usa UTC (`pagos.js:153`): después de las 18:00 en CDMX propone el día siguiente y a fin de mes cae en el mes siguiente. `mesActualStr()` usa el reloj del navegador |
| H19 | Dar de baja no avisa de deuda pendiente y borra los horarios; eliminar alumno puede borrar historial si la FK de `Pagos` es `ON DELETE CASCADE` (**verificar en Supabase**); `estudiantes.js:264,282` ni revisan la respuesta |
| H20 | Un alumno pendiente de un **mes futuro** (cargos generados el 25) hace aparecer el asterisco "debe" a todos desde el día 25 |
| H21 | El recibo se genera al vuelo con el monto **actual** (editable) y no se guarda; el folio es el `id_pago` |

### D. Seguridad menor (solo usuarios autenticados)

- `est.nombre` y `notas` se insertan con `innerHTML` y `document.write` en el recibo (XSS almacenado).
- El parámetro `mes` se concatena dentro de `.or()` (`pagos.controller.js:25-29`): permite alterar el filtro.

---

## 5. Plan sugerido para "detectar y bloquear"

**Ya listo (no cambia nada del sistema):**
- `node scripts/auditar-pagos.js` → detector de solo lectura (faltantes, $0, estados raros, duplicados, cercanía al tope de 1000). Sale con código 1 si hay hallazgos; se puede correr a diario.
- `node scripts/prueba-ataques-pagos.js` → banco de ataques en memoria; después de los arreglos debe pasar de 25 a ~0 huecos (K2 es por diseño).

**Bloqueos propuestos, por prioridad (no aplicados todavía, ninguno modifica datos existentes):**

1. **Antes del 25-sep:** función única e idempotente "generar cargos faltantes" (por alumno, no por "existe alguno") usada por el cron, por el arranque **en cualquier día ≥ 25** y por un botón en Pagos. Con eso desaparecen H1, H4, H5 y K3. Después, con tu visto bueno, crear los 29 cargos de septiembre.
2. Crear el cargo del mes en cuanto se asigna clase (en el servidor, al crear el horario, si no existe) en vez de depender del modal → cierra H2 y H3.
3. Validación en el servidor de `crear`/`actualizar`: lista blanca de `tipo` y `estado`, monto numérico entre 0 y un tope, `mes` normalizado a día 1, "pagado" exige método y fecha, alumno existente y activo. Errores 404/409 legibles.
4. Bitácora append-only `PagosAuditoria` (quién, cuándo, antes/después) + no permitir borrar pagos cobrados (solo anular con motivo).
5. Abonos: campo `monto_pagado` o tabla de abonos; cobrar menos genera saldo pendiente en vez de reducir el monto.
6. Actualización condicional (`estado = 'pendiente'` esperado) para cobros y un endpoint de descuento que calcule en el servidor.
7. Paginación o filtro de mes por defecto en Pagos (antes de noviembre); arreglar el filtro Maestro; fecha de pago en hora de CDMX; reporte por fecha de cobro.
8. Escapar HTML en nombres/notas del recibo y validar `mes` con expresión regular.

---

## 6. Por confirmar en Supabase (no se puede ver desde el código)

- Tipo de la FK `Pagos.id_estudiante` (`RESTRICT` recomendado; `CASCADE` borraría historial de pagos al eliminar un alumno).
- Límite `max_rows` de PostgREST (asumido 1000, el valor por defecto).
- Si hay `CHECK` en `estado`/`tipo`/`monto` (los ataques asumen que no).
- Dónde y cómo corre el servidor (¿PC local, hosting que se duerme?), para explicar por qué el cron no dispara a las 00:05.
