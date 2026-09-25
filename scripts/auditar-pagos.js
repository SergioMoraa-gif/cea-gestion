// ================================
// auditar-pagos.js
// Detector de inconsistencias en cargos/pagos. SOLO LECTURA: únicamente hace
// SELECT, nunca escribe, actualiza ni borra nada.
//
// Uso:  node scripts/auditar-pagos.js
// Sale con código 1 si encuentra algo que revisar (útil para correrlo a diario).
// ================================

require('dotenv').config()
const supabase = require('../src/config/db')

// Trae TODAS las filas paginando (PostgREST corta en 1000 por consulta).
async function todo(tabla) {
  let out = [], desde = 0
  for (;;) {
    const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out = out.concat(data)
    if (data.length < 1000) break
    desde += 1000
  }
  return out
}

// Mes actual y siguiente ('YYYY-MM') en hora de Ciudad de México.
function mesesCDMX() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const y = Number(p.find(x => x.type === 'year').value), m = Number(p.find(x => x.type === 'month').value)
  const sig = new Date(Date.UTC(y, m, 1))
  return [`${y}-${String(m).padStart(2, '0')}`, `${sig.getUTCFullYear()}-${String(sig.getUTCMonth() + 1).padStart(2, '0')}`]
}

async function main() {
  const [estudiantes, horarios, pagos] = await Promise.all([todo('Estudiantes'), todo('HorariosAlumnos'), todo('Pagos')])
  const estMap     = new Map(estudiantes.map(e => [e.id_estudiante, e]))
  const conHorario = new Set(horarios.map(h => h.id_estudiante))
  const activosConClase = estudiantes.filter(e => e.activo && conHorario.has(e.id_estudiante))
  let problemas = 0
  const reportar = (titulo, lista, fmt) => {
    if (lista.length === 0) { console.log(`✅ ${titulo}: 0`); return }
    problemas += lista.length
    console.log(`❌ ${titulo}: ${lista.length}`)
    lista.slice(0, 40).forEach(x => console.log('     ' + fmt(x)))
    if (lista.length > 40) console.log(`     … y ${lista.length - 40} más`)
  }

  console.log(`\nEstudiantes=${estudiantes.length}  Horarios=${horarios.length}  Pagos=${pagos.length}\n`)

  const [mesActual, mesSiguiente] = mesesCDMX()
  const diaHoy = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', day: '2-digit' }).format(new Date()))
  // El mes siguiente solo se revisa desde el día 26 (el cron corre el 25).
  const mesesARevisar = diaHoy >= 26 ? [mesActual, mesSiguiente] : [mesActual]
  for (const mes of mesesARevisar) {
    const tienen = new Set(pagos.filter(p => p.tipo === 'mensual' && (p.mes || '').startsWith(mes)).map(p => p.id_estudiante))
    reportar(`Alumnos activos con clase SIN cargo mensual de ${mes}`, activosConClase.filter(e => !tienen.has(e.id_estudiante)),
      e => `#${e.id_estudiante} ${e.nombre} (precio=${e.precio_mensual})`)
  }
  if (diaHoy < 26) console.log(`ℹ️  Cargos de ${mesSiguiente} aún no se revisan (el cron corre el día 25; se revisan desde el 26).\n`)

  reportar('Alumnos activos con clase y precio_mensual vacío/0 (el cron NO les genera cargo)',
    activosConClase.filter(e => !(e.precio_mensual > 0)), e => `#${e.id_estudiante} ${e.nombre}`)

  const malos = (titulo, f, fmt = p => `pago ${p.id_pago} alumno ${p.id_estudiante} ${p.tipo} ${p.mes || ''} $${p.monto} ${p.estado}`) =>
    reportar(titulo, pagos.filter(f), fmt)

  malos('Monto null / no numérico / negativo', p => p.monto == null || isNaN(Number(p.monto)) || Number(p.monto) < 0)
  malos('Cargos de $0', p => Number(p.monto) === 0)
  malos('Estado fuera de {pendiente, pagado, en_transito}', p => !['pendiente', 'pagado', 'en_transito'].includes(p.estado))
  malos('Tipo fuera de {mensual, ajuste, inscripcion, mantenimiento}', p => !['mensual', 'ajuste', 'inscripcion', 'mantenimiento'].includes(p.tipo))
  malos('Cobrado/en tránsito SIN método', p => p.estado !== 'pendiente' && !p.metodo)
  malos('Cobrado/en tránsito SIN fecha_pago', p => p.estado !== 'pendiente' && !p.fecha_pago)
  malos('Pendiente con método o fecha_pago (residuo de un cobro deshecho)', p => p.estado === 'pendiente' && (p.metodo || p.fecha_pago))
  malos('Mensual/ajuste sin mes', p => p.tipo !== 'inscripcion' && !p.mes)
  malos('Mes que no es día 1 (rompe la unicidad)', p => p.mes && !String(p.mes).endsWith('-01'))
  malos('Cargo de un alumno inexistente', p => !estMap.has(p.id_estudiante))
  malos('Cargo PENDIENTE de alumno dado de baja', p => p.estado === 'pendiente' && estMap.get(p.id_estudiante) && !estMap.get(p.id_estudiante).activo)
  malos('Mensual pendiente de alumno sin horario actual', p => p.tipo === 'mensual' && p.estado === 'pendiente' && !conHorario.has(p.id_estudiante))

  const conteo = {}
  pagos.filter(p => p.tipo === 'mensual').forEach(p => { const k = `${p.id_estudiante}|${p.mes}`; conteo[k] = (conteo[k] || 0) + 1 })
  reportar('Mensual duplicado (alumno+mes)', Object.entries(conteo).filter(([, c]) => c > 1), ([k, c]) => `${k} x${c}`)
  const ajustes = {}
  pagos.filter(p => p.tipo === 'ajuste').forEach(p => { const k = `${p.id_estudiante}|${p.mes}|${p.monto}`; ajustes[k] = (ajustes[k] || 0) + 1 })
  reportar('Ajustes idénticos repetidos (posible doble clic / F5)', Object.entries(ajustes).filter(([, c]) => c > 1), ([k, c]) => `${k} x${c}`)

  reportar('Horarios de alumnos inexistentes', horarios.filter(h => !estMap.has(h.id_estudiante)), h => `horario ${h.id_horario} alumno ${h.id_estudiante}`)

  // Límite de 1000 filas por consulta de PostgREST: pagos.js pide TODOS los pagos sin paginar.
  if (pagos.length > 800) {
    problemas++
    console.log(`❌ La tabla Pagos tiene ${pagos.length} filas; con 1000 la pantalla Pagos empezará a mostrar la lista TRUNCADA (sin aviso).`)
  } else {
    console.log(`✅ Pagos=${pagos.length} (límite de listado sin paginar: 1000)`)
  }

  console.log(problemas === 0 ? '\n✅ Sin hallazgos.' : `\n⚠️  ${problemas} hallazgo(s) para revisar.`)
  process.exitCode = problemas === 0 ? 0 : 1
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(2) })
