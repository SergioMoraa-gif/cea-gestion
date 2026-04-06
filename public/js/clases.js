// ================================
// clases.js — CEA Sistema de Gestión
// Refactorizado: maestro_id → id_maestro
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

let claseEditandoId = null
let claseBajaId     = null

const MODALIDADES = { LM: 'Lun / Mié', MJ: 'Mar / Jue', viernes: 'Viernes', sabado: 'Sábado' }

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarSidebar() })
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }

document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Formulario ---
const formCard  = document.getElementById('formCard')
const formTitle = document.getElementById('formTitle')
const formError = document.getElementById('formError')

document.getElementById('btnNuevo').addEventListener('click', () => {
  claseEditandoId = null
  formTitle.textContent = 'Nueva clase'
  document.getElementById('inputNombre').value    = ''
  document.getElementById('inputCosto').value     = ''
  document.getElementById('inputTipo').value      = 'individual'
  document.getElementById('inputModalidad').value = 'LM'
  document.getElementById('inputMaestro').value   = ''
  ocultarError()
  formCard.style.display = 'block'
  document.getElementById('inputNombre').focus()
})

document.getElementById('btnCerrarForm').addEventListener('click', cerrarForm)
document.getElementById('btnCancelar').addEventListener('click', cerrarForm)
function cerrarForm() { formCard.style.display = 'none'; claseEditandoId = null; ocultarError() }

// --- Guardar ---
document.getElementById('btnGuardar').addEventListener('click', guardarClase)

async function guardarClase() {
  const nombre     = document.getElementById('inputNombre').value.trim()
  const costo      = parseFloat(document.getElementById('inputCosto').value)
  const tipo       = document.getElementById('inputTipo').value
  const modalidad  = document.getElementById('inputModalidad').value
  const id_maestro = document.getElementById('inputMaestro').value || null

  if (!nombre)              return mostrarError('El nombre de la clase es requerido.')
  if (isNaN(costo) || costo < 0) return mostrarError('Ingresa un costo válido.')
  if (!id_maestro)          return mostrarError('Selecciona un maestro para esta clase.')

  setLoading(true)
  ocultarError()

  try {
    const url    = claseEditandoId ? `/api/clases/${claseEditandoId}` : '/api/clases'
    const method = claseEditandoId ? 'PUT' : 'POST'
    const res    = await fetch(url, {
      method, headers,
      body: JSON.stringify({
        nombre,
        costo_mensual: costo,
        tipo,
        modalidad,
        id_maestro: parseInt(id_maestro),  // ← cambiado de maestro_id
        activa: true
      })
    })
    const data = await res.json()
    if (!res.ok) return mostrarError(data.message || 'Error al guardar.')
    cerrarForm()
    cargarClases()
  } catch (err) {
    mostrarError('Error de conexión.')
  } finally {
    setLoading(false)
  }
}

// --- Cargar maestros en el selector ---
async function cargarMaestrosEnSelector() {
  try {
    const res  = await fetch('/api/maestros', { headers })
    const data = await res.json()
    const sel  = document.getElementById('inputMaestro')
    sel.innerHTML = '<option value="">— Selecciona un maestro —</option>'
    ;(data.maestros || []).filter(m => m.activo !== false).forEach(m => {
      const opt = document.createElement('option')
      opt.value       = m.id_maestro   // ← cambiado de m.id
      opt.textContent = m.nombre
      sel.appendChild(opt)
    })
  } catch (err) {
    console.error('Error cargando maestros:', err)
  }
}

// --- Cargar lista de clases ---
async function cargarClases() {
  const grid       = document.getElementById('clasesGrid')
  const loadingMsg = document.getElementById('loadingMsg')
  const emptyMsg   = document.getElementById('emptyMsg')

  grid.innerHTML = ''
  loadingMsg.style.display = 'block'
  emptyMsg.style.display   = 'none'

  try {
    const [resClases, resMaestros] = await Promise.all([
      fetch('/api/clases',   { headers }),
      fetch('/api/maestros', { headers })
    ])
    const dataClases   = await resClases.json()
    const dataMaestros = await resMaestros.json()

    const clases   = dataClases.clases     || []
    const maestros = dataMaestros.maestros || []
    // Mapa por id_maestro
    const mapMaestros = Object.fromEntries(maestros.map(m => [m.id_maestro, m.nombre]))

    loadingMsg.style.display = 'none'
    if (clases.length === 0) { emptyMsg.style.display = 'block'; return }

    clases.forEach((c, i) => {
      const card = document.createElement('div')
      card.className = `clase-card${c.activa === false ? ' inactiva' : ''}`
      card.style.animationDelay = `${i * 0.06}s`

      const nombreMaestro = c.id_maestro
        ? (mapMaestros[c.id_maestro] || 'Sin maestro')
        : 'Sin maestro'

      card.innerHTML = `
        <div class="clase-nombre">${c.nombre}</div>
        <div class="clase-costo">$${Number(c.costo_mensual).toLocaleString('es-MX')}<span>/mes</span></div>
        <div class="clase-badges">
          <span class="badge badge-tipo">${c.tipo === 'individual' ? 'Individual' : 'Grupal'}</span>
          <span class="badge badge-modalidad">${MODALIDADES[c.modalidad] || c.modalidad}</span>
          ${c.activa === false ? '<span class="badge badge-inactiva">Inactiva</span>' : ''}
        </div>
        <div style="font-size:.78rem;color:rgba(255,255,255,.6);display:flex;align-items:center;gap:.4rem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${nombreMaestro}
        </div>
        <div class="clase-actions">
          <button class="btn-editar" onclick="editarClase(${c.id_clase})">Editar</button>
          ${c.activa !== false
            ? `<button class="btn-baja" onclick="confirmarBaja(${c.id_clase})">Desactivar</button>`
            : `<button class="btn-reactivar" onclick="reactivarClase(${c.id_clase})">Reactivar</button>
               <button class="btn-eliminar"  onclick="confirmarEliminar(${c.id_clase})">Eliminar</button>`
          }
        </div>
      `
      grid.appendChild(card)
    })
  } catch (err) {
    loadingMsg.textContent = 'Error al cargar clases.'
  }
}

// --- Editar ---
async function editarClase(id) {
  try {
    const res  = await fetch(`/api/clases/${id}`, { headers })
    const data = await res.json()
    const c    = data.clase

    claseEditandoId = id
    formTitle.textContent = 'Editar clase'
    document.getElementById('inputNombre').value    = c.nombre
    document.getElementById('inputCosto').value     = c.costo_mensual
    document.getElementById('inputTipo').value      = c.tipo
    document.getElementById('inputModalidad').value = c.modalidad
    document.getElementById('inputMaestro').value   = c.id_maestro || ''  // ← cambiado
    ocultarError()
    formCard.style.display = 'block'
    document.getElementById('inputNombre').focus()
  } catch (err) {
    alert('Error al cargar datos de la clase.')
  }
}

// --- Baja ---
function confirmarBaja(id) {
  claseBajaId = id
  document.getElementById('modalEliminar').style.display = 'flex'
}

document.getElementById('modalCancelar').addEventListener('click', () => {
  document.getElementById('modalEliminar').style.display = 'none'
  claseBajaId = null
})

document.getElementById('modalConfirmar').addEventListener('click', async () => {
  if (!claseBajaId) return
  try {
    const res = await fetch(`/api/clases/${claseBajaId}`, { method: 'PATCH', headers })
    if (res.ok) { document.getElementById('modalEliminar').style.display = 'none'; cargarClases() }
  } catch (err) { alert('Error al desactivar clase.') }
  claseBajaId = null
})

// --- Reactivar ---
async function reactivarClase(id) {
  try {
    const res = await fetch(`/api/clases/${id}/reactivar`, { method: 'PATCH', headers })
    if (res.ok) cargarClases()
    else alert('Error al reactivar.')
  } catch (err) { alert('Error de conexión.') }
}

// --- Eliminar permanente ---
let claseEliminarId = null

function confirmarEliminar(id) {
  claseEliminarId = id
  document.getElementById('modalEliminarConfirm').style.display = 'flex'
}

document.getElementById('modalEliminarCancelar').addEventListener('click', () => {
  document.getElementById('modalEliminarConfirm').style.display = 'none'
  claseEliminarId = null
})

document.getElementById('modalEliminarConfirmar').addEventListener('click', async () => {
  if (!claseEliminarId) return
  try {
    const res = await fetch(`/api/clases/${claseEliminarId}`, { method: 'DELETE', headers })
    if (res.ok) { document.getElementById('modalEliminarConfirm').style.display = 'none'; cargarClases() }
    else alert('No se puede eliminar, tiene datos relacionados.')
  } catch (err) { alert('Error de conexión.') }
  claseEliminarId = null
})

// --- Helpers ---
function mostrarError(msg) { formError.textContent = msg; formError.style.display = 'block' }
function ocultarError()    { formError.style.display = 'none' }
function setLoading(estado) {
  const btn = document.getElementById('btnGuardar')
  btn.disabled = estado
  btn.querySelector('.btn-text').style.display   = estado ? 'none' : 'inline'
  btn.querySelector('.btn-loader').style.display = estado ? 'flex' : 'none'
}

window.editarClase       = editarClase
window.confirmarBaja     = confirmarBaja
window.reactivarClase    = reactivarClase
window.confirmarEliminar = confirmarEliminar

// --- Iniciar ---
cargarMaestrosEnSelector()
cargarClases()
