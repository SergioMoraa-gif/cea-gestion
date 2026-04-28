// ================================
// calendario-global.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const params     = new URLSearchParams(window.location.search)
const nuevoEstId = params.get('nuevo') ? parseInt(params.get('nuevo')) : null

const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_LABEL = ['Lunes','Martes','Miérc.','Jueves','Viernes','Sábado']
const COLORES    = ['color-0','color-1','color-2','color-3','color-4','color-5','color-6','color-7']

const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let maestrosData       = []
let estudiantesData    = []
let horariosData       = []
let estudianteAsignar  = null
let horariosEstudiante = []
let colorMap           = {}

// Modal asignar nuevo bloque
let modalDia             = null
let modalHora            = null
let modalMaestrosLibres  = []
let tipoSeleccionado     = 'individual'
let duracionSeleccionada = 30
let albercaSeleccionada  = 1

// Modal grupo (modo asignación)
let grupoReferencia = null
let grupoDia        = null
let grupoHora       = null

// Modal editar bloque
let bloqueEditando    = null
let todosBloquesGrupo = []
let tipoEditando      = 'individual'
let duracionEditando  = 30
let albercaEditando   = 1

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// ─── Inicializar ──────────────────────────────────────────────────────────────
async function iniciar() {
  try {
    const [resMae, resEst, resHor] = await Promise.all([
      fetch('/api/maestros',        { headers }),
      fetch('/api/estudiantes',     { headers }),
      fetch('/api/horarios/global', { headers })
    ])
    maestrosData    = ((await resMae.json()).maestros    || []).filter(m => m.activo !== false)
    estudiantesData = (await resEst.json()).estudiantes  || []
    horariosData    = (await resHor.json()).horarios     || []

    maestrosData.forEach((m, i) => { colorMap[m.id_maestro] = COLORES[i % COLORES.length] })

    if (nuevoEstId) {
      estudianteAsignar = estudiantesData.find(e => e.id_estudiante === nuevoEstId) || null
      if (!estudianteAsignar) { window.location.href = 'estudiantes.html'; return }
      try {
        const resH = await fetch(`/api/horarios/estudiante/${nuevoEstId}`, { headers })
        horariosEstudiante = (await resH.json()).horarios || []
      } catch { horariosEstudiante = [] }
      document.getElementById('bannerNuevo').style.display = 'flex'
      document.getElementById('bannerTexto').innerHTML =
        `Asignando horario a <strong>${estudianteAsignar.nombre}</strong> — Da clic en un bloque libre`
    }

    poblarHorasEditar()
    renderLeyenda()
    renderCalendario()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar el calendario.'
  }
}

// ─── Regresar (modo asignación) ───────────────────────────────────────────────
document.getElementById('btnCancelarAsign').addEventListener('click', () => {
  window.location.href = `perfil-estudiante.html?id=${nuevoEstId}`
})

// ─── Leyenda ──────────────────────────────────────────────────────────────────
function renderLeyenda() {
  const wrap    = document.getElementById('leyendaWrap')
  const leyenda = document.getElementById('leyenda')
  if (maestrosData.length === 0) return
  leyenda.innerHTML = '<span class="leyenda-titulo">Maestros:</span>'
  maestrosData.forEach(m => {
    const item = document.createElement('span')
    item.className = 'leyenda-item'
    item.innerHTML = `<span class="leyenda-dot ${colorMap[m.id_maestro]}"></span><span>${m.nombre}</span>`
    leyenda.appendChild(item)
  })
  wrap.style.display = 'block'
}

// ─── Calendario ───────────────────────────────────────────────────────────────
async function recargarCalendario() {
  try {
    const res  = await fetch('/api/horarios/global', { headers })
    horariosData = (await res.json()).horarios || []
    renderCalendario()
  } catch (err) { console.error('Error recargando calendario:', err) }
}

function renderCalendario() {
  const head = document.getElementById('calHead')
  const body = document.getElementById('calBody')

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${DIAS.map((d, i) => `<th class="dia-activo">${DIAS_LABEL[i]}</th>`).join('')}
  </tr>`
  body.innerHTML = ''

  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  const maestroOcupado = {}
  horariosData.forEach(h => {
    const mId  = h.maestro_id || h.id_maestro
    const dur  = parseInt(h.duracion) || 30
    const [hh, mm] = h.hora_inicio.split(':').map(Number)
    const startMin = hh * 60 + mm
    for (let delta = 0; delta < dur; delta += 30) {
      const tot = startMin + delta
      const key = `${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
      if (!maestroOcupado[key]) maestroOcupado[key] = new Set()
      maestroOcupado[key].add(mId)
    }
  })

  const estudianteOcupado = new Set()
  horariosEstudiante.forEach(h => {
    const dur = parseInt(h.duracion) || 30
    const [hh, mm] = h.hora_inicio.split(':').map(Number)
    const startMin = hh * 60 + mm
    for (let delta = 0; delta < dur; delta += 30) {
      const tot = startMin + delta
      estudianteOcupado.add(`${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`)
    }
  })

  BLOQUES.forEach(hora => {
    const tr  = document.createElement('tr')
    const tdH = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    DIAS.forEach(dia => {
      const keyFull   = `${dia}_${hora}:00`
      const td        = document.createElement('td')
      td.className    = 'td-bloque'
      const bloqsAqui = mapa[keyFull] || []

      const porMaestro = {}
      bloqsAqui.forEach(b => {
        const mId = b.maestro_id || b.id_maestro
        if (!porMaestro[mId]) porMaestro[mId] = []
        porMaestro[mId].push(b)
      })

      const maestrosConBloqueAqui = new Set(Object.keys(porMaestro).map(Number))
      const maestrosEnCont = [...(maestroOcupado[keyFull] || [])].filter(
        mId => !maestrosConBloqueAqui.has(mId)
      )

      // Bloques que inician aquí
      Object.entries(porMaestro).forEach(([mIdStr, mBloqs]) => {
        const mId    = parseInt(mIdStr)
        const maestro = maestrosData.find(m => m.id_maestro === mId)
        const esGrupal = mBloqs.some(b => b.tipo === 'grupal' || b.tipo === 'matros')
        const esMatros = mBloqs.some(b => b.tipo === 'matros')
        const dur      = Math.max(...mBloqs.map(b => parseInt(b.duracion) || 30))
        const albLabel = mBloqs[0].alberca ? ` · A${mBloqs[0].alberca}` : ''

        const div = document.createElement('div')
        div.className = `bloque-global ${colorMap[mId] || 'color-0'}${esGrupal ? ' bloque-grupal' : ''}`

        if (esGrupal) {
          const tipoLabel = esMatros ? 'Matros' : 'Grupal'
          div.innerHTML = `
            <div class="bg-nombre">${tipoLabel} · ${mBloqs.length} alumno${mBloqs.length !== 1 ? 's' : ''}${albLabel}</div>
            <div class="bg-info">${maestro ? maestro.nombre : '—'} · ${dur} min</div>`

          if (nuevoEstId && !estudianteOcupado.has(keyFull)) {
            div.classList.add('bloque-grupal-unirse')
            div.addEventListener('click', () => abrirModalGrupo(mBloqs[0], dia, hora, mBloqs, mId))
          } else if (!nuevoEstId) {
            div.addEventListener('click', () => abrirModalEditar(mBloqs[0], dia, hora, mBloqs))
          }
        } else {
          const est = estudiantesData.find(e =>
            e.id_estudiante === (mBloqs[0].estudiante_id || mBloqs[0].id_estudiante)
          )
          div.innerHTML = `
            <div class="bg-nombre">${est ? est.nombre : '—'}${albLabel}</div>
            <div class="bg-info">${maestro ? maestro.nombre : '—'} · ${dur} min</div>`

          if (!nuevoEstId) {
            div.addEventListener('click', () => abrirModalEditar(mBloqs[0], dia, hora, mBloqs))
          }
        }

        td.appendChild(div)
      })

      // Continuación de bloque 60 min
      maestrosEnCont.forEach(mId => {
        const maestro = maestrosData.find(m => m.id_maestro === mId)
        const cont    = document.createElement('div')
        cont.className = `bloque-cont ${colorMap[mId] || 'color-0'}`
        cont.innerHTML = `<div class="bg-info">↑ ${maestro ? maestro.nombre : '—'}</div>`
        td.appendChild(cont)
      })

      // Slot libre (modo asignación)
      if (nuevoEstId && !estudianteOcupado.has(keyFull)) {
        const ocupadosAqui   = maestroOcupado[keyFull] || new Set()
        const maestrosLibres = maestrosData.filter(m => !ocupadosAqui.has(m.id_maestro))
        if (maestrosLibres.length > 0) {
          const btnLibre = document.createElement('div')
          btnLibre.className   = 'bloque-libre'
          btnLibre.title       = `${maestrosLibres.length} maestro${maestrosLibres.length !== 1 ? 's' : ''} disponible${maestrosLibres.length !== 1 ? 's' : ''}`
          btnLibre.textContent = '+'
          btnLibre.addEventListener('click', () => abrirModalAsignar(dia, hora, maestrosLibres))
          td.appendChild(btnLibre)
        }
      } else if (nuevoEstId && estudianteOcupado.has(keyFull) && bloqsAqui.length === 0 && maestrosEnCont.length === 0) {
        const conf = document.createElement('div')
        conf.className = 'bloque-conflicto-est'
        conf.title     = `${estudianteAsignar ? estudianteAsignar.nombre : 'El alumno'} ya tiene clase a esta hora`
        td.appendChild(conf)
      }

      tr.appendChild(td)
    })

    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display       = 'none'
  document.getElementById('calendarioScroll').style.display = 'block'
}

// ─── Modal Asignar ────────────────────────────────────────────────────────────
function abrirModalAsignar(dia, hora, maestrosLibres) {
  modalDia             = dia
  modalHora            = hora
  modalMaestrosLibres  = maestrosLibres
  tipoSeleccionado     = 'individual'
  duracionSeleccionada = 30
  albercaSeleccionada  = 1

  document.getElementById('modalAsignarNombre').textContent =
    estudianteAsignar ? estudianteAsignar.nombre : '—'
  document.getElementById('modalAsignarSlot').textContent =
    `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`

  const sel = document.getElementById('modalAsignarMaestro')
  sel.innerHTML = ''
  maestrosLibres.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m.id_maestro; opt.textContent = m.nombre
    sel.appendChild(opt)
  })

  actualizarBotonesTipo('individual')
  actualizarBotonesDuracion(30)
  actualizarBotonesAlberca(1)
  document.getElementById('modalAsignar').style.display = 'flex'
}

document.getElementById('modalAsignarCerrar').addEventListener('click',   () => { document.getElementById('modalAsignar').style.display = 'none' })
document.getElementById('modalAsignarCancelar').addEventListener('click', () => { document.getElementById('modalAsignar').style.display = 'none' })

function actualizarBotonesTipo(tipo) {
  tipoSeleccionado = tipo
  document.querySelectorAll('#modalAsignar .btn-tipo').forEach(b =>
    b.classList.toggle('activo', b.dataset.val === tipo))
  const btn30 = document.querySelector('#modalAsignar .btn-duracion[data-val="30"]')
  if (tipo === 'grupal') {
    btn30.classList.add('deshabilitado'); btn30.disabled = true
    actualizarBotonesDuracion(60)
  } else {
    btn30.classList.remove('deshabilitado'); btn30.disabled = false
  }
}

function actualizarBotonesDuracion(dur) {
  duracionSeleccionada = dur
  document.querySelectorAll('#modalAsignar .btn-duracion').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === dur))
}

function actualizarBotonesAlberca(n) {
  albercaSeleccionada = n
  document.querySelectorAll('#modalAsignar .btn-alberca').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === n))
}

document.querySelectorAll('#modalAsignar .btn-tipo').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesTipo(b.dataset.val))
)
document.querySelectorAll('#modalAsignar .btn-duracion').forEach(b =>
  b.addEventListener('click', () => { if (!b.disabled) actualizarBotonesDuracion(parseInt(b.dataset.val)) })
)
document.querySelectorAll('#modalAsignar .btn-alberca').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesAlberca(parseInt(b.dataset.val)))
)

document.getElementById('modalAsignarConfirmar').addEventListener('click', async () => {
  if (!modalDia || !modalHora || !estudianteAsignar) return

  const btn = document.getElementById('modalAsignarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const maestroId = parseInt(document.getElementById('modalAsignarMaestro').value)
  const [hh, mm]  = modalHora.split(':').map(Number)
  const tot       = hh * 60 + mm + duracionSeleccionada
  const horaFin   = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar.id_estudiante,
        maestro_id:    maestroId,
        dia:           modalDia,
        hora_inicio:   modalHora + ':00',
        hora_fin:      horaFin,
        tipo:          tipoSeleccionado,
        duracion:      duracionSeleccionada,
        alberca:       albercaSeleccionada
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al asignar.'); return }

    document.getElementById('modalAsignar').style.display = 'none'
    window.location.href = `perfil-estudiante.html?id=${nuevoEstId}`
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Modal Grupo (modo asignación) ────────────────────────────────────────────
function abrirModalGrupo(horario, dia, hora, todosLosBloques, maestroId) {
  grupoReferencia = horario
  grupoDia        = dia
  grupoHora       = hora

  const maestro = maestrosData.find(m => m.id_maestro === maestroId)
  document.getElementById('modalGrupoSlot').textContent =
    `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalGrupoMaestro').textContent =
    maestro ? `Maestro: ${maestro.nombre} · ${horario.duracion || 60} min` : '—'

  const total = todosLosBloques.length
  document.getElementById('modalGrupoCount').textContent =
    `${total} alumno${total !== 1 ? 's' : ''} en este grupo`

  const lista = document.getElementById('modalGrupoAlumnos')
  lista.innerHTML = ''
  todosLosBloques.forEach(b => {
    const est = estudiantesData.find(e =>
      e.id_estudiante === (b.estudiante_id || b.id_estudiante))
    const li = document.createElement('div')
    li.className = 'bloque-alumno-item'
    li.innerHTML = `
      <div class="item-dot ${colorMap[maestroId] || 'color-0'}"></div>
      <span class="item-nombre">${est ? est.nombre : '—'}</span>`
    lista.appendChild(li)
  })

  const accionesDiv = document.getElementById('modalGrupoAcciones')
  accionesDiv.style.display = (nuevoEstId && estudianteAsignar) ? 'flex' : 'none'
  document.getElementById('modalGrupo').style.display = 'flex'
}

document.getElementById('modalGrupoCerrar').addEventListener('click',   () => { document.getElementById('modalGrupo').style.display = 'none' })
document.getElementById('modalGrupoNoUnirse').addEventListener('click', () => { document.getElementById('modalGrupo').style.display = 'none' })

document.getElementById('modalGrupoUnirse').addEventListener('click', async () => {
  if (!grupoReferencia || !estudianteAsignar) return

  const btn = document.getElementById('modalGrupoUnirse')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar.id_estudiante,
        maestro_id:    grupoReferencia.maestro_id || grupoReferencia.id_maestro,
        dia:           grupoDia,
        hora_inicio:   grupoReferencia.hora_inicio,
        hora_fin:      grupoReferencia.hora_final || grupoReferencia.hora_fin,
        tipo:          grupoReferencia.tipo,
        duracion:      grupoReferencia.duracion || 60,
        alberca:       grupoReferencia.alberca
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al unirse.'); return }

    document.getElementById('modalGrupo').style.display = 'none'
    window.location.href = `perfil-estudiante.html?id=${nuevoEstId}`
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Modal Editar bloque (modo normal) ────────────────────────────────────────
const DIAS_OPT = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado' }

function poblarDiasEditar(diasValidos, diaActual) {
  const sel = document.getElementById('modalEditarDia')
  sel.innerHTML = ''
  diasValidos.forEach(d => {
    const opt = document.createElement('option')
    opt.value = d; opt.textContent = DIAS_OPT[d] || d
    if (d === diaActual) opt.selected = true
    sel.appendChild(opt)
  })
}

function poblarHorasEditar() {
  const sel = document.getElementById('modalEditarHora')
  if (!sel) return
  sel.innerHTML = ''
  BLOQUES.forEach(h => {
    const opt = document.createElement('option')
    opt.value = h; opt.textContent = h
    sel.appendChild(opt)
  })
}

function abrirModalEditar(bloque, dia, hora, bloqs) {
  bloqueEditando    = bloque
  todosBloquesGrupo = bloqs || [bloque]
  const esGrupal    = bloque.tipo === 'grupal' || bloque.tipo === 'matros'
  const maestro     = maestrosData.find(m => m.id_maestro === (bloque.maestro_id || bloque.id_maestro))

  document.getElementById('modalEditarInfo').textContent    = `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalEditarMaestro').textContent = maestro ? `Maestro: ${maestro.nombre}` : '—'

  const diasValidos = maestro ? (maestro.dias_trabajo || DIAS) : DIAS
  poblarDiasEditar(diasValidos, bloque.dia || dia)

  const selHora = document.getElementById('modalEditarHora')
  const horaBase = (bloque.hora_inicio || hora + ':00').slice(0,5)
  ;[...selHora.options].forEach(o => { o.selected = o.value === horaBase })

  actualizarBotonesEdTipo(bloque.tipo || 'individual')
  actualizarBotonesEdDuracion(bloque.duracion || 30)
  actualizarBotonesEdAlberca(bloque.alberca || 1)

  if (esGrupal) {
    document.getElementById('modalEditarSecAlumnos').style.display    = 'block'
    document.getElementById('modalEditarSecIndividual').style.display = 'none'
    document.getElementById('modalEditarSelectorWrap').style.display  = 'none'
    renderizarAlumnosEditar()
  } else {
    document.getElementById('modalEditarSecAlumnos').style.display    = 'none'
    document.getElementById('modalEditarSecIndividual').style.display = 'block'
    const est = estudiantesData.find(e => e.id_estudiante === (bloque.estudiante_id || bloque.id_estudiante))
    document.getElementById('modalEditarAlumnoNombre').textContent = est ? est.nombre : '—'
  }

  document.getElementById('modalEditar').style.display = 'flex'
}

function renderizarAlumnosEditar() {
  const lista = document.getElementById('modalEditarListaAlumnos')
  lista.innerHTML = ''
  document.getElementById('modalEditarCount').textContent =
    `${todosBloquesGrupo.length} alumno${todosBloquesGrupo.length !== 1 ? 's' : ''} en el grupo`

  todosBloquesGrupo.forEach(b => {
    const est  = estudiantesData.find(e => e.id_estudiante === (b.estudiante_id || b.id_estudiante))
    const item = document.createElement('div')
    item.className = 'bloque-alumno-item'
    item.innerHTML = `
      <span class="item-nombre">${est ? est.nombre : '—'}</span>
      <div class="item-acciones">
        <button class="btn-quitar-alumno" data-id="${b.id_horario}">Quitar</button>
      </div>`
    lista.appendChild(item)
  })

  lista.querySelectorAll('.btn-quitar-alumno').forEach(btn =>
    btn.addEventListener('click', () => quitarAlumnoDeGrupo(parseInt(btn.dataset.id)))
  )

  const idsEnGrupo = new Set(todosBloquesGrupo.map(b => b.estudiante_id || b.id_estudiante))
  const sel = document.getElementById('modalEditarSelectAlumno')
  sel.innerHTML = ''
  estudiantesData
    .filter(e => e.activo !== false && !idsEnGrupo.has(e.id_estudiante))
    .forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id_estudiante; opt.textContent = e.nombre
      sel.appendChild(opt)
    })
}

function actualizarBotonesEdTipo(tipo) {
  tipoEditando = tipo
  document.querySelectorAll('#modalEditar .btn-tipo-ed').forEach(b => b.classList.toggle('activo', b.dataset.val === tipo))
  const btn30 = document.querySelector('#modalEditar .btn-dur-ed[data-val="30"]')
  if (tipo === 'grupal') {
    btn30.classList.add('deshabilitado'); btn30.disabled = true
    actualizarBotonesEdDuracion(60)
  } else {
    btn30.classList.remove('deshabilitado'); btn30.disabled = false
  }
}

function actualizarBotonesEdDuracion(dur) {
  duracionEditando = dur
  document.querySelectorAll('#modalEditar .btn-dur-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === dur))
}

function actualizarBotonesEdAlberca(n) {
  albercaEditando = n
  document.querySelectorAll('#modalEditar .btn-alb-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === n))
}

document.querySelectorAll('#modalEditar .btn-tipo-ed').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesEdTipo(b.dataset.val))
)
document.querySelectorAll('#modalEditar .btn-dur-ed').forEach(b =>
  b.addEventListener('click', () => { if (!b.disabled) actualizarBotonesEdDuracion(parseInt(b.dataset.val)) })
)
document.querySelectorAll('#modalEditar .btn-alb-ed').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesEdAlberca(parseInt(b.dataset.val)))
)

document.getElementById('modalEditarCerrar').addEventListener('click', () => {
  document.getElementById('modalEditar').style.display = 'none'
})

// Guardar cambios
document.getElementById('modalEditarGuardar').addEventListener('click', async () => {
  if (!bloqueEditando) return

  const btn = document.getElementById('modalEditarGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const nuevoDia   = document.getElementById('modalEditarDia').value
  const nuevaHora  = document.getElementById('modalEditarHora').value  // "HH:MM"
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
      if (!res.ok) { const d = await res.json(); alert(d.message || 'Error al guardar.'); return }
    }
    document.getElementById('modalEditar').style.display = 'none'
    await recargarCalendario()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// Eliminar bloque
document.getElementById('modalEditarEliminar').addEventListener('click', async () => {
  if (!bloqueEditando) return
  const esGrupo = todosBloquesGrupo.length > 1
  const msg = esGrupo
    ? `¿Eliminar todo el grupo? (${todosBloquesGrupo.length} alumnos)`
    : '¿Eliminar esta clase?'
  if (!confirm(msg)) return
  try {
    for (const b of todosBloquesGrupo) {
      await fetch(`/api/horarios/${b.id_horario}`, { method: 'DELETE', headers })
    }
    document.getElementById('modalEditar').style.display = 'none'
    await recargarCalendario()
  } catch (err) {
    alert('Error al eliminar.')
  }
})

// Quitar alumno del grupo
async function quitarAlumnoDeGrupo(idHorario) {
  if (!confirm('¿Quitar a este alumno del grupo?')) return
  try {
    const res = await fetch(`/api/horarios/${idHorario}`, { method: 'DELETE', headers })
    if (!res.ok) { alert('Error al quitar alumno.'); return }
    todosBloquesGrupo = todosBloquesGrupo.filter(b => b.id_horario !== idHorario)
    if (todosBloquesGrupo.length === 0) {
      document.getElementById('modalEditar').style.display = 'none'
      await recargarCalendario()
    } else {
      renderizarAlumnosEditar()
      recargarCalendario()
    }
  } catch (err) { alert('Error de conexión.') }
}

// Mostrar selector agregar alumno
document.getElementById('modalEditarBtnAgregar').addEventListener('click', () => {
  const wrap = document.getElementById('modalEditarSelectorWrap')
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
})

// Confirmar agregar alumno al grupo
document.getElementById('modalEditarConfirmarAgregar').addEventListener('click', async () => {
  const estId = parseInt(document.getElementById('modalEditarSelectAlumno').value)
  if (!estId || !bloqueEditando) return

  const ref    = bloqueEditando
  const [hh, mm] = (ref.hora_inicio || '').slice(0,5).split(':').map(Number)
  const tot    = hh * 60 + mm + (ref.duracion || 60)
  const horaFin = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estId,
        maestro_id:    ref.maestro_id || ref.id_maestro,
        dia:           ref.dia,
        hora_inicio:   ref.hora_inicio,
        hora_fin:      horaFin,
        tipo:          ref.tipo,
        duracion:      ref.duracion,
        alberca:       ref.alberca
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al agregar.'); return }
    todosBloquesGrupo.push({ ...data.horario, estudiante_id: estId })
    document.getElementById('modalEditarSelectorWrap').style.display = 'none'
    renderizarAlumnosEditar()
    recargarCalendario()
  } catch (err) { alert('Error de conexión.') }
})

// ─── Imprimir PDF ─────────────────────────────────────────────────────────────
document.getElementById('btnImprimir').addEventListener('click', () => {
  const hoy = new Date()
  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  document.getElementById('printHeaderDate').textContent =
    'Generado el ' + hoy.toLocaleDateString('es-MX', opciones)
  window.print()
})

iniciar()
