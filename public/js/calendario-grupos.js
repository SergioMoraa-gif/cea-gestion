// ================================
// calendario-grupos.js — CEA
// Tabla de grupos y matros por par de días
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const COLORES = ['color-0','color-1','color-2','color-3','color-4','color-5','color-6','color-7']

const PARES = [
  { label: 'LUNES Y MIÉRCOLES', dias: ['lunes', 'miercoles'], abrev: ['L', 'M'] },
  { label: 'MARTES Y JUEVES',   dias: ['martes', 'jueves'],   abrev: ['M', 'J'] },
  { label: 'VIERNES Y SÁBADO',  dias: ['viernes', 'sabado'],  abrev: ['V', 'S'] }
]

const DIAS_NOMBRE = {
  lunes: 'LUNES', martes: 'MARTES', miercoles: 'MIÉRCOLES',
  jueves: 'JUEVES', viernes: 'VIERNES', sabado: 'SÁBADO'
}

let maestrosData    = []
let estudiantesData = []
let horariosData    = []
let colorMap        = {}
let pendientesSet   = new Set()

// ─── Sidebar ─────────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => {
  sidebar.classList.add('open')
  sidebarBackdrop.classList.add('show')
})
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() {
  sidebar.classList.remove('open')
  sidebarBackdrop.classList.remove('show')
}
document.getElementById('btnLogout').addEventListener('click', () => {
  sessionStorage.clear()
  window.location.href = 'index.html'
})

// ─── Imprimir sección específica ──────────────────────────────
function imprimirSeccion(seccion, label) {
  document.getElementById('printHeaderDate').textContent =
    new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const secciones = document.querySelectorAll('.grupos-seccion')
  secciones.forEach(s => {
    if (s !== seccion) s.classList.add('ocultar-impresion')
  })

  const restaurar = () => {
    secciones.forEach(s => s.classList.remove('ocultar-impresion'))
    window.removeEventListener('afterprint', restaurar)
  }
  window.addEventListener('afterprint', restaurar)
  window.print()
}

// ─── Carga de datos ───────────────────────────────────────────
async function iniciar() {
  try {
    const [resMae, resEst, resHor] = await Promise.all([
      fetch('/api/maestros',        { headers }),
      fetch('/api/estudiantes',     { headers }),
      fetch('/api/horarios/global', { headers })
    ])

    if (!resMae.ok || !resEst.ok || !resHor.ok)
      throw new Error(`HTTP error: ${resMae.status} / ${resEst.status} / ${resHor.status}`)

    maestrosData    = ((await resMae.json()).maestros    || []).filter(m => m.activo !== false)
    estudiantesData = (await resEst.json()).estudiantes  || []
    horariosData    = (await resHor.json()).horarios     || []

    maestrosData.forEach((m, i) => { colorMap[m.id_maestro] = COLORES[i % COLORES.length] })

    // Pagos pendientes: no bloquea el render si falla
    try {
      const resPag = await fetch('/api/pagos?estado=pendiente', { headers })
      if (resPag.ok) {
        const pagos = (await resPag.json()).pagos || []
        pendientesSet = new Set(pagos.map(p => p.id_estudiante))
      }
    } catch { /* sin asteriscos si falla */ }

    renderGrupos()
  } catch (err) {
    console.error('calendario-grupos:', err)
    document.getElementById('loadingGrupos').textContent = `Error al cargar: ${err.message}`
  }
}

// ─── Render principal ─────────────────────────────────────────
function renderGrupos() {
  const container = document.getElementById('gruposScroll')
  container.innerHTML = ''

  // Solo clases grupales y matros
  const filtrado = horariosData.filter(h => h.tipo === 'grupal' || h.tipo === 'matros')

  if (filtrado.length === 0) {
    document.getElementById('loadingGrupos').textContent = 'No hay clases grupales ni matros registradas.'
    return
  }

  PARES.forEach(par => {
    const delPar = filtrado.filter(h => par.dias.includes(h.dia))
    if (delPar.length === 0) return

    // Agrupar por (maestro, hora, tipo) — cada combinación = una tarjeta
    const grupos = {}
    delPar.forEach(h => {
      const mId   = h.maestro_id || h.id_maestro
      const hora  = h.hora_inicio.slice(0, 5)
      const key   = `${mId}_${hora}_${h.tipo}`
      if (!grupos[key]) grupos[key] = { mId, hora, tipo: h.tipo, diasPresentes: new Set(), estudiantes: new Set() }
      grupos[key].diasPresentes.add(h.dia)
      const estId = h.estudiante_id || h.id_estudiante
      if (estId) grupos[key].estudiantes.add(estId)
    })

    // Ordenar por hora de inicio
    const sorted = Object.values(grupos).sort((a, b) => a.hora.localeCompare(b.hora))

    // ── Sección ──
    const seccion = document.createElement('div')
    seccion.className = 'grupos-seccion'

    const titulo = document.createElement('div')
    titulo.className = 'grupos-seccion-titulo'
    titulo.textContent = par.label

    const btnImpr = document.createElement('button')
    btnImpr.className = 'btn-imprimir-seccion'
    btnImpr.title     = `Imprimir ${par.label}`
    btnImpr.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir`
    btnImpr.addEventListener('click', () => imprimirSeccion(seccion, par.label))

    titulo.appendChild(btnImpr)
    seccion.appendChild(titulo)

    const grid = document.createElement('div')
    grid.className = 'grupos-grid'

    sorted.forEach(g => {
      const maestro    = maestrosData.find(m => m.id_maestro === g.mId)
      const colorClass = colorMap[g.mId] || 'color-0'

      // Etiqueta de día: par completo o día específico
      const diasArr = par.dias.filter(d => g.diasPresentes.has(d))
      const diaLabel = diasArr.length >= 2
        ? `(${par.abrev[0]} Y ${par.abrev[1]})`
        : (DIAS_NOMBRE[diasArr[0]] || '')

      const tipoLabel  = g.tipo === 'matros' ? 'MATRO' : 'GRUPAL'
      const maestroNom = maestro ? maestro.nombre.split(' ')[0].toUpperCase() : '?'

      // ── Tarjeta ──
      const card = document.createElement('div')
      card.className = 'grupo-card'

      const header = document.createElement('div')
      header.className   = 'grupo-card-header'
      header.textContent = `${tipoLabel} ${diaLabel} ${g.hora} ${maestroNom}`
      card.appendChild(header)

      const rowsDiv = document.createElement('div')
      rowsDiv.className = `grupo-card-rows ${colorClass}`

      // Filas de alumnos
      const MIN_ROWS = 6
      let rowCount = 0

      g.estudiantes.forEach(estId => {
        const est  = estudiantesData.find(e => e.id_estudiante === estId)
        const row  = document.createElement('div')
        row.className = 'grupo-card-row'

        const hasPendiente = pendientesSet.has(estId)
        const nombreText   = est ? est.nombre.split(' ')[0].toUpperCase() : '?'
        const folioText    = est && est.folio ? est.folio : ''
        const asterisco    = hasPendiente ? ' <span class="grupo-row-asterisco">*</span>' : ''

        row.innerHTML =
          `<span class="grupo-row-nombre">${nombreText}</span>` +
          `<span class="grupo-row-folio">${folioText}${asterisco}</span>`

        rowsDiv.appendChild(row)
        rowCount++
      })

      // Filas vacías para completar el mínimo visual
      while (rowCount < MIN_ROWS) {
        const emptyRow = document.createElement('div')
        emptyRow.className = 'grupo-card-row grupo-card-row-empty'
        rowsDiv.appendChild(emptyRow)
        rowCount++
      }

      card.appendChild(rowsDiv)
      grid.appendChild(card)
    })

    seccion.appendChild(grid)
    container.appendChild(seccion)
  })

  document.getElementById('loadingGrupos').style.display = 'none'
  container.style.display = 'block'
}

iniciar()
