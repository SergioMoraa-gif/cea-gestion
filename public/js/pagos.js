// ================================
// pagos.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

let estudiantesData    = []
let maestrosData       = []
let pagosData          = []
let pagoEditandoId     = null
let pagoEliminandoId   = null
let estadoSeleccionado = 'pagado'

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Cargar datos base ---
async function cargarDatos() {
  try {
    const [resEst, resMaestros] = await Promise.all([
      fetch('/api/estudiantes', { headers }),
      fetch('/api/maestros',    { headers })
    ])
    estudiantesData = (await resEst.json()).estudiantes    || []
    maestrosData    = (await resMaestros.json()).maestros  || []

    const sel = document.getElementById('filtroMaestro')
    maestrosData.filter(m => m.activo !== false).forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro
      opt.textContent = m.nombre
      sel.appendChild(opt)
    })
  } catch (err) { console.error('Error cargando datos base:', err) }
}

// --- Cargar pagos ---
async function cargarPagos() {
  const loadingMsg   = document.getElementById('loadingMsg')
  const emptyMsg     = document.getElementById('emptyMsg')
  const tablaWrapper = document.getElementById('tablaWrapper')
  const body         = document.getElementById('tablaBody')

  body.innerHTML = ''
  loadingMsg.style.display   = 'block'
  emptyMsg.style.display     = 'none'
  tablaWrapper.style.display = 'none'

  const estado   = document.getElementById('filtroEstado').value
  const busqueda = document.getElementById('filtroBuscar').value.toLowerCase()

  try {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)

    const res = await fetch(`/api/pagos?${params}`, { headers })
    pagosData = (await res.json()).pagos || []

    // Filtro local por nombre
    let lista = pagosData
    if (busqueda) lista = lista.filter(p => {
      const est = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)
      return est && est.nombre.toLowerCase().includes(busqueda)
    })

    loadingMsg.style.display = 'none'
    if (lista.length === 0) { emptyMsg.style.display = 'block'; return }
    tablaWrapper.style.display = 'block'

    lista.forEach(p => {
      const est      = estudiantesData.find(e => e.id_estudiante === p.id_estudiante)
      const fechaMes = p.mes ? new Date(p.mes + 'T12:00:00') : null
      const mesLabel = fechaMes ? `${MESES[fechaMes.getMonth()]} ${fechaMes.getFullYear()}` : '—'
      const metodLabel = p.metodo === 'transferencia' ? 'Transferencia' : p.metodo === 'efectivo' ? 'Efectivo' : '—'

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>
          <strong>${est ? est.nombre : '—'}</strong>
          ${est && est.folio ? `<br><span style="font-size:.7rem;opacity:.5">Folio ${est.folio}</span>` : ''}
        </td>
        <td>${mesLabel}</td>
        <td><strong>$${Number(p.monto).toLocaleString('es-MX')}</strong></td>
        <td>${metodLabel}</td>
        <td>${badgeEstado(p.estado)}</td>
        <td>
          <div class="acciones">
            <button class="btn-accion ${p.estado === 'pendiente' ? 'btn-accion-pagar' : 'btn-accion-editar'}"
              onclick="abrirModalPago(${p.id_pago})">
              ${p.estado === 'pendiente' ? 'Registrar pago' : 'Editar'}
            </button>
            ${p.estado !== 'pendiente'
              ? `<button class="btn-accion btn-accion-recibo" onclick="generarRecibo(${p.id_pago})">Recibo</button>`
              : ''}
            <button class="btn-accion btn-accion-eliminar" onclick="confirmarEliminar(${p.id_pago})" title="Eliminar cargo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>`
      body.appendChild(tr)
    })

  } catch (err) {
    loadingMsg.textContent = 'Error al cargar pagos.'
    console.error(err)
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

// --- Modal registrar/editar pago ---
function abrirModalPago(id) {
  const pago = pagosData.find(p => p.id_pago === id)
  if (!pago) return

  pagoEditandoId     = id
  estadoSeleccionado = pago.estado || 'pagado'

  const est      = estudiantesData.find(e => e.id_estudiante === pago.id_estudiante)
  const fechaMes = pago.mes ? new Date(pago.mes + 'T12:00:00') : null
  const mesLabel = fechaMes ? `${MESES[fechaMes.getMonth()]} ${fechaMes.getFullYear()}` : '—'

  document.getElementById('modalPagoTitulo').textContent = pago.estado === 'pendiente' ? 'Registrar pago' : 'Editar pago'
  document.getElementById('modalPagoSub').textContent    = `${est ? est.nombre : '—'} · ${mesLabel}`
  document.getElementById('pagoMonto').value             = pago.monto  || ''
  document.getElementById('pagoMetodo').value            = pago.metodo || ''
  document.getElementById('pagoNotas').value             = pago.notas  || ''
  document.getElementById('pagoFecha').value             = pago.fecha_pago ? pago.fecha_pago.slice(0,10) : new Date().toISOString().slice(0,10)

  actualizarBotonesEstado(estadoSeleccionado)
  document.getElementById('pagoError').style.display = 'none'
  document.getElementById('modalPago').style.display = 'flex'
}

function actualizarBotonesEstado(estado) {
  document.querySelectorAll('.btn-estado').forEach(btn => {
    btn.classList.toggle('activo', btn.dataset.val === estado)
  })
  estadoSeleccionado = estado
}

document.querySelectorAll('.btn-estado').forEach(btn => {
  btn.addEventListener('click', () => actualizarBotonesEstado(btn.dataset.val))
})

document.getElementById('modalPagoCerrar').addEventListener('click',   () => document.getElementById('modalPago').style.display = 'none')
document.getElementById('modalPagoCancelar').addEventListener('click', () => document.getElementById('modalPago').style.display = 'none')

document.getElementById('modalPagoGuardar').addEventListener('click', async () => {
  const monto  = parseFloat(document.getElementById('pagoMonto').value)
  const metodo = document.getElementById('pagoMetodo').value
  const fecha  = document.getElementById('pagoFecha').value
  const notas  = document.getElementById('pagoNotas').value.trim()
  const errEl  = document.getElementById('pagoError')

  if (isNaN(monto) || monto < 0) { errEl.textContent = 'Ingresa un monto válido.'; errEl.style.display = 'block'; return }
  if (estadoSeleccionado !== 'pendiente' && !metodo) { errEl.textContent = 'Selecciona un método de pago.'; errEl.style.display = 'block'; return }

  const btn = document.getElementById('modalPagoGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'
  errEl.style.display = 'none'

  try {
    const res  = await fetch(`/api/pagos/${pagoEditandoId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        estado: estadoSeleccionado, monto,
        metodo: metodo || null,
        fecha_pago: fecha ? new Date(fecha + 'T12:00:00').toISOString() : null,
        notas: notas || null
      })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error.'; errEl.style.display = 'block'; return }

    document.getElementById('modalPago').style.display = 'none'
    const idx = pagosData.findIndex(p => p.id_pago === pagoEditandoId)
    if (idx !== -1) pagosData[idx] = data.pago

    await cargarPagos()
    if (estadoSeleccionado !== 'pendiente') setTimeout(() => generarRecibo(pagoEditandoId), 300)
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Modal eliminar cargo ---
function confirmarEliminar(id) {
  pagoEliminandoId = id
  document.getElementById('modalEliminar').style.display = 'flex'
}

document.getElementById('modalEliminarCancelar').addEventListener('click', () => {
  document.getElementById('modalEliminar').style.display = 'none'
  pagoEliminandoId = null
})

document.getElementById('modalEliminarConfirmar').addEventListener('click', async () => {
  if (!pagoEliminandoId) return

  const btn = document.getElementById('modalEliminarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res = await fetch(`/api/pagos/${pagoEliminandoId}`, { method: 'DELETE', headers })
    if (!res.ok) {
      const data = await res.json()
      alert(data.message || 'Error al eliminar.')
      return
    }
    document.getElementById('modalEliminar').style.display = 'none'
    pagoEliminandoId = null
    await cargarPagos()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Generar recibo PDF ---
function generarRecibo(pagoId) {
  const pago = pagosData.find(p => p.id_pago === pagoId)
  if (!pago) return

  const est      = estudiantesData.find(e => e.id_estudiante === pago.id_estudiante)
  const fechaMes = pago.mes ? new Date(pago.mes + 'T12:00:00') : null
  const mesLabel = fechaMes ? `${MESES[fechaMes.getMonth()]} ${fechaMes.getFullYear()}` : '—'
  const fechaPago = pago.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' }) : '—'
  const folio     = String(pagoId).padStart(6, '0')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Recibo CEA - ${folio}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e3a8a;background:#fff}.recibo{max-width:420px;margin:30px auto;border:2px solid #1e3a8a;border-radius:16px;overflow:hidden}.rh{background:#1e3a8a;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}.rm{font-size:26px;font-weight:800;letter-spacing:.06em}.rf{font-size:11px;opacity:.7;text-align:right}.rf strong{font-size:14px;opacity:1;display:block}.rb{padding:22px}.rt{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:14px}.fi{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px}.fi:last-child{border-bottom:none}.fi label{color:#6b7280}.fi span{font-weight:600;text-align:right}.mt{background:#f0f9ff;border-radius:10px;padding:14px;text-align:center;margin:18px 0}.mt .ml{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em}.mt .mv{font-size:30px;font-weight:800;color:#1e3a8a}.eb{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700}.ep{background:#d1fae5;color:#065f46}.et{background:#dbeafe;color:#1e40af}.foot{background:#f9fafb;padding:12px 22px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}@media print{body{margin:0}.recibo{margin:0;border:none;border-radius:0}}</style>
</head><body>
<div class="recibo">
  <div class="rh"><span class="rm">CEA</span><div class="rf">Recibo de pago<strong>#${folio}</strong></div></div>
  <div class="rb">
    <div class="rt">Detalle del pago</div>
    <div class="fi"><label>Alumno</label><span>${est ? est.nombre : '—'}</span></div>
    ${est && est.folio ? `<div class="fi"><label>Folio</label><span>${est.folio}</span></div>` : ''}
    <div class="fi"><label>Periodo</label><span>${mesLabel}</span></div>
    <div class="fi"><label>Método</label><span>${pago.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo'}</span></div>
    <div class="fi"><label>Fecha de pago</label><span>${fechaPago}</span></div>
    <div class="fi"><label>Estado</label><span><span class="eb ${pago.estado === 'pagado' ? 'ep' : 'et'}">${pago.estado === 'pagado' ? 'Pagado' : 'En tránsito'}</span></span></div>
    ${pago.notas ? `<div class="fi"><label>Notas</label><span>${pago.notas}</span></div>` : ''}
    <div class="mt"><div class="ml">Total pagado</div><div class="mv">$${Number(pago.monto).toLocaleString('es-MX')}</div></div>
  </div>
  <div class="foot">CEA — Sistema de Gestión · ${new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}</div>
</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`

  const v = window.open('', '_blank', 'width=500,height=700')
  v.document.write(html)
  v.document.close()
}

window.abrirModalPago   = abrirModalPago
window.generarRecibo    = generarRecibo
window.confirmarEliminar = confirmarEliminar

// --- Modal generar cargos ---
document.getElementById('btnCargoManual').addEventListener('click', () => {
  const hoy = new Date()
  document.getElementById('cargoMes').value = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`
  document.getElementById('cargoError').style.display = 'none'
  document.getElementById('modalCargo').style.display = 'flex'
})

document.getElementById('modalCargoCerrar').addEventListener('click',   () => document.getElementById('modalCargo').style.display = 'none')
document.getElementById('modalCargoCancelar').addEventListener('click', () => document.getElementById('modalCargo').style.display = 'none')

document.getElementById('modalCargoConfirmar').addEventListener('click', async () => {
  const mes   = document.getElementById('cargoMes').value
  const errEl = document.getElementById('cargoError')
  if (!mes) { errEl.textContent = 'Selecciona un mes.'; errEl.style.display = 'block'; return }

  const btn = document.getElementById('modalCargoConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'
  errEl.style.display = 'none'

  try {
    const res  = await fetch('/api/pagos/generar', {
      method: 'POST', headers,
      body: JSON.stringify({ mes: mes + '-01' })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error.'; errEl.style.display = 'block'; return }
    document.getElementById('modalCargo').style.display = 'none'
    await cargarPagos()
    alert(`✅ Se generaron ${data.generados} cargos nuevos.`)
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Filtros ---
document.getElementById('filtroEstado').addEventListener('change',  cargarPagos)
document.getElementById('filtroMaestro').addEventListener('change', cargarPagos)
document.getElementById('filtroBuscar').addEventListener('input',   cargarPagos)

// --- Iniciar ---
cargarDatos().then(() => cargarPagos())
