// ================================
// perfil-maestro.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const params     = new URLSearchParams(window.location.search)
let maestroId    = parseInt(params.get('id')) || null
const nuevoEstId = params.get('nuevo') ? parseInt(params.get('nuevo')) : null

const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_LABEL = ['Lunes','Martes','Miérc.','Jueves','Viernes','Sábado']
const COLORES    = ['color-0','color-1','color-2','color-3','color-4','color-5']

const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let maestrosData       = []
let estudiantesData    = []
let horariosData       = []
let horariosEstudiante = []
let todosHorarios      = []  // todos los maestros — para vista global en modo asignación
let maestroActual      = null
let estudianteAsignar  = null

// Modal asignar nuevo bloque
let bloqueSelDia         = null
let bloqueSelHora        = null
let tipoSeleccionado     = 'individual'
let duracionSeleccionada = 30
let albercaSeleccionada  = 1

// Modal asignar — bloque grupal existente (modo asignación)
let bloqueGrupalReferencia = null

// Modal editar bloque existente
let bloqueEditando    = null
let todosBloquesGrupo = []
let tipoEditando      = 'individual'
let duracionEditando  = 30
let albercaEditando   = 1

// ─── Sidebar ────────────────────────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', () => { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') })
sidebarBackdrop.addEventListener('click', () => { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') })
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// ─── Selector de maestro ─────────────────────────────────────────────────────
document.getElementById('selectorMaestro').addEventListener('change', function () {
  maestroId     = parseInt(this.value)
  maestroActual = maestrosData.find(m => m.id_maestro === maestroId)
  actualizarTitulo()
  cargarHorarios()
})

function actualizarTitulo() {
  if (!maestroActual) return
  document.getElementById('tituloMaestro').textContent    = maestroActual.nombre
  document.getElementById('subtituloMaestro').textContent = (maestroActual.dias_trabajo || [])
    .map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
}

// ─── Iniciar ─────────────────────────────────────────────────────────────────
async function iniciar() {
  try {
    const [resMaestros, resEst] = await Promise.all([
      fetch('/api/maestros',    { headers }),
      fetch('/api/estudiantes', { headers })
    ])
    maestrosData    = ((await resMaestros.json()).maestros || []).filter(m => m.activo !== false)
    estudiantesData = (await resEst.json()).estudiantes || []

    const sel = document.getElementById('selectorMaestro')
    sel.innerHTML = ''
    maestrosData.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro; opt.textContent = m.nombre
      if (m.id_maestro === maestroId) opt.selected = true
      sel.appendChild(opt)
    })

    if (!maestroId && maestrosData.length > 0) maestroId = maestrosData[0].id_maestro
    maestroActual = maestrosData.find(m => m.id_maestro === maestroId)
    actualizarTitulo()

    if (nuevoEstId) {
      estudianteAsignar = estudiantesData.find(e => e.id_estudiante === nuevoEstId)
      if (estudianteAsignar) {
        activarBanner()
        try {
          const resH = await fetch(`/api/horarios/estudiante/${nuevoEstId}`, { headers })
          horariosEstudiante = (await resH.json()).horarios || []
        } catch { horariosEstudiante = [] }
      }
    }

    await cargarHorarios()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar el calendario.'
  }
}

// ─── Banner modo asignación ──────────────────────────────────────────────────
function activarBanner() {
  document.getElementById('bannerNuevo').style.display = 'flex'
  document.getElementById('bannerTexto').innerHTML =
    `Asignando horario a <strong>${estudianteAsignar.nombre}</strong> — Da clic en un bloque vacío`
}

document.getElementById('btnCancelarAsign').addEventListener('click', () => {
  window.location.href = `estudiantes.html?asignar=${nuevoEstId}`
})

document.getElementById('btnGuardarHorario').addEventListener('click', () => {
  window.location.href = `perfil-estudiante.html?id=${nuevoEstId}&nuevaClase=true`
})

// ─── Cargar horarios ─────────────────────────────────────────────────────────
let _cargandoMaestroId = null  // evita renders con datos de maestro anterior

async function cargarHorarios() {
  const idSolicitado = maestroId
  _cargandoMaestroId = idSolicitado

  document.getElementById('loadingCal').style.display       = 'block'
  document.getElementById('calendarioScroll').style.display = 'none'
  try {
    const [dataMaestro, dataAlumno, dataGlobal] = await Promise.all([
      fetch(`/api/horarios/maestro/${idSolicitado}`, { headers }).then(r => r.json()),
      nuevoEstId ? fetch(`/api/horarios/estudiante/${nuevoEstId}`, { headers }).then(r => r.json()) : Promise.resolve(null),
      nuevoEstId ? fetch('/api/horarios/global', { headers }).then(r => r.json()) : Promise.resolve(null)
    ])

    // Si el usuario cambió de maestro mientras cargaba, ignorar esta respuesta
    if (_cargandoMaestroId !== idSolicitado) return

    horariosData       = dataMaestro.horarios || []
    horariosEstudiante = dataAlumno  ? (dataAlumno.horarios  || []) : horariosEstudiante
    todosHorarios      = dataGlobal  ? (dataGlobal.horarios  || []) : horariosData

    renderizarCalendario()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar horarios.'
  }
}

// ─── Renderizar calendario ───────────────────────────────────────────────────
function renderizarCalendario() {
  const diasMaestro = maestroActual ? (maestroActual.dias_trabajo || DIAS) : DIAS
  const diasMostrar = DIAS.filter(d => diasMaestro.includes(d))

  const head = document.getElementById('calendarioHead')
  const body = document.getElementById('calendarioBody')

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${diasMostrar.map(d => `<th class="dia-activo">${DIAS_LABEL[DIAS.indexOf(d)]}</th>`).join('')}
  </tr>`
  body.innerHTML = ''

  // mapa del maestro actual (para editar/unirse)
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // En modo asignación: mapa global (todos los maestros) para mostrar ocupación real de albercas
  const fuenteGlobal = estudianteAsignar ? todosHorarios : horariosData
  const mapaGlobal = {}
  fuenteGlobal.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapaGlobal[key]) mapaGlobal[key] = []
    mapaGlobal[key].push(h)
  })

  const estudianteOcupado = new Set()
  if (estudianteAsignar) {
    horariosEstudiante.forEach(h => {
      const dur = parseInt(h.duracion) || 30
      const [hh, mm] = h.hora_inicio.split(':').map(Number)
      const startMin = hh * 60 + mm
      for (let delta = 0; delta < dur; delta += 30) {
        const tot = startMin + delta
        estudianteOcupado.add(`${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`)
      }
    })
  }

  // Qué albercas están ocupadas globalmente en cada slot (considerando duración)
  const albercasPorSlot = {}
  fuenteGlobal.forEach(h => {
    const dur = parseInt(h.duracion) || 30
    const [hh, mm] = h.hora_inicio.split(':').map(Number)
    const startMin = hh * 60 + mm
    for (let delta = 0; delta < dur; delta += 30) {
      const tot = startMin + delta
      const k = `${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
      if (!albercasPorSlot[k]) albercasPorSlot[k] = new Set()
      albercasPorSlot[k].add(h.alberca || 1)
    }
  })

  const colorMap = {}
  let ci = 0
  estudiantesData.forEach(e => { colorMap[e.id_estudiante] = COLORES[ci++ % COLORES.length] })

  // Agrupa los bloques de una celda: grupales/matros por alberca, individuales sueltos
  function agruparBloques(lista) {
    const grupales = {}
    const individuales = []
    lista.forEach(b => {
      if (b.tipo === 'grupal' || b.tipo === 'matros') {
        const alb = b.alberca || 1
        if (!grupales[alb]) grupales[alb] = []
        grupales[alb].push(b)
      } else {
        individuales.push(b)
      }
    })
    return { grupales, individuales }
  }

  BLOQUES.forEach(hora => {
    const tr  = document.createElement('tr')
    const tdH = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    diasMostrar.forEach(dia => {
      const keyFull = `${dia}_${hora}:00`
      const td      = document.createElement('td')
      td.className  = 'td-bloque'
      const bloqs   = mapa[keyFull] || []  // solo del maestro actual

      const alberOcup     = albercasPorSlot[keyFull] || new Set()
      const ambasOcupadas = alberOcup.has(1) && alberOcup.has(2)
      const estBloqueado  = estudianteOcupado.has(keyFull)

      if (estudianteAsignar) {
        // ── MODO ASIGNACIÓN: vista global de todas las albercas ──────────────
        const bloqsPropios = bloqs
        const bloqsTodos   = mapaGlobal[keyFull] || []
        const propiosIds   = new Set(bloqsPropios.map(b => b.id_horario))
        const bloqsOtros   = bloqsTodos.filter(b => !propiosIds.has(b.id_horario))
        const hayBloques   = bloqsPropios.length > 0 || bloqsOtros.length > 0

        if (hayBloques) {
          const { grupales: gProp, individuales: iProp } = agruparBloques(bloqsPropios)
          const { grupales: gOtros, individuales: iOtros } = agruparBloques(bloqsOtros)

          // Propios — grupales (se puede unir)
          Object.entries(gProp).forEach(([alb, blist]) => {
            const b   = blist[0]
            const div = document.createElement('div')
            div.className = `bloque-alumno bloque-grupal-unirse ${colorMap[b.estudiante_id || b.id_estudiante] || 'color-0'}`
            div.innerHTML = `
              <div class="al-nombre">${b.tipo === 'matros' ? 'Matros' : 'Grupal'} · ${blist.length} alumno${blist.length !== 1 ? 's' : ''} · A${alb}</div>
              <div class="al-clase">Clic para ver y agregar</div>`
            div.addEventListener('click', (e) => { e.stopPropagation(); abrirModalBloque(b, dia, hora, blist, colorMap, true) })
            td.appendChild(div)
          })

          // Propios — individuales (ocupado)
          iProp.forEach(b => {
            const est = estudiantesData.find(e => e.id_estudiante === (b.estudiante_id || b.id_estudiante))
            const div = document.createElement('div')
            div.className = `bloque-alumno bloque-ocupado-individual ${colorMap[b.estudiante_id || b.id_estudiante] || 'color-0'}`
            div.innerHTML = `
              <div class="al-nombre">${est ? est.nombre : '—'}</div>
              <div class="al-clase">Ocupado · ${b.duracion || 30} min · A${b.alberca || 1}</div>`
            td.appendChild(div)
          })

          // Otros maestros — grupales (informativo, no clickable)
          Object.entries(gOtros).forEach(([alb, blist]) => {
            const b   = blist[0]
            const div = document.createElement('div')
            div.className = 'bloque-alumno bloque-otro-maestro'
            div.innerHTML = `
              <div class="al-nombre">${b.tipo === 'matros' ? 'Matros' : 'Grupal'} · ${blist.length} alumnos · A${alb}</div>
              <div class="al-clase">Otro maestro · ${b.duracion || 60} min</div>`
            td.appendChild(div)
          })

          // Otros maestros — individuales (informativo)
          iOtros.forEach(b => {
            const div = document.createElement('div')
            div.className = 'bloque-alumno bloque-otro-maestro'
            div.innerHTML = `
              <div class="al-nombre">Ocupado · A${b.alberca || 1}</div>
              <div class="al-clase">Otro maestro · ${b.duracion || 30} min</div>`
            td.appendChild(div)
          })

          // Alberca libre disponible
          if (!ambasOcupadas && !estBloqueado) {
            const addDiv = document.createElement('div')
            addDiv.className = 'bloque-agregar-libre'
            addDiv.textContent = '+ Alberca libre'
            addDiv.addEventListener('click', () => abrirModalAsignar(dia, hora))
            td.appendChild(addDiv)
          }

        } else if (estBloqueado) {
          const div = document.createElement('div')
          div.className = 'bloque-vacio bloque-ocupado-individual'
          div.title = `${estudianteAsignar.nombre} ya tiene clase a esta hora`
          td.appendChild(div)
        } else {
          const div = document.createElement('div')
          div.className = 'bloque-vacio asignando-activo'
          div.addEventListener('click', () => abrirModalAsignar(dia, hora))
          td.appendChild(div)
        }

      } else {
        // ── MODO NORMAL: solo el maestro actual ─────────────────────────────
        if (bloqs.length > 0) {
          const { grupales, individuales } = agruparBloques(bloqs)

          Object.entries(grupales).forEach(([alb, blist]) => {
            const b   = blist[0]
            const div = document.createElement('div')
            div.className = `bloque-alumno ${colorMap[b.estudiante_id || b.id_estudiante] || 'color-0'} bloque-clickable`
            div.innerHTML = `
              <div class="al-nombre">${b.tipo === 'matros' ? 'Matros' : 'Grupal'} · ${blist.length} alumno${blist.length !== 1 ? 's' : ''} · A${alb}</div>
              <div class="al-clase">${b.duracion || 60} min</div>`
            div.addEventListener('click', () => abrirModalEditar(b, dia, hora, blist))
            td.appendChild(div)
          })

          individuales.forEach(b => {
            const est = estudiantesData.find(e => e.id_estudiante === (b.estudiante_id || b.id_estudiante))
            const div = document.createElement('div')
            div.className = `bloque-alumno ${colorMap[b.estudiante_id || b.id_estudiante] || 'color-0'} bloque-clickable`
            div.innerHTML = `
              <div class="al-nombre">${est ? est.nombre : '—'}</div>
              <div class="al-clase">${b.tipo === 'matros' ? 'Matros' : 'Individual'} · ${b.duracion || 30} min · A${b.alberca || 1}</div>`
            div.addEventListener('click', () => abrirModalEditar(b, dia, hora, bloqs))
            td.appendChild(div)
          })
        } else {
          const div = document.createElement('div')
          div.className = 'bloque-vacio'
          td.appendChild(div)
        }
      }

      tr.appendChild(td)
    })
    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display       = 'none'
  document.getElementById('calendarioScroll').style.display = 'block'
}

// ─── Modal asignar nuevo bloque ──────────────────────────────────────────────
function abrirModalAsignar(dia, hora) {
  bloqueSelDia         = dia
  bloqueSelHora        = hora
  tipoSeleccionado     = 'individual'
  duracionSeleccionada = 30
  albercaSeleccionada  = 1

  document.getElementById('modalAsignarAlumno').textContent =
    estudianteAsignar ? estudianteAsignar.nombre : '—'
  document.getElementById('modalAsignarDia').textContent =
    `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`

  actualizarBotonesTipo('individual')
  actualizarBotonesDuracion(30)
  actualizarBotonesAlberca(1)

  document.getElementById('modalAsignar').style.display = 'flex'
}

function actualizarBotonesTipo(tipo) {
  tipoSeleccionado = tipo
  document.querySelectorAll('.btn-tipo').forEach(b => b.classList.toggle('activo', b.dataset.val === tipo))
  const btn30 = document.querySelector('.btn-duracion[data-val="30"]')
  if (tipo === 'grupal') {
    btn30.classList.add('deshabilitado'); btn30.disabled = true
    actualizarBotonesDuracion(60)
  } else {
    btn30.classList.remove('deshabilitado'); btn30.disabled = false
  }
}

function actualizarBotonesDuracion(dur) {
  duracionSeleccionada = dur
  document.querySelectorAll('.btn-duracion').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === dur))
}

function actualizarBotonesAlberca(n) {
  albercaSeleccionada = n
  document.querySelectorAll('.btn-alberca').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === n))
}

document.querySelectorAll('.btn-tipo').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesTipo(b.dataset.val))
)
document.querySelectorAll('.btn-duracion').forEach(b =>
  b.addEventListener('click', () => { if (!b.disabled) actualizarBotonesDuracion(parseInt(b.dataset.val)) })
)
document.querySelectorAll('.btn-alberca').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesAlberca(parseInt(b.dataset.val)))
)

document.getElementById('modalAsignarCancelar').addEventListener('click', () => {
  document.getElementById('modalAsignar').style.display = 'none'
})

document.getElementById('modalAsignarConfirmar').addEventListener('click', async () => {
  if (!bloqueSelDia || !bloqueSelHora) return

  const btn = document.getElementById('modalAsignarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const [hh, mm] = bloqueSelHora.split(':').map(Number)
  const tot      = hh * 60 + mm + duracionSeleccionada
  const horaFin  = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar ? estudianteAsignar.id_estudiante : null,
        maestro_id:    maestroId,
        dia:           bloqueSelDia,
        hora_inicio:   bloqueSelHora + ':00',
        hora_fin:      horaFin,
        tipo:          tipoSeleccionado,
        duracion:      duracionSeleccionada,
        alberca:       albercaSeleccionada
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al asignar.'); return }

    document.getElementById('modalAsignar').style.display = 'none'
    await cargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Modal bloque ocupado (solo modo asignación) ─────────────────────────────
function abrirModalBloque(horario, dia, hora, todosLosBloques, colorMap, modoAgregar = false) {
  const esGrupal = horario.tipo === 'grupal' || horario.tipo === 'matros'

  document.getElementById('modalBloqueHora').textContent    = `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalBloqueClase').textContent   = `${esGrupal ? (horario.tipo === 'matros' ? 'Matros' : 'Grupal') : 'Individual'} · ${horario.duracion || 30} min`
  document.getElementById('modalBloqueMaestro').textContent = maestroActual ? `Maestro: ${maestroActual.nombre}` : ''

  const total = todosLosBloques.length
  document.getElementById('modalBloqueCount').textContent = `${total} alumno${total !== 1 ? 's' : ''} en este bloque`

  const lista = document.getElementById('modalBloqueListaAlumnos')
  lista.innerHTML = ''
  todosLosBloques.forEach(b => {
    const est = estudiantesData.find(e => e.id_estudiante === (b.estudiante_id || b.id_estudiante))
    const li  = document.createElement('div')
    li.className = 'bloque-alumno-item'
    li.innerHTML = `
      <div class="item-dot ${colorMap[b.estudiante_id || b.id_estudiante] || 'color-0'}"></div>
      <span class="item-nombre">${est ? est.nombre : '—'}</span>
      <div class="item-acciones">
        <button class="btn-item-perfil" onclick="verPerfilDesdeBloque(${b.estudiante_id || b.id_estudiante})">Ver perfil</button>
      </div>`
    lista.appendChild(li)
  })

  const accionesDiv = document.getElementById('modalBloqueAcciones')
  if (modoAgregar && esGrupal && estudianteAsignar) {
    bloqueGrupalReferencia = horario
    bloqueSelDia  = dia
    bloqueSelHora = hora
    accionesDiv.style.display = 'flex'
  } else {
    accionesDiv.style.display = 'none'
  }

  document.getElementById('modalBloque').style.display = 'flex'
}

window.verPerfilDesdeBloque = (id) => {
  document.getElementById('modalBloque').style.display = 'none'
  window.location.href = `estudiantes.html?highlight=${id}`
}

document.getElementById('modalBloqueCerrar').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})
document.getElementById('modalBloqueNoUnirse').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})

document.getElementById('modalBloqueAgregar').addEventListener('click', async () => {
  if (!bloqueGrupalReferencia || !estudianteAsignar) return

  const btn = document.getElementById('modalBloqueAgregar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar.id_estudiante,
        maestro_id:    maestroId,
        dia:           bloqueSelDia,
        hora_inicio:   bloqueGrupalReferencia.hora_inicio,
        hora_fin:      bloqueGrupalReferencia.hora_final || bloqueGrupalReferencia.hora_fin,
        tipo:          bloqueGrupalReferencia.tipo,
        duracion:      bloqueGrupalReferencia.duracion || 60,
        alberca:       bloqueGrupalReferencia.alberca
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al agregar.'); return }

    document.getElementById('modalBloque').style.display = 'none'
    bloqueGrupalReferencia = null
    await cargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Modal editar bloque existente ───────────────────────────────────────────
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

function poblarHorasEditar(horaActual) {
  const sel = document.getElementById('modalEditarHora')
  sel.innerHTML = ''
  BLOQUES.forEach(h => {
    const opt = document.createElement('option')
    opt.value       = h
    opt.textContent = h
    if (horaActual && horaActual.startsWith(h)) opt.selected = true
    sel.appendChild(opt)
  })
}

function abrirModalEditar(bloque, dia, hora, bloqs) {
  bloqueEditando    = bloque
  todosBloquesGrupo = bloqs || [bloque]
  const esGrupal    = bloque.tipo === 'grupal' || bloque.tipo === 'matros'

  document.getElementById('modalEditarInfo').textContent    = `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalEditarMaestro').textContent = maestroActual ? `Maestro: ${maestroActual.nombre}` : ''

  const diasValidos = maestroActual ? (maestroActual.dias_trabajo || DIAS) : DIAS
  poblarDiasEditar(diasValidos, bloque.dia || dia)
  poblarHorasEditar(bloque.hora_inicio)

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

  // Poblar selector de alumnos para agregar
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
  duracionEditando = dur
  document.querySelectorAll('.btn-dur-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === dur))
}

function actualizarBotonesEdAlberca(n) {
  albercaEditando = n
  document.querySelectorAll('.btn-alb-ed').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === n))
}

document.querySelectorAll('.btn-tipo-ed').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesEdTipo(b.dataset.val))
)
document.querySelectorAll('.btn-dur-ed').forEach(b =>
  b.addEventListener('click', () => { if (!b.disabled) actualizarBotonesEdDuracion(parseInt(b.dataset.val)) })
)
document.querySelectorAll('.btn-alb-ed').forEach(b =>
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

  const nuevoDia  = document.getElementById('modalEditarDia').value
  const nuevaHora = document.getElementById('modalEditarHora').value  // "HH:MM"
  const [hh, mm]  = nuevaHora.split(':').map(Number)
  const tot       = hh * 60 + mm + duracionEditando
  const horaFin   = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
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

    document.getElementById('modalEditar').style.display = 'none'
    await cargarHorarios()
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
    const ids = todosBloquesGrupo.map(b => b.id_horario)
    for (const id of ids) {
      await fetch(`/api/horarios/${id}`, { method: 'DELETE', headers })
    }
    document.getElementById('modalEditar').style.display = 'none'
    await cargarHorarios()
  } catch (err) {
    alert('Error al eliminar.')
  }
})

// Quitar un alumno del grupo
async function quitarAlumnoDeGrupo(idHorario) {
  if (!confirm('¿Quitar a este alumno del grupo?')) return
  try {
    const res = await fetch(`/api/horarios/${idHorario}`, { method: 'DELETE', headers })
    if (!res.ok) { alert('Error al quitar alumno.'); return }

    todosBloquesGrupo = todosBloquesGrupo.filter(b => b.id_horario !== idHorario)
    if (todosBloquesGrupo.length === 0) {
      document.getElementById('modalEditar').style.display = 'none'
      await cargarHorarios()
    } else {
      renderizarAlumnosEditar()
      cargarHorarios()
    }
  } catch (err) {
    alert('Error de conexión.')
  }
}

// Mostrar/ocultar selector para agregar alumno al grupo
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
    cargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  }
})

// ─── Imprimir PDF ─────────────────────────────────────────────────────────────
document.getElementById('btnImprimir').addEventListener('click', () => {
  if (!maestroActual) return
  const hoy = new Date()
  document.getElementById('printHeaderTitle').textContent =
    `Horario del Maestro — ${maestroActual.nombre}`
  document.getElementById('printHeaderSub').textContent =
    maestroActual.dias_trabajo
      ? maestroActual.dias_trabajo.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
      : 'Calendario semanal'
  document.getElementById('printHeaderDate').textContent =
    'Generado el ' + hoy.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  window.print()
})

iniciar()
