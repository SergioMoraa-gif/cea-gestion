// ================================
// estudiantes.js — CEA Sistema de Gestión
// Nuevo flujo: crear alumno → botones maestros → calendario → precio
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

let estudiantesData  = []
let maestrosData     = []
let estudianteNuevoId = null  // ID del alumno recién creado (durante inscripción)
let estudianteEditandoId = null

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Cargar datos ---
async function cargarDatos() {
  try {
    const [resEst, resMae] = await Promise.all([
      fetch('/api/estudiantes', { headers }),
      fetch('/api/maestros',    { headers })
    ])
    estudiantesData = (await resEst.json()).estudiantes || []
    maestrosData    = ((await resMae.json()).maestros || []).filter(m => m.activo !== false)
    renderTabla()
  } catch (err) {
    document.getElementById('loadingMsg').textContent = 'Error al cargar datos.'
  }
}

// --- Renderizar tabla ---
function renderTabla() {
  const loadingMsg   = document.getElementById('loadingMsg')
  const emptyMsg     = document.getElementById('emptyMsg')
  const tablaWrapper = document.getElementById('tablaWrapper')
  const body         = document.getElementById('tablaBody')

  loadingMsg.style.display   = 'none'
  body.innerHTML = ''

  const filtroEstado  = document.getElementById('filtroEstado').value
  const busqueda      = document.getElementById('buscador').value.toLowerCase()

  let lista = estudiantesData
  if (filtroEstado === 'activos')   lista = lista.filter(e => e.activo)
  if (filtroEstado === 'inactivos') lista = lista.filter(e => !e.activo)
  if (busqueda) lista = lista.filter(e =>
    e.nombre.toLowerCase().includes(busqueda) ||
    (e.folio || '').toLowerCase().includes(busqueda)
  )

  if (lista.length === 0) { emptyMsg.style.display = 'block'; tablaWrapper.style.display = 'none'; return }
  emptyMsg.style.display = 'none'; tablaWrapper.style.display = 'block'

  lista.forEach(e => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${e.folio || '—'}</td>
      <td><strong>${e.nombre}</strong></td>
      <td>${e.telefono || '—'}</td>
      <td><strong>$${Number(e.precio_mensual || 0).toLocaleString('es-MX')}</strong></td>
      <td><span class="badge-estado ${e.activo ? 'badge-activo' : 'badge-inactivo'}">${e.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="acciones">
          <button class="btn-accion btn-accion-perfil"  onclick="verPerfil(${e.id_estudiante})">Ver perfil</button>
          <button class="btn-accion btn-accion-horario" onclick="irCalendario(${e.id_estudiante})">Horario</button>
          <button class="btn-accion btn-accion-editar"  onclick="abrirEditar(${e.id_estudiante})">Editar</button>
          ${e.activo
            ? `<button class="btn-accion btn-accion-baja" onclick="abrirBaja(${e.id_estudiante})">Dar de baja</button>`
            : `<button class="btn-accion btn-accion-reactivar" onclick="reactivar(${e.id_estudiante})">Reactivar</button>`
          }
          <button class="btn-accion btn-accion-eliminar" onclick="abrirEliminar(${e.id_estudiante})">Eliminar</button>
        </div>
      </td>`
    body.appendChild(tr)
  })
}

// Ir al perfil del estudiante
function verPerfil(estudianteId) {
  window.location.href = `perfil-estudiante.html?id=${estudianteId}`
}

// Ir al calendario del primer maestro disponible para asignar horario a alumno existente
function irCalendario(estudianteId) {
  if (maestrosData.length === 0) return alert('No hay maestros registrados.')
  // Mostrar selector de maestro
  const maestro = maestrosData[0]
  window.location.href = `perfil-maestro.html?id=${maestro.id_maestro}&nuevo=${estudianteId}`
}

// --- Formulario nuevo estudiante ---
document.getElementById('btnNuevo').addEventListener('click', () => {
  estudianteNuevoId = null
  document.getElementById('inputNombre').value = ''
  document.getElementById('inputFolio').value  = ''
  document.getElementById('inputTelefono').value = ''
  document.getElementById('inputPrecio').value = ''
  document.getElementById('formError').style.display = 'none'
  document.getElementById('seccionMaestros').style.display = 'none'
  document.getElementById('btnGuardar').style.display = 'inline-flex'
  document.getElementById('formCard').style.display = 'block'
})

document.getElementById('btnCerrarForm').addEventListener('click', cerrarFormulario)
document.getElementById('btnCancelar').addEventListener('click', cerrarFormulario)

function cerrarFormulario() {
  document.getElementById('formCard').style.display = 'none'
  estudianteNuevoId = null
  cargarDatos()
}

// Paso 1: Crear el alumno
document.getElementById('btnGuardar').addEventListener('click', async () => {
  const nombre   = document.getElementById('inputNombre').value.trim()
  const folio    = document.getElementById('inputFolio').value.trim()
  const telefono = document.getElementById('inputTelefono').value.trim()
  const errEl    = document.getElementById('formError')

  if (!nombre) { errEl.textContent = 'El nombre es requerido.'; errEl.style.display = 'block'; return }

  const btn = document.getElementById('btnGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'
  errEl.style.display = 'none'

  try {
    const res  = await fetch('/api/estudiantes', {
      method: 'POST', headers,
      body: JSON.stringify({ nombre, folio, telefono, precio_mensual: 0 })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error.'; errEl.style.display = 'block'; return }

    estudianteNuevoId = data.estudiante.id_estudiante

    // Mostrar botones de maestros
    document.getElementById('btnGuardar').style.display = 'none'
    mostrarBotonesMaestros()
    document.getElementById('seccionMaestros').style.display = 'block'

  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// Mostrar botones de maestros disponibles
function mostrarBotonesMaestros() {
  const contenedor = document.getElementById('maestrosBtns')
  contenedor.innerHTML = ''
  maestrosData.forEach(m => {
    const btn = document.createElement('button')
    btn.className = 'btn-maestro'
    btn.textContent = m.nombre
    btn.addEventListener('click', () => {
      window.location.href = `perfil-maestro.html?id=${m.id_maestro}&nuevo=${estudianteNuevoId}`
    })
    contenedor.appendChild(btn)
  })
}

// Paso 2: Finalizar inscripción guardando precio
document.getElementById('btnFinalizarInscripcion').addEventListener('click', async () => {
  const precio = parseFloat(document.getElementById('inputPrecio').value) || 0
  const errEl  = document.getElementById('formError')

  if (!estudianteNuevoId) return

  const btn = document.getElementById('btnFinalizarInscripcion')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    // Obtener datos actuales del alumno para no perderlos
    const resEst  = await fetch(`/api/estudiantes/${estudianteNuevoId}`, { headers })
    const dataEst = await resEst.json()
    const est     = dataEst.estudiante

    await fetch(`/api/estudiantes/${estudianteNuevoId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        nombre:         est.nombre,
        folio:          est.folio,
        telefono:       est.telefono,
        precio_mensual: precio
      })
    })

    // Generar primer cargo
    const hoy = new Date()
    const mes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`
    await fetch('/api/pagos', {
      method: 'POST', headers,
      body: JSON.stringify({ id_estudiante: estudianteNuevoId, mes, monto: precio })
    })

    cerrarFormulario()
  } catch (err) {
    errEl.textContent = 'Error al guardar.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Editar ---
function abrirEditar(id) {
  const est = estudiantesData.find(e => e.id_estudiante === id)
  if (!est) return
  estudianteEditandoId = id
  document.getElementById('editNombre').value   = est.nombre || ''
  document.getElementById('editFolio').value    = est.folio  || ''
  document.getElementById('editTelefono').value = est.telefono || ''
  document.getElementById('editPrecio').value   = est.precio_mensual || 0
  document.getElementById('editError').style.display = 'none'
  document.getElementById('modalEditar').style.display = 'flex'
}

document.getElementById('modalEditarCerrar').addEventListener('click',   () => document.getElementById('modalEditar').style.display = 'none')
document.getElementById('modalEditarCancelar').addEventListener('click', () => document.getElementById('modalEditar').style.display = 'none')

document.getElementById('modalEditarGuardar').addEventListener('click', async () => {
  const nombre   = document.getElementById('editNombre').value.trim()
  const folio    = document.getElementById('editFolio').value.trim()
  const telefono = document.getElementById('editTelefono').value.trim()
  const precio   = parseFloat(document.getElementById('editPrecio').value) || 0
  const errEl    = document.getElementById('editError')

  if (!nombre) { errEl.textContent = 'El nombre es requerido.'; errEl.style.display = 'block'; return }

  const btn = document.getElementById('modalEditarGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'
  errEl.style.display = 'none'

  try {
    const res  = await fetch(`/api/estudiantes/${estudianteEditandoId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ nombre, folio, telefono, precio_mensual: precio })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error.'; errEl.style.display = 'block'; return }
    document.getElementById('modalEditar').style.display = 'none'
    cargarDatos()
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Baja ---
let idBaja = null
function abrirBaja(id) { idBaja = id; document.getElementById('modalBaja').style.display = 'flex' }
document.getElementById('modalBajaCancelar').addEventListener('click', () => document.getElementById('modalBaja').style.display = 'none')
document.getElementById('modalBajaConfirmar').addEventListener('click', async () => {
  if (!idBaja) return
  await fetch(`/api/estudiantes/${idBaja}/baja`, { method: 'PATCH', headers })
  document.getElementById('modalBaja').style.display = 'none'
  idBaja = null
  cargarDatos()
})

// --- Reactivar ---
async function reactivar(id) {
  await fetch(`/api/estudiantes/${id}/reactivar`, { method: 'PATCH', headers })
  cargarDatos()
}

// --- Eliminar ---
let idEliminar = null
function abrirEliminar(id) { idEliminar = id; document.getElementById('modalEliminar').style.display = 'flex' }
document.getElementById('modalEliminarCancelar').addEventListener('click', () => document.getElementById('modalEliminar').style.display = 'none')
document.getElementById('modalEliminarConfirmar').addEventListener('click', async () => {
  if (!idEliminar) return
  await fetch(`/api/estudiantes/${idEliminar}`, { method: 'DELETE', headers })
  document.getElementById('modalEliminar').style.display = 'none'
  idEliminar = null
  cargarDatos()
})

// --- Filtros ---
document.getElementById('buscador').addEventListener('input', renderTabla)
document.getElementById('filtroEstado').addEventListener('change', renderTabla)

// Exponer funciones globales
window.abrirEditar   = abrirEditar
window.abrirBaja     = abrirBaja
window.abrirEliminar = abrirEliminar
window.reactivar     = reactivar
window.irCalendario  = irCalendario

// Si regresa del calendario con ?regreso=id, mostrar sección de precio
const urlParams = new URLSearchParams(window.location.search)
const regresoId = urlParams.get('regreso')
if (regresoId) {
  estudianteNuevoId = parseInt(regresoId)
  cargarDatos().then(() => {
    document.getElementById('btnGuardar').style.display = 'none'
    mostrarBotonesMaestros()
    document.getElementById('seccionMaestros').style.display = 'block'
    document.getElementById('formCard').style.display = 'block'
  })
} else {
  cargarDatos()
}