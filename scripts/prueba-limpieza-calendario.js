// Pruebas de regresión para:
//  1) horarios.controller.js: al asignar una clase se genera el cargo del
//     mes automáticamente (aunque nadie pase por el modal del perfil).
//  2) calendario.controller.js: el botón "Limpiar calendario" — exige la
//     frase exacta, borra horarios y pagos sin cobrar, conserva pagados.
// Usa una BD FALSA en memoria; nunca toca Supabase. El respaldo en disco
// sí se escribe de verdad (en backups/) y se borra al final de la prueba.

const Module = require('module')
const fs     = require('fs')
const path   = require('path')
const ROOT   = path.resolve(__dirname, '..').split(path.sep).join('/')

const DB = { Pagos: [], Estudiantes: [], HorariosAlumnos: [] }
let seq = 1000

function builder(tabla) {
  const st = { op: 'select', filters: [], rows: null, patch: null, single: false, head: false }
  const b = {
    select(_c, o) { if (st.op !== 'insert' && st.op !== 'update' && st.op !== 'delete') st.op = 'select'; if (o && o.head) st.head = true; return b },
    insert(rows) { st.op = 'insert'; st.rows = rows; return b },
    update(p) { st.op = 'update'; st.patch = p; return b },
    delete() { st.op = 'delete'; return b },
    eq(k, v)  { st.filters.push(r => String(r[k]) === String(v)); return b },
    neq(k, v) { st.filters.push(r => String(r[k]) !== String(v)); return b },
    in(k, arr) { st.filters.push(r => arr.includes(r[k])); return b },
    or() { return b }, order() { return b }, limit() { return b },
    single() { st.single = true; return b },
    then(res, rej) { return run().then(res, rej) },
  }
  async function run() {
    const T = DB[tabla]
    const match = r => st.filters.every(f => f(r))
    if (st.op === 'select') {
      const d = T.filter(match)
      if (st.head) return { data: null, count: d.length, error: null }
      if (st.single) return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: 'no rows' } }
      return { data: d, error: null }
    }
    if (st.op === 'insert') {
      const out = []
      for (const r of st.rows) {
        if (tabla === 'Pagos' && r.tipo === 'mensual' && T.some(x => x.tipo === 'mensual' && x.id_estudiante === r.id_estudiante && x.mes === r.mes))
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        const row = { id_pago: ++seq, id_horario: ++seq, fecha_creacion: new Date().toISOString(), metodo: null, fecha_pago: null, notas: null, ...r }
        T.push(row); out.push(row)
      }
      return st.single ? { data: out[0], error: null } : { data: out, error: null }
    }
    if (st.op === 'update') {
      const d = T.filter(match); d.forEach(r => Object.assign(r, st.patch))
      return st.single ? (d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: 'no rows' } }) : { data: d, error: null }
    }
    if (st.op === 'delete') {
      const d = T.filter(match); DB[tabla] = T.filter(r => !match(r)); return { data: d, error: null }
    }
  }
  return b
}
const fake = { from: builder, auth: {} }
const dbPath = path.resolve(ROOT, 'src/config/db.js')
const orig = Module._load
Module._load = function (req, parent, ...r) {
  if (req.endsWith('config/db') && parent && path.resolve(path.dirname(parent.filename), req).replace(/\.js$/, '') === dbPath.replace(/\.js$/, '')) return fake
  return orig.call(this, req, parent, ...r)
}
const horarios   = require(ROOT + '/src/controllers/horarios.controller')
const calendario = require(ROOT + '/src/controllers/calendario.controller')

const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r }, json(b) { r.body = b; return r } }; return r }
async function call(fn, { body = {}, params = {}, query = {} } = {}) { const res = mkRes(); await fn({ body, params, query }, res); return res }

const results = []
function verdict(id, titulo, ok, detalle) { results.push({ id, ok }); console.log(`${ok ? '🟢 OK' : '🔴 FALLA'} ${id} ${titulo}\n         ${detalle}`) }

;(async () => {
  // ── 1) Auto-generación de cargo al asignar horario ──
  DB.Estudiantes = [{ id_estudiante: 1, precio_mensual: 1500, activo: true }, { id_estudiante: 2, precio_mensual: 0, activo: true }]
  DB.HorariosAlumnos = []; DB.Pagos = []

  let r = await call(horarios.crear, { body: { estudiante_id: 1, maestro_id: 9, dia: 'lunes', hora_inicio: '10:00', hora_fin: '10:30', tipo: 'individual', duracion: 30, alberca: 1 } })
  const cargo1 = DB.Pagos.find(p => p.id_estudiante === 1 && p.tipo === 'mensual')
  verdict('H1', 'asignar clase a alumno CON precio genera su cargo mensual solo', r.code === 201 && !!cargo1, `HTTP ${r.code}; cargo=${JSON.stringify(cargo1)}`)

  r = await call(horarios.crear, { body: { estudiante_id: 2, maestro_id: 9, dia: 'lunes', hora_inicio: '11:00', hora_fin: '11:30', tipo: 'individual', duracion: 30, alberca: 1 } })
  const cargo2 = DB.Pagos.find(p => p.id_estudiante === 2 && p.tipo === 'mensual')
  verdict('H2', 'asignar clase a alumno SIN precio no crea cargo de $0 y avisa en la respuesta', r.code === 201 && !cargo2 && !!r.body.cargoAviso, `HTTP ${r.code}; cargo=${cargo2}; aviso="${r.body.cargoAviso}"`)

  // Segunda clase al mismo alumno el mismo mes: no debe duplicar el cargo
  r = await call(horarios.crear, { body: { estudiante_id: 1, maestro_id: 9, dia: 'martes', hora_inicio: '10:00', hora_fin: '10:30', tipo: 'individual', duracion: 30, alberca: 1 } })
  const cargosAlumno1 = DB.Pagos.filter(p => p.id_estudiante === 1 && p.tipo === 'mensual')
  verdict('H3', 'una segunda clase el mismo mes NO duplica el cargo mensual', cargosAlumno1.length === 1, `cargos mensuales del alumno 1 = ${cargosAlumno1.length}`)

  // ── 2) Limpiar calendario ──
  DB.Estudiantes = [{ id_estudiante: 1, nombre: 'A', activo: true }]
  DB.HorariosAlumnos = [{ id_horario: 1, id_estudiante: 1 }, { id_horario: 2, id_estudiante: 1 }]
  DB.Pagos = [
    { id_pago: 1, id_estudiante: 1, mes: '2026-09-01', monto: 1500, estado: 'pendiente',   tipo: 'mensual' },
    { id_pago: 2, id_estudiante: 1, mes: '2026-08-01', monto: 1500, estado: 'pagado',       tipo: 'mensual' },
    { id_pago: 3, id_estudiante: 1, mes: '2026-07-01', monto: 500,  estado: 'en_transito',  tipo: 'ajuste' }
  ]

  r = await call(calendario.limpiarCalendario, { body: { confirmacion: 'algo distinto' } })
  verdict('L1', 'rechaza confirmación que no es exactamente la frase', r.code === 400 && DB.HorariosAlumnos.length === 2, `HTTP ${r.code} "${r.body?.message}"`)

  r = await call(calendario.limpiarCalendario, { body: { confirmacion: 'LIMPIAR CALENDARIO' } })
  const soloQuedaPagado = DB.Pagos.length === 1 && DB.Pagos[0].estado === 'pagado'
  verdict('L2', 'con la frase correcta: borra TODOS los horarios', r.code === 200 && DB.HorariosAlumnos.length === 0, `HTTP ${r.code}; horarios restantes=${DB.HorariosAlumnos.length}`)
  verdict('L3', 'borra pendiente + en_transito, conserva el pagado', soloQuedaPagado, `pagos restantes=${JSON.stringify(DB.Pagos)}`)
  verdict('L4', 'respuesta trae conteos correctos', r.body.horariosEliminados === 2 && r.body.pagosEliminados === 2, `body=${JSON.stringify(r.body)}`)
  verdict('L5', 'el alumno NO se borra (solo se le quita del calendario)', DB.Estudiantes.length === 1, `estudiantes restantes=${DB.Estudiantes.length}`)

  // Limpiar el respaldo que sí se escribió en disco durante esta prueba.
  if (r.body && r.body.respaldoEn && fs.existsSync(r.body.respaldoEn)) {
    fs.rmSync(r.body.respaldoEn, { recursive: true, force: true })
    console.log(`\n(respaldo de prueba borrado: ${r.body.respaldoEn})`)
  }

  const fallas = results.filter(x => !x.ok).length
  console.log(`\nRESUMEN: ${fallas} falla(s) de ${results.length} pruebas`)
  process.exitCode = fallas > 0 ? 1 : 0
})()
