// ================================
// maestros.js — CEA Sistema de Gestión
// Refactorizado: id → id_maestro
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
}

let maestroEditandoId = null
let maestroBajaId     = null

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const btnMenu         = document.getElementById('btnMenu')
const sidebarClose    = document.getElementById('sidebarClose')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')

btnMenu.addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
sidebarClose.addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarSidebar() })
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }

// --- Logout ---
document.getElementById('btnLogout').addEventListener('click', () => {
  sessionStorage.clear()
  window.location.href = 'index.html'
})

// --- Formulario ---
const formCard    = document.getElementById('formCard')
const formTitle   = document.getElementById('formTitle')
const inputNombre = document.getElementById('inputNombre')
const inputTel    = document.getElementById('inputTelefono')
const formError   = document.getElementById('formError')

document.getElementById('btnNuevo').addEventListener('click', () => {
  maestroEditandoId = null
  formTitle.textContent = 'Nuevo maestro'
  inputNombre.value = ''
  inputTel.value = ''
  desmarcarDias()
  ocultarError()
  formCard.style.display = 'block'
  inputNombre.focus()
})

document.getElementById('btnCerrarForm').addEventListener('click', cerrarForm)
document.getElementById('btnCancelar').addEventListener('click', cerrarForm)

function cerrarForm() {
  formCard.style.display = 'none'
  maestroEditandoId = null
  ocultarError()
}

// --- Días seleccionados ---
function getDiasSeleccionados() {
  return [...document.querySelectorAll('.dia-check input:checked')].map(i => i.value)
}

function setDias(dias = []) {
  document.querySelectorAll('.dia-check input').forEach(i => {
    i.checked = dias.includes(i.value)
  })
}

function desmarcarDias() {
  document.querySelectorAll('.dia-check input').forEach(i => i.checked = false)
}

// --- Guardar maestro ---
document.getElementById('btnGuardar').addEventListener('click', guardarMaestro)

async function guardarMaestro() {
  const nombre       = inputNombre.value.trim()
  const telefono     = inputTel.value.trim()
  const dias_trabajo = getDiasSeleccionados()

  if (!nombre) return mostrarError('El nombre es requerido.')
  if (dias_trabajo.length === 0) return mostrarError('Selecciona al menos un día de trabajo.')

  setLoading(true)
  ocultarError()

  try {
    const url    = maestroEditandoId ? `/api/maestros/${maestroEditandoId}` : '/api/maestros'
    const method = maestroEditandoId ? 'PUT' : 'POST'

    const res  = await fetch(url, { method, headers, body: JSON.stringify({ nombre, telefono, dias_trabajo }) })
    const data = await res.json()

    if (!res.ok) return mostrarError(data.message || 'Error al guardar.')

    cerrarForm()
    cargarMaestros()
  } catch (err) {
    mostrarError('Error de conexión.')
  } finally {
    setLoading(false)
  }
}

// --- Cargar lista ---
async function cargarMaestros(filtro = '') {
  const grid       = document.getElementById('maestrosGrid')
  const loadingMsg = document.getElementById('loadingMsg')
  const emptyMsg   = document.getElementById('emptyMsg')

  grid.innerHTML = ''
  loadingMsg.style.display = 'block'
  emptyMsg.style.display   = 'none'

  try {
    const res  = await fetch('/api/maestros', { headers })
    const data = await res.json()

    loadingMsg.style.display = 'none'

    let maestros = data.maestros || []
    if (filtro) maestros = maestros.filter(m => m.nombre.toLowerCase().includes(filtro.toLowerCase()))

    if (maestros.length === 0) { emptyMsg.style.display = 'block'; return }

    maestros.forEach((m, i) => {
      const card = document.createElement('div')
      card.className = `maestro-card${m.activo === false ? ' inactivo' : ''}`
      card.style.animationDelay = `${i * 0.06}s`

      const inicial  = m.nombre.charAt(0).toUpperCase()
      const diasHtml = (m.dias_trabajo || []).map(d =>
        `<span class="dia-tag">${d.charAt(0).toUpperCase() + d.slice(1,3)}</span>`
      ).join('')

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:.8rem">
          <div class="maestro-avatar">${inicial}</div>
          <div>
            <div class="maestro-nombre">${m.nombre}</div>
            <div class="maestro-tel">${m.telefono || 'Sin teléfono'}</div>
          </div>
        </div>
        <div class="dias-tags">${diasHtml || '<span class="maestro-tel">Sin días asignados</span>'}</div>
        <div class="maestro-actions">
          ${m.activo !== false
            ? `<button class="btn-editar"     onclick="editarMaestro(${m.id_maestro})">Editar</button>
               <button class="btn-calendario" onclick="window.location.href='perfil-maestro.html?id=${m.id_maestro}'">Calendario</button>
               <button class="btn-baja"       onclick="confirmarBaja(${m.id_maestro})">Dar de baja</button>`
            : `<button class="btn-reactivar"  onclick="reactivarMaestro(${m.id_maestro})">Reactivar</button>
               <button class="btn-eliminar"   onclick="confirmarEliminar(${m.id_maestro})">Eliminar</button>`
          }
        </div>
      `
      grid.appendChild(card)
    })

  } catch (err) {
    loadingMsg.textContent = 'Error al cargar maestros.'
  }
}

// --- Editar ---
async function editarMaestro(id) {
  try {
    const res  = await fetch(`/api/maestros/${id}`, { headers })
    const data = await res.json()
    const m    = data.maestro

    maestroEditandoId     = id
    formTitle.textContent = 'Editar maestro'
    inputNombre.value     = m.nombre
    inputTel.value        = m.telefono || ''
    setDias(m.dias_trabajo || [])
    ocultarError()
    formCard.style.display = 'block'
    inputNombre.focus()
  } catch (err) {
    alert('Error al cargar datos del maestro.')
  }
}

// --- Baja ---
function confirmarBaja(id) {
  maestroBajaId = id
  document.getElementById('modalBaja').style.display = 'flex'
}

document.getElementById('modalCancelar').addEventListener('click', () => {
  document.getElementById('modalBaja').style.display = 'none'
  maestroBajaId = null
})

document.getElementById('modalConfirmar').addEventListener('click', async () => {
  if (!maestroBajaId) return
  try {
    const res = await fetch(`/api/maestros/${maestroBajaId}/baja`, { method: 'PATCH', headers })
    if (res.ok) { document.getElementById('modalBaja').style.display = 'none'; cargarMaestros() }
  } catch (err) { alert('Error al dar de baja.') }
  maestroBajaId = null
})

// --- Reactivar ---
async function reactivarMaestro(id) {
  try {
    const res = await fetch(`/api/maestros/${id}/reactivar`, { method: 'PATCH', headers })
    if (res.ok) cargarMaestros()
    else alert('Error al reactivar.')
  } catch (err) { alert('Error de conexión.') }
}

// --- Eliminar ---
let maestroEliminarId = null

function confirmarEliminar(id) {
  maestroEliminarId = id
  document.getElementById('modalEliminar').style.display = 'flex'
}

document.getElementById('modalEliminarCancelar').addEventListener('click', () => {
  document.getElementById('modalEliminar').style.display = 'none'
  maestroEliminarId = null
})

document.getElementById('modalEliminarConfirmar').addEventListener('click', async () => {
  if (!maestroEliminarId) return
  try {
    const res = await fetch(`/api/maestros/${maestroEliminarId}`, { method: 'DELETE', headers })
    if (res.ok) { document.getElementById('modalEliminar').style.display = 'none'; cargarMaestros() }
    else alert('No se puede eliminar, tiene datos relacionados.')
  } catch (err) { alert('Error de conexión.') }
  maestroEliminarId = null
})

// --- Buscador ---
document.getElementById('buscador').addEventListener('input', e => cargarMaestros(e.target.value))

// --- Helpers ---
function mostrarError(msg) { formError.textContent = msg; formError.style.display = 'block' }
function ocultarError()    { formError.style.display = 'none' }

function setLoading(estado) {
  const btn = document.getElementById('btnGuardar')
  btn.disabled = estado
  btn.querySelector('.btn-text').style.display   = estado ? 'none'  : 'inline'
  btn.querySelector('.btn-loader').style.display = estado ? 'flex'  : 'none'
}

window.editarMaestro     = editarMaestro
window.confirmarBaja     = confirmarBaja
window.reactivarMaestro  = reactivarMaestro
window.confirmarEliminar = confirmarEliminar

// --- Iniciar ---
cargarMaestros()
