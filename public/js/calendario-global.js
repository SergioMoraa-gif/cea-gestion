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

// De lunes a viernes no hay clases de 9:00 a 13:00 → se ocultan esas filas del calendario
const BLOQUES_LV = BLOQUES.filter(h => h >= '13:00')

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
let estudianteEnModalEditar = null
let tipoEditando      = 'individual'
let duracionEditando  = 30
let albercaEditando   = 1

// Arrastrar y soltar para mover un bloque de horario
let bloqueArrastrado = null

// Reordenar columnas de maestro (mismo orden aplica a todos los días)
let modoReordenar = false

// Devuelve los maestros que trabajan ese día, en el orden vigente de maestrosData
function maestrosDelDiaFn(dia) {
  return maestrosData.filter(m => {
    const diasT = m.dias_trabajo
    if (!diasT || !Array.isArray(diasT) || diasT.length === 0) return true
    return diasT.includes(dia)
  })
}

// Muestra "PRIMER_NOMBRE FOLIO" en las celdas del calendario
function etiquetaAlumno(est) {
  if (!est) return '—'
  const nombre = (est.nombre || '').split(' ')[0]
  return est.folio ? `${nombre} ${est.folio}` : nombre
}

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
  const container = document.getElementById('calendarioScroll')
  container.innerHTML = ''

  // Mapa: "dia_HH:MM" → [horarios]
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio.slice(0, 5)}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // Slots ocupados por maestro: "dia_HH:MM_mId"
  const ocupado = new Set()
  horariosData.forEach(h => {
    const mId = h.maestro_id || h.id_maestro
    const dur = parseInt(h.duracion) || 30
    const [hh, mm] = h.hora_inicio.split(':').map(Number)
    const startMin  = hh * 60 + mm
    for (let delta = 0; delta < dur; delta += 30) {
      const tot   = startMin + delta
      const tHora = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
      ocupado.add(`${h.dia}_${tHora}_${mId}`)
    }
  })

  // Slots ocupados del alumno a asignar: "dia_HH:MM"
  const estudianteOcupado = new Set()
  horariosEstudiante.forEach(h => {
    const dur = parseInt(h.duracion) || 30
    const [hh, mm] = h.hora_inicio.split(':').map(Number)
    const startMin  = hh * 60 + mm
    for (let delta = 0; delta < dur; delta += 30) {
      const tot = startMin + delta
      estudianteOcupado.add(`${h.dia}_${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`)
    }
  })

  DIAS.forEach((dia, diaIdx) => {
    const maestrosDelDia = maestrosDelDiaFn(dia)
    if (maestrosDelDia.length === 0) return

    const seccion = document.createElement('div')
    seccion.className    = 'dia-seccion'
    seccion.dataset.dia  = dia

    const tituloRow = document.createElement('div')
    tituloRow.className  = 'dia-titulo-row'

    const titulo = document.createElement('div')
    titulo.className   = 'dia-titulo'
    titulo.textContent = DIAS_LABEL[diaIdx]

    const btnReordenarDia = document.createElement('button')
    btnReordenarDia.className = `btn-reordenar-dia${modoReordenar ? ' activo' : ''}`
    btnReordenarDia.title     = modoReordenar ? 'Terminar de reordenar' : 'Reordenar maestros'
    btnReordenarDia.innerHTML = modoReordenar
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Listo`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" y1="12" x2="22" y2="12"/></svg> Reordenar`
    btnReordenarDia.addEventListener('click', toggleModoReordenar)

    const btnImprDia = document.createElement('button')
    btnImprDia.className = 'btn-imprimir-dia'
    btnImprDia.title     = `Imprimir ${DIAS_LABEL[diaIdx]}`
    btnImprDia.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir`
    btnImprDia.addEventListener('click', () => imprimirDia(dia, DIAS_LABEL[diaIdx]))

    tituloRow.appendChild(titulo)
    tituloRow.appendChild(btnReordenarDia)
    tituloRow.appendChild(btnImprDia)
    seccion.appendChild(tituloRow)

    const scroll = document.createElement('div')
    scroll.className = 'dia-tabla-scroll'

    const tabla = document.createElement('table')
    tabla.className = 'calendario-dia'

    // Encabezado
    const thead = document.createElement('thead')
    const trH   = document.createElement('tr')
    const thHora = document.createElement('th')
    thHora.className   = 'th-hora'
    thHora.textContent = 'Hora'
    trH.appendChild(thHora)

    maestrosDelDia.forEach((m, mIdx) => {
      const th     = document.createElement('th')
      th.className = 'th-maestro' + (modoReordenar ? ' th-reordenable' : '')
      th.title     = m.nombre
      th.innerHTML = `<span class="th-dot ${colorMap[m.id_maestro] || 'color-0'}"></span><span class="th-nombre">${m.nombre.split(' ')[0]}</span>`

      if (modoReordenar) {
        const flechas = document.createElement('div')
        flechas.className = 'th-orden-flechas'

        const btnIzq = document.createElement('button')
        btnIzq.className = 'th-flecha'
        btnIzq.type      = 'button'
        btnIzq.disabled  = mIdx === 0
        btnIzq.title     = `Mover a ${m.nombre.split(' ')[0]} a la izquierda`
        btnIzq.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
        btnIzq.addEventListener('click', () => moverMaestro(dia, m.id_maestro, -1))

        const btnDer = document.createElement('button')
        btnDer.className = 'th-flecha'
        btnDer.type      = 'button'
        btnDer.disabled  = mIdx === maestrosDelDia.length - 1
        btnDer.title     = `Mover a ${m.nombre.split(' ')[0]} a la derecha`
        btnDer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
        btnDer.addEventListener('click', () => moverMaestro(dia, m.id_maestro, 1))

        flechas.appendChild(btnIzq)
        flechas.appendChild(btnDer)
        th.appendChild(flechas)
      }

      trH.appendChild(th)
    })

    thead.appendChild(trH)
    tabla.appendChild(thead)

    // Cuerpo
    const tbody = document.createElement('tbody')

    const bloquesDia = dia === 'sabado' ? BLOQUES : BLOQUES_LV

    bloquesDia.forEach(hora => {
      const tr  = document.createElement('tr')
      const tdH = document.createElement('td')
      tdH.className   = 'td-hora'
      tdH.textContent = hora
      tr.appendChild(tdH)

      maestrosDelDia.forEach(m => {
        const td = document.createElement('td')
        td.className = 'td-bloque'

        const bloqsMaestro = (mapa[`${dia}_${hora}`] || []).filter(b =>
          (b.maestro_id || b.id_maestro) === m.id_maestro
        )
        const esCont = bloqsMaestro.length === 0 && ocupado.has(`${dia}_${hora}_${m.id_maestro}`)

        if (bloqsMaestro.length > 0) {
          const esGrupal   = bloqsMaestro.some(b => b.tipo === 'grupal' || b.tipo === 'matros')
          const esMatros   = bloqsMaestro.some(b => b.tipo === 'matros')
          const dur        = Math.max(...bloqsMaestro.map(b => parseInt(b.duracion) || 30))
          const alb        = bloqsMaestro[0].alberca ? ` · A${bloqsMaestro[0].alberca}` : ''
          const colorClass = colorMap[m.id_maestro] || 'color-0'

          const div = document.createElement('div')
          div.className = `celda-clase ${colorClass}${esGrupal ? ' celda-grupal' : ''}`

          if (esGrupal) {
            const tipoLabel = esMatros ? 'MATROS' : 'GRUPAL'
            div.innerHTML = `
              <div class="celda-tipo-label">${tipoLabel} · ${dur}min${alb}</div>`

            if (nuevoEstId && !estudianteOcupado.has(`${dia}_${hora}`)) {
              div.classList.add('celda-grupal-unirse')
              div.addEventListener('click', () => abrirModalGrupo(bloqsMaestro[0], dia, hora, bloqsMaestro, m.id_maestro))
            } else if (!nuevoEstId) {
              div.addEventListener('click', () => abrirModalEditar(bloqsMaestro[0], dia, hora, bloqsMaestro))
            }
          } else {
            const est = estudiantesData.find(e => e.id_estudiante === (bloqsMaestro[0].estudiante_id || bloqsMaestro[0].id_estudiante))
            div.innerHTML = `
              <div class="celda-alumno-nombre">${etiquetaAlumno(est)}</div>
              <div class="celda-info-dur">${dur}min${alb}</div>`

            if (!nuevoEstId) {
              div.addEventListener('click', () => abrirModalEditar(bloqsMaestro[0], dia, hora, bloqsMaestro))
            }
          }

          // Arrastrar para mover el bloque (fuera del modo "asignar a alumno")
          if (!nuevoEstId) {
            div.draggable = true
            div.addEventListener('dragstart', (ev) => iniciarArrastre(ev, div, bloqsMaestro, dia, hora, m.id_maestro))
            div.addEventListener('dragend',   ()   => finalizarArrastre(div))
          }

          td.appendChild(div)

        } else if (esCont) {
          const cont = document.createElement('div')
          cont.className = `celda-cont ${colorMap[m.id_maestro] || 'color-0'}`
          td.appendChild(cont)

        } else if (!estudianteOcupado.has(`${dia}_${hora}`)) {
          // Celda vacía: siempre se puede asignar una clase (con o sin alumno preseleccionado)
          const btnLibre = document.createElement('div')
          btnLibre.className   = 'bloque-libre'
          btnLibre.textContent = '+'
          btnLibre.title       = `${m.nombre} disponible`
          btnLibre.addEventListener('click', () => abrirModalAsignar(dia, hora, [m]))

          // Recibir un bloque arrastrado (fuera del modo "asignar a alumno")
          if (!nuevoEstId) {
            btnLibre.addEventListener('dragover', (ev) => {
              if (!bloqueArrastrado) return
              ev.preventDefault()
              btnLibre.classList.add('drop-target')
            })
            btnLibre.addEventListener('dragleave', () => btnLibre.classList.remove('drop-target'))
            btnLibre.addEventListener('drop', (ev) => {
              ev.preventDefault()
              btnLibre.classList.remove('drop-target')
              moverBloqueArrastrado(dia, hora, m.id_maestro)
            })
          }

          td.appendChild(btnLibre)

        } else if (nuevoEstId && estudianteOcupado.has(`${dia}_${hora}`)) {
          const conf = document.createElement('div')
          conf.className = 'bloque-conflicto-est'
          conf.title     = `${estudianteAsignar ? estudianteAsignar.nombre : 'El alumno'} ya tiene clase a esta hora`
          td.appendChild(conf)
        }

        tr.appendChild(td)
      })

      tbody.appendChild(tr)
    })

    tabla.appendChild(tbody)
    scroll.appendChild(tabla)
    seccion.appendChild(scroll)
    container.appendChild(seccion)
  })

  document.getElementById('loadingCal').style.display       = 'none'
  document.getElementById('calendarioScroll').style.display = 'block'
}

// ─── Reordenar columnas de maestro ─────────────────────────────────────────────
function toggleModoReordenar() {
  modoReordenar = !modoReordenar
  renderCalendario()
}

// Intercambia al maestro con su vecino visible ese día (izquierda: -1, derecha: +1).
// El orden es global: el intercambio se aplica sobre maestrosData completo, así
// que se refleja igual en el resto de los días.
async function moverMaestro(dia, maestroId, direccion) {
  const listaDia = maestrosDelDiaFn(dia)
  const idx      = listaDia.findIndex(m => m.id_maestro === maestroId)
  const nuevoIdx = idx + direccion
  if (idx === -1 || nuevoIdx < 0 || nuevoIdx >= listaDia.length) return

  const otroId = listaDia[nuevoIdx].id_maestro
  const gi = maestrosData.findIndex(m => m.id_maestro === maestroId)
  const gj = maestrosData.findIndex(m => m.id_maestro === otroId)
  if (gi === -1 || gj === -1) return

  ;[maestrosData[gi], maestrosData[gj]] = [maestrosData[gj], maestrosData[gi]]
  renderCalendario()
  await guardarOrdenMaestros()
}

async function guardarOrdenMaestros() {
  try {
    const res = await fetch('/api/maestros/orden', {
      method: 'PATCH', headers,
      body: JSON.stringify({ orden: maestrosData.map(m => m.id_maestro) })
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.message || 'No se pudo guardar el nuevo orden.')
    }
  } catch (err) {
    alert('Error de conexión al guardar el orden.')
  }
}

// ─── Arrastrar y soltar para mover un bloque ───────────────────────────────────
function iniciarArrastre(ev, div, bloqs, dia, hora, maestroId) {
  bloqueArrastrado = {
    ids:       bloqs.map(b => b.id_horario || b.id),
    dia, hora,
    maestroId,
    estudianteId: bloqs[0].estudiante_id || bloqs[0].id_estudiante,
    tipo:      bloqs[0].tipo,
    duracion:  Math.max(...bloqs.map(b => parseInt(b.duracion) || 30)),
    alberca:   bloqs[0].alberca
  }
  ev.dataTransfer.effectAllowed = 'move'
  div.classList.add('arrastrando')
}

function finalizarArrastre(div) {
  div.classList.remove('arrastrando')
  bloqueArrastrado = null
}

async function moverBloqueArrastrado(nuevoDia, nuevaHora, nuevoMaestroId) {
  if (!bloqueArrastrado) return
  const { ids, dia, hora, maestroId, tipo, duracion, alberca } = bloqueArrastrado

  // Se soltó en la misma celda de la que salió → no hay nada que mover
  if (dia === nuevoDia && hora === nuevaHora && maestroId === nuevoMaestroId) return

  const [hh, mm] = nuevaHora.split(':').map(Number)
  const tot      = hh * 60 + mm + duracion
  const horaFin  = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}:00`

  try {
    for (const id of ids) {
      const res = await fetch(`/api/horarios/${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          dia:         nuevoDia,
          hora_inicio: nuevaHora + ':00',
          hora_fin:    horaFin,
          tipo, duracion, alberca,
          maestro_id:  nuevoMaestroId
        })
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.message || 'No se pudo mover la clase.')
        break
      }
    }
  } catch (err) {
    alert('Error de conexión al mover la clase.')
  } finally {
    await recargarCalendario()
  }
}

// ─── Modal Asignar ────────────────────────────────────────────────────────────
function abrirModalAsignar(dia, hora, maestrosLibres) {
  modalDia             = dia
  modalHora            = hora
  modalMaestrosLibres  = maestrosLibres
  tipoSeleccionado     = 'individual'
  duracionSeleccionada = 30
  albercaSeleccionada  = 1

  const wrapAlumno = document.getElementById('modalAsignarAlumnoWrap')
  if (estudianteAsignar) {
    // Modo "asignar horario a alumno específico" (viene del perfil del alumno)
    wrapAlumno.style.display = 'none'
    document.getElementById('modalAsignarNombre').textContent = estudianteAsignar.nombre
  } else {
    // Modo libre: se elige (o registra) el alumno desde el propio calendario
    wrapAlumno.style.display = 'flex'
    wrapAlumno.style.flexDirection = 'column'
    document.getElementById('modalAsignarNombre').textContent = 'Nueva clase'
    poblarSelectAlumnosModal()
    cerrarFormNuevoAlumno()
  }

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

// ─── Selector de alumno dentro del modal (modo libre, sin nuevoEstId) ─────────
function poblarSelectAlumnosModal() {
  const sel = document.getElementById('modalAsignarAlumnoSelect')
  sel.innerHTML = ''
  estudiantesData
    .filter(e => e.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id_estudiante
      opt.textContent = e.folio ? `${e.nombre} (${e.folio})` : e.nombre
      sel.appendChild(opt)
    })
}

function cerrarFormNuevoAlumno() {
  document.getElementById('modalAsignarNuevoAlumnoForm').style.display = 'none'
  document.getElementById('modalAsignarAlumnoSelect').disabled = false
  document.getElementById('naNombre').value    = ''
  document.getElementById('naFolio').value     = ''
  document.getElementById('naTelefono').value  = ''
  document.getElementById('naPrecio').value    = ''
  const err = document.getElementById('naError')
  err.style.display = 'none'
  err.textContent   = ''
}

document.getElementById('modalAsignarBtnNuevoAlumno').addEventListener('click', () => {
  document.getElementById('modalAsignarNuevoAlumnoForm').style.display = 'flex'
  document.getElementById('modalAsignarAlumnoSelect').disabled = true
})

document.getElementById('naCancelar').addEventListener('click', cerrarFormNuevoAlumno)

document.getElementById('naGuardar').addEventListener('click', async () => {
  const nombre = document.getElementById('naNombre').value.trim()
  const err    = document.getElementById('naError')
  err.style.display = 'none'

  if (!nombre) {
    err.textContent   = 'El nombre es requerido.'
    err.style.display = 'block'
    return
  }

  const btn = document.getElementById('naGuardar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res = await fetch('/api/estudiantes', {
      method: 'POST', headers,
      body: JSON.stringify({
        nombre,
        folio:          document.getElementById('naFolio').value.trim()    || null,
        telefono:       document.getElementById('naTelefono').value.trim() || null,
        precio_mensual: parseFloat(document.getElementById('naPrecio').value) || 0
      })
    })
    const data = await res.json()
    if (!res.ok) {
      err.textContent   = data.message || 'No se pudo registrar el alumno.'
      err.style.display = 'block'
      return
    }

    estudiantesData.push(data.estudiante)
    poblarSelectAlumnosModal()
    document.getElementById('modalAsignarAlumnoSelect').value = data.estudiante.id_estudiante
    cerrarFormNuevoAlumno()
  } catch (e) {
    err.textContent   = 'No se pudo conectar al servidor.'
    err.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

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
  if (!modalDia || !modalHora) return

  // Modo libre (sin nuevoEstId): el alumno viene del selector del modal
  const estudianteId = estudianteAsignar
    ? estudianteAsignar.id_estudiante
    : parseInt(document.getElementById('modalAsignarAlumnoSelect').value)

  if (!estudianteId) { alert('Selecciona un alumno.'); return }

  const btn = document.getElementById('modalAsignarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const maestroId = parseInt(document.getElementById('modalAsignarMaestro').value)
  const [hh, mm]  = modalHora.split(':').map(Number)
  const tot       = hh * 60 + mm + duracionSeleccionada
  const horaFin   = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  const resetBoton = () => {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }

  // Modo libre: el alumno no viene precargado, así que se valida aquí que no
  // tenga ya una clase con OTRO maestro en ese mismo horario (el backend solo
  // valida choques del lado del maestro).
  if (!estudianteAsignar) {
    try {
      const resChk = await fetch(`/api/horarios/estudiante/${estudianteId}`, { headers })
      const horariosAlumno = (await resChk.json()).horarios || []
      const newStart = hh * 60 + mm
      const newEnd   = newStart + duracionSeleccionada
      const chocaConOtro = horariosAlumno.some(h => {
        if (h.dia !== modalDia) return false
        const [exH, exM] = h.hora_inicio.split(':').map(Number)
        const exStart = exH * 60 + exM
        const exEnd   = exStart + (parseInt(h.duracion) || 30)
        return newStart < exEnd && exStart < newEnd
      })
      if (chocaConOtro) {
        alert('Este alumno ya tiene una clase en ese horario.')
        resetBoton()
        return
      }
    } catch (e) { /* si falla la verificación, se continúa; el backend igual valida el lado del maestro */ }
  }

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteId,
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

    // Igual que el resto de los flujos de alta de clase: regresa al perfil del
    // alumno con ?nuevaClase=true para que salga el mensaje de precio mensual /
    // cargo extra, y quede reflejado en Historial de pagos, Pagos y Reportes.
    window.location.href = `perfil-estudiante.html?id=${estudianteId}&nuevaClase=true`
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    resetBoton()
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

  const yaEstaEnGrupo = nuevoEstId && todosLosBloques.some(b =>
    (b.estudiante_id || b.id_estudiante) === nuevoEstId
  )

  const accionesDiv = document.getElementById('modalGrupoAcciones')
  accionesDiv.style.display = (nuevoEstId && estudianteAsignar && !yaEstaEnGrupo) ? 'flex' : 'none'

  if (yaEstaEnGrupo) {
    document.getElementById('modalGrupoCount').textContent =
      `${total} alumno${total !== 1 ? 's' : ''} en este grupo · El alumno ya está inscrito`
  }

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
    estudianteEnModalEditar = null
    document.getElementById('modalEditarPerfil').style.display = 'none'
  } else {
    document.getElementById('modalEditarSecAlumnos').style.display    = 'none'
    document.getElementById('modalEditarSecIndividual').style.display = 'block'
    const est = estudiantesData.find(e => e.id_estudiante === (bloque.estudiante_id || bloque.id_estudiante))
    document.getElementById('modalEditarAlumnoNombre').textContent = est ? est.nombre : '—'
    estudianteEnModalEditar = bloque.estudiante_id || bloque.id_estudiante
    document.getElementById('modalEditarPerfil').style.display = 'inline-flex'
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

document.getElementById('modalEditarPerfil').addEventListener('click', () => {
  if (!estudianteEnModalEditar) return
  window.location.href = `perfil-estudiante.html?id=${estudianteEnModalEditar}`
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
    window.location.href = `perfil-estudiante.html?id=${estId}&nuevaClase=true`
  } catch (err) { alert('Error de conexión.') }
})

// ─── Imprimir día específico ──────────────────────────────────────────────────
function imprimirDia(dia, diaLabel) {
  const hoy     = new Date()
  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  document.getElementById('printHeaderDate').textContent =
    'Generado el ' + hoy.toLocaleDateString('es-MX', opciones)
  document.getElementById('printHeaderSub').textContent =
    diaLabel + ' — Todos los maestros'

  const secciones = document.querySelectorAll('.dia-seccion')
  secciones.forEach(sec => {
    if (sec.dataset.dia !== dia) sec.classList.add('ocultar-impresion')
  })

  const restaurar = () => {
    secciones.forEach(sec => sec.classList.remove('ocultar-impresion'))
    window.removeEventListener('afterprint', restaurar)
  }
  window.addEventListener('afterprint', restaurar)
  window.print()
}

iniciar()
