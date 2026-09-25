// ================================
// calendario.controller.js
// CEA Sistema de Gestión — Limpieza total del calendario (botón de reinicio)
//
// Pensado para el arranque de un periodo nuevo (ej. octubre): quita a todos
// los alumnos del calendario (borra HorariosAlumnos) y borra los cargos que
// aún no se cobraron (pendiente / en_transito, de CUALQUIER mes, incluidos
// meses anteriores). Los cargos ya PAGADOS se conservan siempre — es
// historial de dinero que sí entró. Los alumnos (tabla Estudiantes) no se
// tocan: solo se les quita la clase del calendario.
// ================================

const fs       = require('fs')
const path     = require('path')
const supabase = require('../config/db')

const FRASE_CONFIRMACION = 'LIMPIAR CALENDARIO'

async function contarParaLimpieza() {
  const [{ count: horarios }, { count: pendientes }, { count: pagados }] = await Promise.all([
    supabase.from('HorariosAlumnos').select('*', { count: 'exact', head: true }),
    supabase.from('Pagos').select('*', { count: 'exact', head: true }).neq('estado', 'pagado'),
    supabase.from('Pagos').select('*', { count: 'exact', head: true }).eq('estado', 'pagado')
  ])
  return {
    horarios:        horarios    || 0,
    pagosABorrar:     pendientes || 0, // pendiente + en_transito, de cualquier mes
    pagosConservados: pagados    || 0  // pagado: se mantiene siempre
  }
}

// GET /api/calendario/limpiar/preview — qué se va a borrar, sin borrar nada
async function previsualizarLimpieza(_req, res) {
  try {
    const resumen = await contarParaLimpieza()
    res.json({ ...resumen, fraseConfirmacion: FRASE_CONFIRMACION })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/calendario/limpiar — body: { confirmacion: "LIMPIAR CALENDARIO" }
async function limpiarCalendario(req, res) {
  const { confirmacion } = req.body
  if (confirmacion !== FRASE_CONFIRMACION)
    return res.status(400).json({ message: `Escribe exactamente "${FRASE_CONFIRMACION}" para confirmar.` })

  try {
    // 1) Respaldo de lo que se va a borrar, antes de tocar nada.
    const [{ data: horarios, error: errHor }, { data: pagosABorrar, error: errPag }] = await Promise.all([
      supabase.from('HorariosAlumnos').select('*'),
      supabase.from('Pagos').select('*').neq('estado', 'pagado')
    ])
    if (errHor) return res.status(500).json({ message: errHor.message })
    if (errPag) return res.status(500).json({ message: errPag.message })

    const carpeta = path.join(__dirname, '..', '..', 'backups', 'limpieza-calendario', timestamp())
    fs.mkdirSync(carpeta, { recursive: true })
    fs.writeFileSync(path.join(carpeta, 'HorariosAlumnos.json'), JSON.stringify(horarios || [], null, 2), 'utf-8')
    fs.writeFileSync(path.join(carpeta, 'Pagos_pendientes_borrados.json'), JSON.stringify(pagosABorrar || [], null, 2), 'utf-8')

    // 2) Borrar todo el calendario (todos los alumnos quedan sin clase).
    //    neq con un valor imposible = "borra todas las filas" (delete() de
    //    supabase-js exige al menos un filtro).
    const { error: errDelHor } = await supabase.from('HorariosAlumnos').delete().neq('id_horario', -1)
    if (errDelHor) return res.status(500).json({ message: errDelHor.message, respaldoEn: carpeta })

    // 3) Borrar cargos sin cobrar (pendiente + en_transito), de cualquier
    //    mes. Los pagados NUNCA se tocan.
    const { error: errDelPag } = await supabase.from('Pagos').delete().neq('estado', 'pagado')
    if (errDelPag) return res.status(500).json({ message: errDelPag.message, respaldoEn: carpeta })

    res.json({
      message: 'Calendario limpiado.',
      horariosEliminados: (horarios || []).length,
      pagosEliminados:     (pagosABorrar || []).length,
      respaldoEn: carpeta
    })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

function timestamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

module.exports = { previsualizarLimpieza, limpiarCalendario }
