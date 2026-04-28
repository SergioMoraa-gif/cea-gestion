// ================================
// perfil-estudiante.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const params       = new URLSearchParams(window.location.search)
const estudianteId = parseInt(params.get('id'))
if (!estudianteId) window.location.href = 'estudiantes.html'
const nuevaClase   = params.get('nuevaClase') === 'true'

const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_LABEL = ['Lunes','Martes','Miérc.','Jueves','Viernes','Sábado']
const COLORES    = ['color-0','color-1','color-2','color-3','color-4','color-5']

const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let estudianteData = null
let horariosData   = []
let maestrosData   = []
let pagosData      = []

// Modal de edición de bloque
let bloqueActual      = null
let todosBloquesGrupo = []
let tipoEditando      = 'individual'
let duracionEditando  = 30
let albercaEditando   = 1

// Modal de ajuste del mes
let modoAjuste  = null   // 'sumar' | 'restar'
let pagoAjuste  = null   // pago pendiente del mes actual (para restar)

// ─── Sidebar ───────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarBackdrop.classList.add('show')
})
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => {
  sessionStorage.clear(); window.location.href = 'index.html'
})
document.getElementById('btnVolver').addEventListener('click', () => {
  window.location.href = 'estudiantes.html'
})

// ─── Inicializar ────────────────────────────────────────────
async function iniciar() {
  try {
    const [resEst, resMae, resHor, resPag] = await Promise.all([
      fetch(`/api/estudiantes/${estudianteId}`, { headers }),
      fetch('/api/maestros', { headers }),
      fetch(`/api/horarios/estudiante/${estudianteId}`, { headers }),
      fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    ])

    const dataEst = await resEst.json()
    const dataMae = await resMae.json()
    const dataHor = await resHor.json()
    const dataPag = await resPag.json()

    estudianteData = dataEst.estudiante || null
    maestrosData   = (dataMae.maestros  || []).filter(m => m.activo !== false)
    horariosData   = dataHor.horarios   || []
    pagosData      = dataPag.pagos      || []

    if (!estudianteData) { window.location.href = 'estudiantes.html'; return }

    renderInfo()
    renderCalendario()
    renderPagos()

    if (nuevaClase) {
      setTimeout(() => abrirModalPrecioMensual(), 300)
    }
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar los datos.'
  }
}

// ─── Info del alumno ────────────────────────────────────────
function renderInfo() {
  const e = estudianteData
  document.getElementById('tituloEstudiante').textContent = e.nombre
  document.getElementById('subtituloEstudiante').textContent =
    e.folio ? `Folio: ${e.folio}` : 'Perfil del estudiante'

  document.getElementById('infoNombre').textContent   = e.nombre    || '—'
  document.getElementById('infoFolio').textContent    = e.folio     || '—'
  document.getElementById('infoTelefono').textContent = e.telefono  || '—'
  document.getElementById('infoPrecio').textContent   = `$${Number(e.precio_mensual || 0).toLocaleString('es-MX')}`
  const estadoEl = document.getElementById('infoEstado')
  estadoEl.innerHTML = e.activo
    ? '<span class="badge-activo">Activo</span>'
    : '<span class="badge-inactivo">Inactivo</span>'
}

document.getElementById('btnEditarInfo').addEventListener('click', () => {
  const e = estudianteData
  document.getElementById('editNombre').value   = e.nombre          || ''
  document.getElementById('editFolio').value    = e.folio           || ''
  document.getElementById('editTelefono').value = e.telefono        || ''
  document.getElementById('editPrecio').value   = e.precio_mensual  || 0
  document.getElementById('editError').style.display = 'none'
  document.getElementById('vistaLectura').style.display = 'none'
  document.getElementById('vistaEdicion').style.display = 'block'
  document.getElementById('btnEditarInfo').style.display = 'none'
})

document.getElementById('btnCancelarEdicion').addEventListener('click', () => {
  document.getElementById('vistaEdicion').style.display = 'none'
  document.getElementById('vistaLectura').style.display = 'block'
  document.getElementById('btnEditarInfo').style.display = 'inline-block'
})

document.getElementById('btnGuardarInfo').addEventListener('click', async () => {
  const nombre   = document.getElementById('editNombre').value.trim()
  const folio    = document.getElementById('editFolio').value.trim()
  const telefono = document.getElementById('editTelefono').value.trim()
  const precio   = parseFloat(document.getElementById('editPrecio').value) || 0
  const errEl    = document.getElementById('editError')

  if (!nombre) { errEl.textContent = 'El nombre es requerido.'; errEl.style.display = 'block'; return }
  if (folio && !/^[0-9]+[A-Z]?$/.test(folio)) {
    errEl.textContent = 'El folio debe ser un número con una letra mayúscula opcional al final (Ej. 001 o 001A).'
    errEl.style.display = 'block'; return
  }
  if (telefono) {
    const soloDigitos = telefono.replace(/\D/g, '')
    if (soloDigitos.length !== 10) {
      errEl.textContent = 'El teléfono debe tener exactamente 10 dígitos.'
      errEl.style.display = 'block'; return
    }
  }
  errEl.style.display = 'none'

  const btn = document.getElementById('btnGuardarInfo')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res  = await fetch(`/api/estudiantes/${estudianteId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ nombre, folio, telefono, precio_mensual: precio })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error al guardar.'; errEl.style.display = 'block'; return }

    estudianteData = data.estudiante
    renderInfo()
    document.getElementById('vistaEdicion').style.display = 'none'
    document.getElementById('vistaLectura').style.display = 'block'
    document.getElementById('btnEditarInfo').style.display = 'inline-block'
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Calendario del alumno ──────────────────────────────────
function renderCalendario() {
  const head = document.getElementById('calHead')
  const body = document.getElementById('calBody')

  // Qué días tiene clases este alumno
  const diasConClases = new Set(horariosData.map(h => h.dia))
  const diasMostrar   = DIAS.filter(d => diasConClases.has(d))
  // Si no tiene clases, mostrar todos los días
  const diasRender    = diasMostrar.length > 0 ? diasMostrar : DIAS

  // Color por maestro
  const colorMap = {}
  let ci = 0
  maestrosData.forEach(m => { colorMap[m.id_maestro] = COLORES[ci++ % COLORES.length] })

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${diasRender.map(d => `<th class="dia-activo">${DIAS_LABEL[DIAS.indexOf(d)]}</th>`).join('')}
  </tr>`
  body.innerHTML = ''

  // Mapa de horarios
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // Celdas a omitir: solo los slots que caen DENTRO del bloque (no el que sigue después)
  const saltarCelda = new Set()
  horariosData.forEach(h => {
    const dur = parseInt(h.duracion) || 30
    if (dur > 30) {
      const [hh, mm] = h.hora_inicio.split(':').map(Number)
      const startMin = hh * 60 + mm
      for (let delta = 30; delta < dur; delta += 30) {
        const tot = startMin + delta
        const key = `${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
        saltarCelda.add(key)
      }
    }
  })

  BLOQUES.forEach(hora => {
    const tr  = document.createElement('tr')
    const tdH = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    diasRender.forEach(dia => {
      const keyFull = `${dia}_${hora}:00`
      if (saltarCelda.has(keyFull)) return

      const td    = document.createElement('td')
      td.className = 'td-bloque'
      const bloqs  = mapa[keyFull] || []

      if (bloqs.length > 0) {
        const maxDur     = Math.max(...bloqs.map(b => parseInt(b.duracion) || 30))
        const spanNeeded = Math.ceil(maxDur / 30)
        if (spanNeeded > 1) td.rowSpan = spanNeeded

        bloqs.forEach(b => {
          const maestro = maestrosData.find(m => m.id_maestro === (b.maestro_id || b.id_maestro))
          const div     = document.createElement('div')
          div.className = `bloque-clase ${colorMap[b.maestro_id || b.id_maestro] || 'color-0'}${maxDur > 30 ? ' bloque-grande' : ''}`
          const tipoLabel = b.tipo === 'grupal' ? 'Grupal' : b.tipo === 'matros' ? 'Matros' : 'Individual'
          div.innerHTML = `
            <div class="bc-maestro">${maestro ? maestro.nombre : '—'}</div>
            <div class="bc-tipo">${tipoLabel} · ${b.duracion || 30} min</div>`
          div.addEventListener('click', () => abrirModalBloque(b, dia, hora, maestro))
          td.appendChild(div)
        })
      } else {
        const div = document.createElement('div')
        div.className = 'bloque-vacio'
        td.appendChild(div)
      }
      tr.appendChild(td)
    })
    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display        = 'none'
  document.getElementById('calendarioScroll').style.display  = 'block'
}

// ─── Modal: ver / editar bloque ────────────────────────────
const DIAS_OPT = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado' }

function poblarDiasBloque(diasValidos, diaActual) {
  const sel = document.getElementById('modalBloqueDia')
  sel.innerHTML = ''
  diasValidos.forEach(d => {
    const opt = document.createElement('option')
    opt.value = d; opt.textContent = DIAS_OPT[d] || d
    if (d === diaActual) opt.selected = true
    sel.appendChild(opt)
  })
}

function poblarHorasBloque(horaActual) {
  const sel = document.getElementById('modalBloqueHora')
  sel.innerHTML = ''
  BLOQUES.forEach(h => {
    const opt = document.createElement('option')
    opt.value = h; opt.textContent = h
    if (horaActual && horaActual.startsWith(h)) opt.selected = true
    sel.appendChild(opt)
  })
}

function actualizarBotonesEdTipo(tipo) {
  tipoEditando = tipo
  document.querySelectorAll('.btn-tipo-ed').forEach(b => b.classList.toggle('activo', b.dataset.val === tipo))
  const btn30 = document.querySelector('.btn-dur-ed[data-val="30"]')
  if (tipo === 'grupal') {
    btn30.classList.add('deshabilitado'); btn30.disabled = true
    actualizarBotonesEdDuracion(60)
  } else {
    btn30.classList.remove('deshabilitado'); btn30.disabled = false
  }
}

function actualizarBotonesEdDuracion(dur) {
  duracionEditando = parseInt(dur)
  document.querySelectorAll('.btn-dur-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === parseInt(dur)))
}

function actualizarBotonesEdAlberca(n) {
  albercaEditando = parseInt(n)
  document.querySelectorAll('.btn-alb-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === parseInt(n)))
}

document.querySelectorAll('.btn-tipo-ed').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesEdTipo(b.dataset.val))
)
document.querySelectorAll('.btn-dur-ed').forEach(b =>
  b.addEventListener('click', () => { if (!b.disabled) actualizarBotonesEdDuracion(b.dataset.val) })
)
document.querySelectorAll('.btn-alb-ed').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesEdAlberca(b.dataset.val))
)

async function abrirModalBloque(horario, dia, hora, maestro) {
  bloqueActual = horario
  const esGrupal = horario.tipo === 'grupal' || horario.tipo === 'matros'

  document.getElementById('modalBloqueInfo').textContent =
    `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalBloqueMaestroNombre').textContent =
    maestro ? `Maestro: ${maestro.nombre}` : '—'

  const diasMaestro = maestro ? (maestro.dias_trabajo || DIAS) : DIAS
  poblarDiasBloque(diasMaestro, horario.dia || dia)
  poblarHorasBloque(horario.hora_inicio)
  actualizarBotonesEdTipo(horario.tipo || 'individual')
  actualizarBotonesEdDuracion(horario.duracion || 30)
  actualizarBotonesEdAlberca(horario.alberca || 1)

  if (esGrupal && maestro) {
    try {
      const res  = await fetch(`/api/horarios/maestro/${maestro.id_maestro}`, { headers })
      const data = await res.json()
      todosBloquesGrupo = (data.horarios || []).filter(h =>
        h.dia === horario.dia &&
        h.hora_inicio === horario.hora_inicio &&
        h.tipo === horario.tipo
      )
    } catch {
      todosBloquesGrupo = [horario]
    }
    document.getElementById('modalBloqueCount').textContent =
      `${todosBloquesGrupo.length} alumno${todosBloquesGrupo.length !== 1 ? 's' : ''} en el grupo`
    const lista = document.getElementById('modalBloqueListaAlumnos')
    lista.innerHTML = ''
    document.getElementById('modalBloqueSecAlumnos').style.display    = 'block'
    document.getElementById('modalBloqueSecIndividual').style.display = 'none'
  } else {
    todosBloquesGrupo = [horario]
    document.getElementById('modalBloqueSecAlumnos').style.display    = 'none'
    document.getElementById('modalBloqueSecIndividual').style.display = 'block'
    document.getElementById('modalBloqueAlumnoNombre').textContent    = estudianteData ? estudianteData.nombre : '—'
  }

  document.getElementById('modalBloque').style.display = 'flex'
}

document.getElementById('modalBloqueCerrar').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})

// Guardar cambios del bloque
document.getElementById('btnGuardarBloque').addEventListener('click', async () => {
  if (!bloqueActual) return
  const btn = document.getElementById('btnGuardarBloque')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const nuevoDia   = document.getElementById('modalBloqueDia').value
  const nuevaHora  = document.getElementById('modalBloqueHora').value
  const [hh, mm]   = nuevaHora.split(':').map(Number)
  const tot        = hh * 60 + mm + duracionEditando
  const horaFin    = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
  const horaInicio = nuevaHora + ':00'

  try {
    const ids = todosBloquesGrupo.map(b => b.id_horario)
    for (const id of ids) {
      const res = await fetch(`/api/horarios/${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          dia:         nuevoDia,
          hora_inicio: horaInicio,
          hora_fin:    horaFin,
          tipo:        tipoEditando,
          duracion:    duracionEditando,
          alberca:     albercaEditando
        })
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.message || 'Error al guardar.'); return
      }
    }
    document.getElementById('modalBloque').style.display = 'none'
    await recargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// Eliminar bloque
document.getElementById('btnEliminarBloque').addEventListener('click', async () => {
  if (!bloqueActual) return
  const esGrupal = bloqueActual.tipo === 'grupal' || bloqueActual.tipo === 'matros'
  const msg = esGrupal
    ? '¿Quitar tu lugar en esta clase grupal? El resto del grupo no se ve afectado.'
    : '¿Eliminar esta clase? Esta acción no se puede deshacer.'
  if (!confirm(msg)) return

  try {
    const res  = await fetch(`/api/horarios/${bloqueActual.id || bloqueActual.id_horario}`, {
      method: 'DELETE', headers
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al eliminar.'); return }
    document.getElementById('modalBloque').style.display = 'none'
    await recargarHorarios()

    // Preguntar si desea descontar del mes actual
    const mes = mesActualStr()
    const pagoPendiente = pagosData.find(p =>
      p.tipo === 'mensual' &&
      p.estado === 'pendiente' &&
      p.mes && p.mes.startsWith(mes)
    )
    if (pagoPendiente) abrirModalAjuste('restar', pagoPendiente)
  } catch (err) {
    alert('Error de conexión.')
  }
})

// ─── Modal ajuste del mes ───────────────────────────────────
function mesActualStr() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2,'0')}`
}

function abrirModalAjuste(modo, pagoExistente = null) {
  modoAjuste = modo
  pagoAjuste = pagoExistente
  document.getElementById('modalAjusteMonto').value = ''

  const montoActual = pagoExistente ? `$${Number(pagoExistente.monto).toLocaleString('es-MX')}` : '—'
  document.getElementById('modalAjusteTitulo').textContent = 'Descuento del mes actual'
  document.getElementById('modalAjusteDesc').textContent =
    `Se eliminó una clase. El cargo pendiente de este mes es ${montoActual}. ¿Deseas descontar algo?`
  document.getElementById('modalAjusteLabel').textContent =
    'Monto a descontar (dejar vacío para no modificar)'

  document.getElementById('modalAjuste').style.display = 'flex'
}

// ─── Modal precio mensual (post-asignación) ─────────────────
function abrirModalPrecioMensual() {
  const precioActual = estudianteData.precio_mensual || 0
  document.getElementById('precioMensualError').style.display = 'none'
  document.getElementById('precioMensualInput').value = ''

  if (precioActual > 0) {
    document.getElementById('precioActualDisplay').textContent = Number(precioActual).toLocaleString('es-MX')
    document.getElementById('precioState1').style.display = 'block'
    document.getElementById('precioState2').style.display = 'none'
    document.getElementById('btnPrecioVolver').style.display = 'inline-block'
  } else {
    document.getElementById('precioState1').style.display = 'none'
    document.getElementById('precioState2').style.display = 'block'
    document.getElementById('btnPrecioVolver').style.display = 'none'
  }
  document.getElementById('modalPrecioMensual').style.display = 'flex'
}

document.getElementById('btnPrecioNoChange').addEventListener('click', () => {
  document.getElementById('modalPrecioMensual').style.display = 'none'
  abrirModalCargoExtra()
})

document.getElementById('btnPrecioSiChange').addEventListener('click', () => {
  document.getElementById('precioMensualInput').value = estudianteData.precio_mensual || ''
  document.getElementById('precioState1').style.display = 'none'
  document.getElementById('precioState2').style.display = 'block'
})

document.getElementById('btnPrecioVolver').addEventListener('click', () => {
  document.getElementById('precioState2').style.display = 'none'
  document.getElementById('precioState1').style.display = 'block'
})

document.getElementById('btnPrecioGuardar').addEventListener('click', async () => {
  const precio = parseFloat(document.getElementById('precioMensualInput').value) || 0
  const errEl  = document.getElementById('precioMensualError')

  if (precio <= 0) {
    errEl.textContent = 'Ingresa un monto mayor a $0.'
    errEl.style.display = 'block'; return
  }
  errEl.style.display = 'none'

  const btn = document.getElementById('btnPrecioGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const resEst = await fetch(`/api/estudiantes/${estudianteId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        nombre:         estudianteData.nombre,
        folio:          estudianteData.folio,
        telefono:       estudianteData.telefono,
        precio_mensual: precio
      })
    })
    const dataEst = await resEst.json()
    if (!resEst.ok) { errEl.textContent = dataEst.message || 'Error al guardar.'; errEl.style.display = 'block'; return }
    estudianteData = dataEst.estudiante
    renderInfo()

    // Crear cargo mensual para el mes actual (si no existe ya)
    const mesStr = mesActualStr()
    await fetch('/api/pagos', {
      method: 'POST', headers,
      body: JSON.stringify({
        id_estudiante: estudianteId,
        mes:   mesStr + '-01',
        monto: precio,
        tipo:  'mensual'
      })
    })

    // Refrescar pagos para que el historial refleje el nuevo cargo
    const resPag = await fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    pagosData = (await resPag.json()).pagos || []
    renderPagos()

    document.getElementById('modalPrecioMensual').style.display = 'none'
    abrirModalCargoExtra()
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Modal cargo extra del mes ──────────────────────────────
function abrirModalCargoExtra() {
  document.getElementById('cargoExtraMonto').value = ''
  document.querySelectorAll('.btn-monto-rapido').forEach(b => b.classList.remove('activo'))
  const hoy = new Date()
  document.getElementById('cargoExtraMesLabel').textContent =
    hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  document.getElementById('modalCargoExtra').style.display = 'flex'
}

document.querySelectorAll('.btn-monto-rapido').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-monto-rapido').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    document.getElementById('cargoExtraMonto').value = btn.dataset.val
  })
})

document.getElementById('btnSinCargoExtra').addEventListener('click', () => {
  document.getElementById('modalCargoExtra').style.display = 'none'
})

document.getElementById('btnRegistrarCargoExtra').addEventListener('click', async () => {
  const monto = parseFloat(document.getElementById('cargoExtraMonto').value) || 0
  if (monto <= 0) {
    document.getElementById('modalCargoExtra').style.display = 'none'
    return
  }
  const btn = document.getElementById('btnRegistrarCargoExtra')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const mes = mesActualStr()
    const res = await fetch('/api/pagos', {
      method: 'POST', headers,
      body: JSON.stringify({ id_estudiante: estudianteId, mes: mes + '-01', monto, tipo: 'ajuste' })
    })
    if (!res.ok) { const d = await res.json(); alert(d.message || 'Error al registrar cargo.') }
    document.getElementById('modalCargoExtra').style.display = 'none'
    const res2 = await fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    pagosData = (await res2.json()).pagos || []
    renderPagos()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

document.getElementById('modalAjusteCerrar').addEventListener('click', () => {
  document.getElementById('modalAjuste').style.display = 'none'
})
document.getElementById('modalAjusteOmitir').addEventListener('click', () => {
  document.getElementById('modalAjuste').style.display = 'none'
})

document.getElementById('modalAjusteConfirmar').addEventListener('click', async () => {
  const montoStr = document.getElementById('modalAjusteMonto').value.trim()
  if (!montoStr || isNaN(parseFloat(montoStr)) || parseFloat(montoStr) <= 0) {
    document.getElementById('modalAjuste').style.display = 'none'
    return
  }
  const monto = parseFloat(montoStr)

  const btn = document.getElementById('modalAjusteConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    if (modoAjuste === 'sumar') {
      // Crear nuevo cargo tipo 'ajuste'
      const mes = mesActualStr()
      const res = await fetch('/api/pagos', {
        method: 'POST', headers,
        body: JSON.stringify({ id_estudiante: estudianteId, mes: mes + '-01', monto, tipo: 'ajuste' })
      })
      if (!res.ok) { const d = await res.json(); alert(d.message || 'Error al crear ajuste.') }
    } else if (modoAjuste === 'restar' && pagoAjuste) {
      // Reducir monto del pago pendiente actual
      const nuevoMonto = Math.max(0, pagoAjuste.monto - monto)
      const res = await fetch(`/api/pagos/${pagoAjuste.id_pago}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ monto: nuevoMonto })
      })
      if (!res.ok) { const d = await res.json(); alert(d.message || 'Error al actualizar pago.') }
    }
    document.getElementById('modalAjuste').style.display = 'none'
    // Recargar pagos para reflejar el cambio
    const res2 = await fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    const data2 = await res2.json()
    pagosData = data2.pagos || []
    renderPagos()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

async function recargarHorarios() {
  try {
    document.getElementById('loadingCal').style.display       = 'block'
    document.getElementById('calendarioScroll').style.display = 'none'
    const [resHor, resPag] = await Promise.all([
      fetch(`/api/horarios/estudiante/${estudianteId}`, { headers }),
      fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    ])
    horariosData = (await resHor.json()).horarios || []
    pagosData    = (await resPag.json()).pagos    || []
    renderCalendario()
    renderPagos()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al recargar.'
  }
}

// ─── Asignar clase — seleccionar maestro ───────────────────
document.getElementById('btnAsignarClase').addEventListener('click', () => {
  const lista = document.getElementById('maestrosLista')
  lista.innerHTML = ''

  if (maestrosData.length === 0) {
    lista.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center">No hay maestros activos.</p>'
  } else {
    let ci = 0
    const colorMap = {}
    maestrosData.forEach(m => { colorMap[m.id_maestro] = COLORES[ci++ % COLORES.length] })

    maestrosData.forEach(m => {
      const btn = document.createElement('button')
      btn.className = 'maestro-item-btn'
      btn.innerHTML = `
        <div class="maestro-dot ${colorMap[m.id_maestro]}"></div>
        <span>${m.nombre}</span>`
      btn.addEventListener('click', () => {
        document.getElementById('modalMaestro').style.display = 'none'
        window.location.href = `perfil-maestro.html?id=${m.id_maestro}&nuevo=${estudianteId}`
      })
      lista.appendChild(btn)
    })
  }

  document.getElementById('modalMaestro').style.display = 'flex'
})

document.getElementById('modalMaestroCerrar').addEventListener('click', () => {
  document.getElementById('modalMaestro').style.display = 'none'
})

// ─── Pagos ──────────────────────────────────────────────────
function renderPagos() {
  const loadingEl = document.getElementById('loadingPagos')
  const emptyEl   = document.getElementById('emptyPagos')
  const wrapEl    = document.getElementById('tablaPagosWrapper')
  const body      = document.getElementById('tablaPagosBody')

  loadingEl.style.display = 'none'
  body.innerHTML = ''

  if (pagosData.length === 0) {
    emptyEl.style.display = 'block'
    wrapEl.style.display  = 'none'
    return
  }

  emptyEl.style.display = 'none'
  wrapEl.style.display  = 'block'

  // Ordenar: inscripciones (mes=null) primero, luego por mes descendente
  const ordenados = [...pagosData].sort((a, b) => {
    if (a.tipo === 'inscripcion' && b.tipo !== 'inscripcion') return -1
    if (a.tipo !== 'inscripcion' && b.tipo === 'inscripcion') return 1
    return (b.mes || '').localeCompare(a.mes || '')
  })

  ordenados.forEach(p => {
    const tr = document.createElement('tr')
    const mes = p.tipo === 'inscripcion'
      ? 'Inscripción'
      : new Date(p.mes + 'T12:00:00').toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
    const fechaPago = p.fecha_pago
      ? new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—'
    const badgeClass = p.estado === 'pagado'   ? 'badge-pagado'
                     : p.estado === 'vencido'  ? 'badge-vencido'
                     : 'badge-pendiente'

    tr.innerHTML = `
      <td>${mes}</td>
      <td><strong>$${Number(p.monto || 0).toLocaleString('es-MX')}</strong></td>
      <td><span class="${badgeClass}">${p.estado || 'pendiente'}</span></td>
      <td>${p.metodo || '—'}</td>
      <td>${fechaPago}</td>`
    body.appendChild(tr)
  })
}

iniciar()
