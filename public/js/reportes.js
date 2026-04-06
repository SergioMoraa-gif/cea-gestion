// ================================
// reportes.js — CEA Sistema de Gestión
// Refactorizado: esquema nuevo
// id → id_maestro, id → id_estudiante, id → id_clase, id → id_pago
// El filtro de maestro usa id_maestro aplanado desde el controller de estudiantes
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

let estudiantesData = []
let clasesData      = []
let maestrosData    = []
let pagosData       = []

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Mes por defecto ---
const hoy = new Date()
document.getElementById('filtroMes').value = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`

// --- Cargar datos base ---
async function cargarDatos() {
  try {
    const [resEst, resClases, resMaestros] = await Promise.all([
      fetch('/api/estudiantes', { headers }),
      fetch('/api/clases',      { headers }),
      fetch('/api/maestros',    { headers })
    ])
    estudiantesData = (await resEst.json()).estudiantes   || []
    clasesData      = (await resClases.json()).clases     || []
    maestrosData    = (await resMaestros.json()).maestros || []

    const sel = document.getElementById('filtroMaestro')
    maestrosData.filter(m => m.activo !== false).forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro; opt.textContent = m.nombre   // ← id_maestro
      sel.appendChild(opt)
    })
  } catch (err) { console.error('Error cargando datos:', err) }
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

  if (mes) {
    const [anio, mesNum] = mes.split('-')
    document.getElementById('subtituloReporte').textContent = `${MESES[parseInt(mesNum)-1]} ${anio}`
  }

  try {
    const params = new URLSearchParams()
    if (mes)     params.set('mes', mes)
    if (estadoF) params.set('estado', estadoF)

    const res  = await fetch(`/api/pagos?${params}`, { headers })
    const data = await res.json()
    pagosData  = data.pagos || []

    // Filtro por maestro (local)
    // estudiantesData ya trae id_maestro aplanado desde el controller
    let lista = pagosData
    if (maestroF) lista = lista.filter(p => {
      const est = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)
      return est && String(est.id_maestro) === maestroF
    })

    loadingMsg.style.display = 'none'

    // Totales
    let cobrado = 0, pendiente = 0, transito = 0
    lista.forEach(p => {
      if (p.estado === 'pagado')      cobrado   += Number(p.monto)
      if (p.estado === 'pendiente')   pendiente += Number(p.monto)
      if (p.estado === 'en_transito') transito  += Number(p.monto)
    })

    document.getElementById('rCobrado').textContent   = `$${cobrado.toLocaleString('es-MX')}`
    document.getElementById('rPendiente').textContent = `$${pendiente.toLocaleString('es-MX')}`
    document.getElementById('rTransito').textContent  = `$${transito.toLocaleString('es-MX')}`
    document.getElementById('rTotal').textContent     = lista.length

    if (lista.length === 0) { emptyMsg.style.display = 'block'; return }
    tablaWrapper.style.display = 'block'

    lista.forEach((p, i) => {
      const est     = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)
      const clase   = clasesData.find(c => c.id_clase === p.id_clase)
      const maestro = maestrosData.find(m => m.id_maestro === (est ? est.id_maestro : null))
      const fechaPago = p.fecha_pago
        ? new Date(p.fecha_pago).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
        : '—'
      const metodLabel = p.metodo === 'transferencia' ? 'Transferencia' : p.metodo === 'efectivo' ? 'Efectivo' : '—'

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td style="color:rgba(255,255,255,.4);font-size:.75rem">${i+1}</td>
        <td><strong>${est ? est.nombre : '—'}</strong></td>
        <td>${clase ? clase.nombre : '—'}</td>
        <td>${maestro ? maestro.nombre : '—'}</td>
        <td><strong>$${Number(p.monto).toLocaleString('es-MX')}</strong></td>
        <td>${metodLabel}</td>
        <td style="font-size:.78rem">${fechaPago}</td>
        <td>${badgeEstado(p.estado)}</td>
      `
      body.appendChild(tr)
    })

    const totalGeneral = cobrado + pendiente + transito
    foot.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:right">Total general:</td>
        <td><strong>$${totalGeneral.toLocaleString('es-MX')}</strong></td>
        <td colspan="3"></td>
      </tr>
    `

  } catch (err) {
    loadingMsg.textContent = 'Error al cargar el reporte.'
  }
}

function badgeEstado(estado) {
  const map = {
    pagado:      ['badge-pagado',     'dot-pagado',     'Pagado'],
    pendiente:   ['badge-pendiente',  'dot-pendiente',  'Pendiente'],
    en_transito: ['badge-en_transito','dot-en_transito','En tránsito']
  }
  const [cls, dot, label] = map[estado] || map.pendiente
  return `<span class="badge-estado ${cls}"><span class="dot-badge ${dot}"></span>${label}</span>`
}

// --- Imprimir ---
document.getElementById('btnImprimir').addEventListener('click', () => window.print())

// --- Filtros ---
document.getElementById('filtroMes').addEventListener('change',     cargarReporte)
document.getElementById('filtroMaestro').addEventListener('change', cargarReporte)
document.getElementById('filtroEstado').addEventListener('change',  cargarReporte)

// --- Iniciar ---
cargarDatos().then(() => cargarReporte())
