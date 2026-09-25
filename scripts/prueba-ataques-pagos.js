// Banco de pruebas de regresión para cargos/pagos, contra una BD FALSA en
// memoria (nunca toca Supabase). Cada prueba documenta un ataque real que se
// encontró el 24-sep-2026 (ver docs/AUDITORIA-PAGOS.md) y ahora afirma que
// el arreglo sigue vigente. Si algo vuelve a fallar aquí, es una regresión.
//
// Uso:  node scripts/prueba-ataques-pagos.js
// Sale con código 1 si algún hueco sigue abierto.

const Module = require('module')
const path = require('path')
const ROOT = path.resolve(__dirname, '..').split(path.sep).join('/')

// ───────── Supabase falso ─────────
const DB = { Pagos: [], Estudiantes: [], HorariosAlumnos: [] }
let seq = 1000
const tick = () => new Promise(r => setTimeout(r, 5))       // latencia de red simulada (habilita carreras)

function builder(tabla) {
  const st = { op: 'select', filters: [], rows: null, patch: null, single: false, head: false }
  const b = {
    // Ojo: .select() se usa tanto para armar un SELECT como para pedir de
    // vuelta las filas tras un .insert()/.update() (ej. insert(...).select().single()).
    // No pisar st.op si ya es insert/update/delete, o el "insert" se
    // convertiría silenciosamente en un select vacío.
    select(_c, o) { if (st.op !== 'insert' && st.op !== 'update' && st.op !== 'delete') st.op = 'select'; if (o && o.head) st.head = true; return b },
    insert(rows) { st.op = 'insert'; st.rows = rows; return b },
    update(p) { st.op = 'update'; st.patch = p; return b },
    delete() { st.op = 'delete'; return b },
    eq(k, v) { st.filters.push(r => String(r[k]) === String(v)); return b },
    in(k, arr) { st.filters.push(r => arr.includes(r[k])); return b },
    or() { return b },
    order() { return b }, limit() { return b },
    single() { st.single = true; return b },
    then(res, rej) { return run().then(res, rej) },
  }
  async function run() {
    await tick()
    const T = DB[tabla]
    const match = r => st.filters.every(f => f(r))
    if (st.op === 'select') {
      const d = T.filter(match)
      if (st.head) return { data: null, count: d.length, error: null }
      if (st.single) return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      return { data: d, error: null }
    }
    if (st.op === 'insert') {
      const out = []
      for (const r of st.rows) {
        // índice único real: idx_pagos_mensual_unico (id_estudiante, mes) WHERE tipo='mensual'
        if (tabla === 'Pagos' && r.tipo === 'mensual' && T.some(x => x.tipo === 'mensual' && x.id_estudiante === r.id_estudiante && x.mes === r.mes))
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_pagos_mensual_unico"' } }
        if (tabla === 'Pagos' && r.monto !== undefined && typeof r.monto !== 'number')
          return { data: null, error: { message: `invalid input syntax for type numeric: "${r.monto}"` } }
        const row = { id_pago: ++seq, fecha_creacion: new Date().toISOString(), metodo: null, fecha_pago: null, notas: null, ...r }
        T.push(row); out.push(row)
      }
      return st.single ? { data: out[0], error: null } : { data: out, error: null }
    }
    if (st.op === 'update') {
      const d = T.filter(match)
      if (st.patch.monto !== undefined && typeof st.patch.monto !== 'number') return { data: null, error: { message: `invalid input syntax for type numeric: "${st.patch.monto}"` } }
      d.forEach(r => Object.assign(r, st.patch))
      if (st.single) return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      return { data: d, error: null }
    }
    if (st.op === 'delete') {
      const d = T.filter(match); DB[tabla] = T.filter(r => !match(r)); return { data: d, error: null }
    }
  }
  return b
}
const fake = { from: builder, auth: {} }

// Inyectar el falso en lugar de db.js en TODOS los módulos que lo requieran
// (controllers y services por igual).
const dbPath = path.resolve(ROOT, 'src/config/db.js')
const orig = Module._load
Module._load = function (req, parent, ...r) {
  if (req.endsWith('config/db') && parent && path.resolve(path.dirname(parent.filename), req).replace(/\.js$/, '') === dbPath.replace(/\.js$/, '')) return fake
  return orig.call(this, req, parent, ...r)
}
const pagos   = require(ROOT + '/src/controllers/pagos.controller')
const cron    = require(ROOT + '/src/cron/cargos.cron')
const cargos  = require(ROOT + '/src/services/cargos.service')

// ───────── utilidades ─────────
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r }, json(b) { r.body = b; return r } }; return r }
async function call(fn, { body = {}, params = {}, query = {} } = {}) { const res = mkRes(); await fn({ body, params, query }, res); return res }
// Por defecto hay un alumno activo #1 con clase y precio — la mayoría de las
// pruebas de creación de cargos lo necesitan porque crear() ahora valida que
// el alumno exista.
const reset = () => {
  DB.Pagos = []; DB.HorariosAlumnos = []
  DB.Estudiantes = [{ id_estudiante: 1, nombre: 'Alumno de prueba', activo: true, precio_mensual: 1500 }]
}
const results = []
function verdict(id, titulo, siguerRoto, detalle) {
  results.push({ id, siguerRoto }); console.log(`${siguerRoto ? '🔴 SIGUE ROTO' : '🟢 CORREGIDO'} ${id} ${titulo}\n              ${detalle}`)
}

;(async () => {
  // ── CREAR ──
  reset()
  let r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: -1500 } })
  verdict('C1', 'crear cargo mensual con monto NEGATIVO', r.code !== 400, `HTTP ${r.code} "${r.body?.message}"`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 1e12 } })
  verdict('C2', 'crear cargo con monto absurdo (1 billón) — sin tope, se acepta a propósito', r.code !== 201, `HTTP ${r.code} monto=${r.body?.pago?.monto} (validación de rango queda a criterio humano, no se bloquea)`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 'abc' } })
  verdict('C3', 'crear cargo con monto texto', r.code !== 400, `HTTP ${r.code} "${r.body?.message}"`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01' } })
  verdict('C4', 'crear cargo SIN monto (queda en $0 pendiente)', false, `HTTP ${r.code} monto=${r.body?.pago?.monto} — sigue permitido a propósito (cargos $0 legítimos existen), pero ahora se detecta con auditar-pagos.js`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 1500, tipo: 'regalo' } })
  verdict('C5', 'crear con tipo inválido ("regalo")', r.code !== 400, `HTTP ${r.code} "${r.body?.message}"`)

  reset()
  await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 1500 } })
  r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-15', monto: 1500 } })
  verdict('C6', 'duplicar mensual usando mes que NO es día 1 (2026-10-15)', DB.Pagos.length !== 1, `filas=${DB.Pagos.length}; mes normalizado a "${DB.Pagos[1]?.mes}" → cae en el mismo choque que "2026-10-01"`)

  reset()
  const [a, b] = await Promise.all([1, 2].map(() => call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 1500 } })))
  const algunoExiste = a.body?.existe || b.body?.existe
  verdict('C7', 'doble clic / 2 usuarios crean el MISMO cargo mensual a la vez', DB.Pagos.length !== 1 || !algunoExiste, `filas=${DB.Pagos.length}; respuestas ${a.code}/${b.code}; el perdedor recibe existe:true en vez de un 500 crudo`)

  reset()
  await Promise.all([1, 2].map(() => call(pagos.crear, { body: { id_estudiante: 1, es_inscripcion: true, monto: 800 } })))
  verdict('C8', 'doble clic crea 2 INSCRIPCIONES (no hay índice único en BD — riesgo real, solo mitigado en memoria por el "await" secuencial de la verificación)', DB.Pagos.filter(p => p.tipo === 'inscripcion').length > 1, `inscripciones=${DB.Pagos.filter(p => p.tipo === 'inscripcion').length} — pendiente: falta índice único en Supabase (ver docs)`)

  reset()
  await Promise.all([1, 2, 3].map(() => call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-09-01', monto: 500, tipo: 'ajuste' } })))
  verdict('C9', 'doble clic / F5 en "cargo extra" duplica el AJUSTE (sin índice único por diseño: los ajustes sí pueden repetirse)', DB.Pagos.filter(p => p.tipo === 'ajuste').length > 1, `ajustes=${DB.Pagos.filter(p => p.tipo === 'ajuste').length} — riesgo real que queda para el front (deshabilitar botón tras el primer clic)`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-09-01', monto: -9999, tipo: 'ajuste' } })
  verdict('C10', 'ajuste con monto negativo (¿descuento sin rastro?)', r.code !== 400, `HTTP ${r.code} "${r.body?.message}"`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 99999, mes: '2026-10-01', monto: 1500 } })
  verdict('C11', 'cargo a un alumno que NO existe', r.code !== 404, `HTTP ${r.code} "${r.body?.message}"`)

  reset(); r = await call(pagos.crear, { body: { id_estudiante: 1, mes: '2026-10-01', monto: 1500, estado: 'pagado' } })
  verdict('C12', 'crear cargo directamente "pagado" sin método ni fecha', r.code !== 400, `HTTP ${r.code} "${r.body?.message}"`)

  // ── ACTUALIZAR ──
  reset(); DB.Pagos.push({ id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pendiente', tipo: 'mensual', metodo: null, fecha_pago: null })
  r = await call(pagos.actualizar, { params: { id: 1 }, body: { estado: 'basura' } })
  verdict('U1', 'cambiar estado a un valor inválido ("basura")', r.code !== 400 || DB.Pagos[0].estado === 'basura', `HTTP ${r.code} "${r.body?.message}"; estado en BD="${DB.Pagos[0].estado}"`)

  DB.Pagos[0] = { id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pendiente', tipo: 'mensual', metodo: null, fecha_pago: null }
  r = await call(pagos.actualizar, { params: { id: 1 }, body: { monto: -100 } })
  verdict('U2', 'poner monto NEGATIVO a un cargo', r.code !== 400 || DB.Pagos[0].monto === -100, `HTTP ${r.code} monto=${DB.Pagos[0].monto}`)

  DB.Pagos[0] = { id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pendiente', tipo: 'mensual', metodo: null, fecha_pago: null }
  r = await call(pagos.actualizar, { params: { id: 1 }, body: { estado: 'pagado', monto: 1 } })
  verdict('U3', 'marcar PAGADO con monto rebajado a $1 sin dejar rastro del original — sigue posible (no hay abonos todavía, es mejora futura documentada)', r.code === 200, `HTTP ${r.code} monto=${DB.Pagos[0].monto} estado=${DB.Pagos[0].estado} — pendiente: sistema de abonos (roadmap)`)

  DB.Pagos[0] = { id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pagado', tipo: 'mensual', metodo: 'efectivo', fecha_pago: '2026-09-05T12:00:00Z' }
  r = await call(pagos.actualizar, { params: { id: 1 }, body: { estado: 'pendiente' } })
  verdict('U4', 'regresar un pago cobrado a "pendiente" deja metodo/fecha_pago viejos (dato contradictorio)', !!DB.Pagos[0].metodo || !!DB.Pagos[0].fecha_pago, `estado=${DB.Pagos[0].estado} metodo=${DB.Pagos[0].metodo} fecha_pago=${DB.Pagos[0].fecha_pago}`)

  r = await call(pagos.actualizar, { params: { id: 999 }, body: { estado: 'pagado' } })
  verdict('U5', 'actualizar un pago inexistente responde 500 en vez de 404', r.code !== 404, `HTTP ${r.code} "${r.body?.message}"`)

  DB.Pagos[0] = { id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pendiente', tipo: 'mensual', metodo: null, fecha_pago: null }
  const [x, y] = await Promise.all([
    call(pagos.actualizar, { params: { id: 1 }, body: { estado: 'pagado', metodo: 'efectivo', fecha_pago: new Date().toISOString(), monto: 1500 } }),
    call(pagos.actualizar, { params: { id: 1 }, body: { estado: 'pagado', metodo: 'transferencia', fecha_pago: new Date().toISOString(), monto: 1500 } })])
  verdict('U6', 'DOS encargadas registran el mismo pago a la vez, sin bloqueo optimista — sigue posible (roadmap: version/estado esperado)', x.code === 200 && y.code === 200, `ambas 200; metodo final="${DB.Pagos[0].metodo}" (última escritura gana)`)

  // ── ELIMINAR ──
  reset(); DB.Pagos.push({ id_pago: 5, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pagado', tipo: 'mensual', metodo: 'efectivo', fecha_pago: 'x' })
  r = await call(pagos.eliminar, { params: { id: 5 }, query: {} })
  verdict('D1', 'BORRAR un pago ya cobrado SIN confirmar', r.code !== 409, `HTTP ${r.code} "${r.body?.message}"; filas restantes=${DB.Pagos.length}`)

  r = await call(pagos.eliminar, { params: { id: 5 }, query: { force: 'true' } })
  console.log(`         (con ?force=true sí se puede borrar un pagado, a propósito: HTTP ${r.code}, filas=${DB.Pagos.length})`)

  r = await call(pagos.eliminar, { params: { id: 424242 }, query: {} })
  verdict('D2', 'borrar un id inexistente respondía "éxito" en vez de 404', r.code !== 404, `HTTP ${r.code} "${r.body?.message}"`)

  // ── GENERAR (manual) — bug de fondo: la consulta de "existentes" no filtraba tipo='mensual' ──
  reset()
  DB.Estudiantes.push({ id_estudiante: 2, activo: true, precio_mensual: 0 })
  DB.HorariosAlumnos.push({ id_estudiante: 1 }, { id_estudiante: 2 })
  DB.Pagos.push({ id_pago: 1, id_estudiante: 1, mes: '2026-10-01', monto: 500, estado: 'pendiente', tipo: 'ajuste' })
  r = await call(pagos.generar, { body: { mes: '2026-10-01' } })
  const mens1 = DB.Pagos.filter(p => p.id_estudiante === 1 && p.tipo === 'mensual').length
  verdict('G1', '/generar: alumno con un AJUSTE ese mes NO recibía su cargo mensual', mens1 === 0, `mensuales de alumno 1 = ${mens1} (ahora usa generarCargosFaltantes, que sí distingue por tipo)`)
  const cero = DB.Pagos.find(p => p.id_estudiante === 2 && p.tipo === 'mensual')
  verdict('G2', '/generar: alumno sin precio generaba cargo de $0', !!cero, `alumno 2 (precio=0) → ${cero ? 'SÍ se le creó cargo' : 'se omitió, reportado en omitidosSinPrecio'}: ${JSON.stringify(r.body?.omitidosSinPrecio)}`)

  // ── CRON ──
  reset()
  DB.Estudiantes.push({ id_estudiante: 2, nombre: 'B', activo: true, precio_mensual: 0 }, { id_estudiante: 3, nombre: 'C', activo: true, precio_mensual: 1500 })
  DB.HorariosAlumnos.push({ id_estudiante: 1 }, { id_estudiante: 2 })
  const ol = console.log, ow = console.warn; console.log = () => {}; console.warn = () => {}
  await cron.generarCargosMensuales()
  console.log = ol; console.warn = ow
  const gen = DB.Pagos.map(p => p.id_estudiante)
  verdict('K1', 'cron: alumno con clase pero precio $0 recibe cargo de todos modos', gen.includes(2), `cargos generados para ${JSON.stringify(gen)} (correcto: sin $2, sí #1 con horario, no #3 sin horario)`)
  verdict('K2', 'cron: alumno activo SIN clase se cobra igual (no debería)', gen.includes(3), `alumno 3 sin horario → ${gen.includes(3) ? 'SÍ se cobró (mal)' : 'sin cargo (correcto, por diseño)'}`)

  // ── Red de seguridad al arrancar: ahora es por-alumno, no "si existe alguno, no hago nada" ──
  reset()
  DB.Estudiantes.push({ id_estudiante: 2, nombre: 'B', activo: true, precio_mensual: 1500 })
  DB.HorariosAlumnos.push({ id_estudiante: 1 }, { id_estudiante: 2 })
  const mesSig = cargos.mesSiguienteISO()
  DB.Pagos.push({ id_pago: 1, id_estudiante: 1, mes: mesSig, monto: 1500, estado: 'pendiente', tipo: 'mensual' }) // alguien ya generó el del alumno 1 a mano
  const resGen = await cargos.generarCargosFaltantes(mesSig)
  const tieneAmbos = DB.Pagos.some(p => p.id_estudiante === 1 && p.mes === mesSig) && DB.Pagos.some(p => p.id_estudiante === 2 && p.mes === mesSig)
  verdict('K3', 'un cargo adelantado manual de UN alumno apagaba la generación para TODOS los demás', !tieneAmbos, `generados=${resGen.generados}; alumno 1 (ya tenía) y alumno 2 (le faltaba) → ambos con cargo=${tieneAmbos}`)

  const n = results.filter(x => x.siguerRoto).length
  console.log(`\nRESUMEN: ${n} hueco(s) siguen abiertos de ${results.length} pruebas`)
  process.exitCode = n > 0 ? 1 : 0
})()
