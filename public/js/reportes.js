// ================================
// reportes.js — CEA Sistema de Gestión
// Reporte mensual de pagos con horarios reales
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

let estudiantesData = []
let maestrosData    = []
let horariosData    = []   // todos los horarios (para cruzar maestro ↔ alumno)
let pagosData       = []
let listaFiltrada   = []   // para exportar CSV

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Mes por defecto (mes actual) ---
const hoy = new Date()
document.getElementById('filtroMes').value =
  `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`

// --- Cargar datos base (una sola vez) ---
async function cargarDatos() {
  try {
    const [resEst, resMae, resHor] = await Promise.all([
      fetch('/api/estudiantes', { headers }),
      fetch('/api/maestros',    { headers }),
      fetch('/api/horarios/estudiante/todos', { headers }).catch(() => ({ ok: false }))
    ])

    estudiantesData = (await resEst.json()).estudiantes   || []
    maestrosData    = (await resMae.json()).maestros      || []

    // Si el endpoint de "todos los horarios" no existe, cargamos por cada estudiante
    // de forma diferida al primer reporte. Por ahora intentamos la ruta general.
    if (resHor.ok) {
      const dh = await resHor.json()
      horariosData = dh.horarios || []
    }

    // Llenar selector de maestros
    const sel = document.getElementById('filtroMaestro')
    maestrosData.filter(m => m.activo !== false).forEach(m => {
      const opt = document.createElement('option')
      opt.value       = m.id_maestro
      opt.textContent = m.nombre
      sel.appendChild(opt)
    })
  } catch (err) {
    console.error('Error cargando datos base:', err)
  }
}

// Obtener los horarios de todos los alumnos que aparecen en los pagos del mes
async function asegurarHorarios(idsEstudiante) {
  const faltantes = idsEstudiante.filter(id =>
    !horariosData.some(h => h.id_estudiante === id || h.estudiante_id === id)
  )
  if (faltantes.length === 0) return

  try {
    const peticiones = faltantes.map(id =>
      fetch(`/api/horarios/estudiante/${id}`, { headers })
        .then(r => r.json())
        .then(d => d.horarios || [])
    )
    const resultados = await Promise.all(peticiones)
    resultados.forEach(lista => { horariosData = horariosData.concat(lista) })
  } catch (err) {
    console.error('Error cargando horarios:', err)
  }
}

// --- Cargar reporte ---
async function cargarReporte() {
  const loadingMsg   = document.getElementById('loadingMsg')
  const emptyMsg     = document.getElementById('emptyMsg')
  const tablaWrapper = document.getElementById('tablaWrapper')
  const body         = document.getElementById('tablaBody')
  const foot         = document.getElementById('tablaFoot')

  body.innerHTML = ''
  foot.innerHTML = ''
  loadingMsg.style.display   = 'block'
  emptyMsg.style.display     = 'none'
  tablaWrapper.style.display = 'none'

  const mes      = document.getElementById('filtroMes').value
  const maestroF = document.getElementById('filtroMaestro').value
  const estadoF  = document.getElementById('filtroEstado').value

  // Actualizar subtítulo
  if (mes) {
    const [anio, mesNum] = mes.split('-')
    document.getElementById('subtituloReporte').textContent =
      `${MESES[parseInt(mesNum)-1]} ${anio}`
  }

  try {
    // Traer pagos del mes (y estado si aplica)
    const params = new URLSearchParams()
    if (mes)     params.set('mes', mes)
    if (estadoF) params.set('estado', estadoF)

    const res = await fetch(`/api/pagos?${params}`, { headers })
    if (!res.ok) throw new Error('Error en la API de pagos')
    const data = await res.json()
    pagosData = data.pagos || []

    // Asegurar que tenemos los horarios de todos los alumnos en estos pagos
    const idsEst = [...new Set(pagosData.map(p => p.id_estudiante))]
    await asegurarHorarios(idsEst)

    // Construir mapa estudiante → maestros asignados
    // { id_estudiante: [{ id_maestro, nombre }] }
    const maestrosPorEst = {}
    horariosData.forEach(h => {
      const estId  = h.id_estudiante || h.estudiante_id
      const maeId  = h.id_maestro   || h.maestro_id
      if (!estId || !maeId) return
      if (!maestrosPorEst[estId]) maestrosPorEst[estId] = new Set()
      maestrosPorEst[estId].add(maeId)
    })

    // Filtro por maestro (local, usando horarios)
    let lista = pagosData
    if (maestroF) {
      lista = lista.filter(p => {
        const mSet = maestrosPorEst[p.id_estudiante]
        return mSet && mSet.has(parseInt(maestroF))
      })
    }

    listaFiltrada = lista   // guardar para CSV

    loadingMsg.style.display = 'none'

    // --- Totales ---
    let cobrado = 0, pendiente = 0, transito = 0
    lista.forEach(p => {
      const m = Number(p.monto) || 0
      if (p.estado === 'pagado')      cobrado   += m
      if (p.estado === 'pendiente')   pendiente += m
      if (p.estado === 'en_transito') transito  += m
    })

    document.getElementById('rCobrado').textContent   = `$${cobrado.toLocaleString('es-MX')}`
    document.getElementById('rPendiente').textContent = `$${pendiente.toLocaleString('es-MX')}`
    document.getElementById('rTransito').textContent  = `$${transito.toLocaleString('es-MX')}`
    document.getElementById('rTotal').textContent     = lista.length
    document.getElementById('rTotalMes').textContent  =
      `$${(cobrado + pendiente + transito).toLocaleString('es-MX')}`

    if (lista.length === 0) { emptyMsg.style.display = 'block'; return }
    tablaWrapper.style.display = 'block'

    // --- Filas ---
    lista.forEach((p, i) => {
      const est = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)

      // Maestros asignados al alumno
      const mSet     = maestrosPorEst[p.id_estudiante] || new Set()
      const maestros = [...mSet].map(mid => {
        const m = maestrosData.find(x => x.id_maestro === mid)
        return m ? m.nombre : `#${mid}`
      })

      // Clases por semana (bloques únicos de horario)
      const clasesAlumno = horariosData.filter(h =>
        (h.id_estudiante || h.estudiante_id) === p.id_estudiante
      )
      const clasesLabel = clasesAlumno.length > 0
        ? `${clasesAlumno.length} bloque${clasesAlumno.length !== 1 ? 's' : ''}`
        : '—'

      const fechaPago = p.fecha_pago
        ? new Date(p.fecha_pago).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
        : '—'
      const metodLabel = p.metodo === 'transferencia' ? 'Transferencia'
                       : p.metodo === 'efectivo'      ? 'Efectivo'
                       : p.metodo || '—'

      const esInscripcion = p.tipo === 'inscripcion'
      const esAjuste      = p.tipo === 'ajuste'

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="col-num">${i + 1}</td>
        <td>
          <a class="link-perfil" href="perfil-estudiante.html?id=${p.id_estudiante}">
            <strong>${est ? est.nombre : '—'}</strong>
          </a>
          ${esInscripcion ? '<br><span style="font-size:.7rem;opacity:.6;font-style:italic">Inscripción</span>' : ''}
          ${esAjuste      ? '<br><span style="font-size:.7rem;opacity:.6;font-style:italic">Ajuste</span>'      : ''}
        </td>
        <td class="col-folio">${est ? (est.folio || '—') : '—'}</td>
        <td class="col-maestros">${(esInscripcion || esAjuste) ? '—' : (maestros.length > 0 ? maestros.join(', ') : '—')}</td>
        <td class="col-clases">${(esInscripcion || esAjuste)   ? '—' : clasesLabel}</td>
        <td><strong>$${Number(p.monto || 0).toLocaleString('es-MX')}</strong></td>
        <td>${metodLabel}</td>
        <td class="col-fecha">${fechaPago}</td>
        <td>${badgeEstado(p.estado)}</td>
      `
      body.appendChild(tr)
    })

    // --- Pie de tabla ---
    const totalGeneral = cobrado + pendiente + transito
    foot.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:right;padding-right:1rem">Total general:</td>
        <td><strong>$${totalGeneral.toLocaleString('es-MX')}</strong></td>
        <td colspan="3"></td>
      </tr>
    `

  } catch (err) {
    loadingMsg.style.display = 'block'
    loadingMsg.textContent   = 'Error al cargar el reporte.'
    console.error(err)
  }
}

function badgeEstado(estado) {
  const map = {
    pagado:      ['badge-pagado',      'dot-pagado',      'Pagado'],
    pendiente:   ['badge-pendiente',   'dot-pendiente',   'Pendiente'],
    en_transito: ['badge-en_transito', 'dot-en_transito', 'En tránsito']
  }
  const [cls, dot, label] = map[estado] || map.pendiente
  return `<span class="badge-estado ${cls}"><span class="dot-badge ${dot}"></span>${label}</span>`
}

// --- Descargar CSV ---
document.getElementById('btnDescargar').addEventListener('click', () => {
  if (listaFiltrada.length === 0) return alert('No hay datos para exportar.')

  const mes = document.getElementById('filtroMes').value || 'reporte'
  const filas = [
    ['#', 'Alumno', 'Folio', 'Monto', 'Método', 'Fecha pago', 'Estado'],
    ...listaFiltrada.map((p, i) => {
      const est       = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)
      const fechaPago = p.fecha_pago
        ? new Date(p.fecha_pago).toLocaleDateString('es-MX')
        : ''
      return [
        i + 1,
        est ? est.nombre : '',
        est ? (est.folio || '') : '',
        Number(p.monto || 0).toFixed(2),
        p.metodo || '',
        fechaPago,
        p.estado || ''
      ]
    })
  ]

  const csv = filas.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `reporte-${mes}.csv`
  a.click()
  URL.revokeObjectURL(url)
})

// --- Imprimir ---
document.getElementById('btnImprimir').addEventListener('click', () => window.print())

// --- Filtros ---
document.getElementById('filtroMes').addEventListener('change',     cargarReporte)
document.getElementById('filtroMaestro').addEventListener('change', cargarReporte)
document.getElementById('filtroEstado').addEventListener('change',  cargarReporte)

// --- Iniciar ---
cargarDatos().then(() => cargarReporte())
