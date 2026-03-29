/**
 * datos.js — Capa de datos compartida v2.0
 * ==========================================
 * Maneja empleados, cargos, registros, permisos y cálculo de pagos.
 * Almacenamiento: localStorage del navegador (sin servidor).
 *
 * CLAVES localStorage:
 *   'asi_empleados'   → Array de objetos { id, nombre, cargo }
 *   'asi_registros'   → Array de objetos de jornada
 *   'asi_edits_log'   → Array de auditoría de ediciones admin
 */

// ─────────────────────────────────────────────
// CONFIGURACIÓN GLOBAL
// ─────────────────────────────────────────────
const CONFIG = {
  PASSWORD_ADMIN:    'Diaz1990',   // ← CAMBIAR antes de producción

  HORA_ENTRADA_STD:  '08:00',
  HORA_SALIDA_STD:   '18:00',
  MINUTOS_ALMUERZO:  30,
  // Jornada efectiva máxima = (18:00-08:00) - 30min = 570 min = 9.5h

  HORA_CIERRE_AUTO:  '18:30',      // cierre automático si olvidaron marcar salida
  TARIFA_HORA_EXTRA: 1.70,

  VERSION_APP: '2.0.0'
};

// ─────────────────────────────────────────────
// CARGOS Y REGLAS SALARIALES
// ─────────────────────────────────────────────
const CARGOS = {
  costurera: {
    label:       'Costurera',
    tipo:        'diario',      // salario fijo por día trabajado
    salario:     20.00,
    extra:       1.70,
    descripcion: '$20.00 / día + $1.70 h/extra'
  },
  empaque: {
    label:       'Empaque',
    tipo:        'diario',
    salario:     15.00,
    extra:       1.70,
    descripcion: '$15.00 / día + $1.70 h/extra'
  },
  estampador: {
    label:       'Estampador',
    tipo:        'por_hora',    // sin sueldo fijo, se paga cada hora trabajada
    salario:     1.20,
    extra:       1.20,
    descripcion: '$1.20 / hora'
  },
  administrador: {
    label:       'Administrador',
    tipo:        'por_hora',    // sin sueldo fijo, se paga cada hora trabajada
    salario:     20.00,
    extra:       1.70,
    descripcion: '$20.00 / día + $1.70 h/extra'
  }
};

function obtenerCargo(clave) {
  return CARGOS[clave] || { label: clave, tipo: 'diario', salario: 0, extra: 0, descripcion: '—' };
}

function listarCargos() {
  return Object.entries(CARGOS).map(([k, v]) => ({ key: k, label: v.label, descripcion: v.descripcion }));
}

// ─────────────────────────────────────────────
// EMPLEADOS
// ─────────────────────────────────────────────

function obtenerEmpleados() {
  const raw = localStorage.getItem('asi_empleados');
  if (!raw) {
    const defaults = [
      { id: 'e1', nombre: 'Ximena',   cargo: 'costurera'  },
      { id: 'e2', nombre: 'Juan Pérez',     cargo: 'empaque'    },
      { id: 'e3', nombre: 'Ana López',      cargo: 'estampador' }
    ];
    guardarEmpleados(defaults);
    return defaults;
  }
  return JSON.parse(raw);
}

function guardarEmpleados(lista) {
  localStorage.setItem('asi_empleados', JSON.stringify(lista));
}

function agregarEmpleadoDB(nombre, cargo) {
  nombre = nombre.trim();
  if (!nombre)        return { ok: false, mensaje: 'El nombre no puede estar vacío.' };
  if (!CARGOS[cargo]) return { ok: false, mensaje: 'Selecciona un cargo válido.' };

  const lista = obtenerEmpleados();
  if (lista.find(e => e.nombre.toLowerCase() === nombre.toLowerCase())) {
    return { ok: false, mensaje: `"${nombre}" ya existe en la lista.` };
  }
  lista.push({ id: generarID(), nombre, cargo });
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  guardarEmpleados(lista);
  return { ok: true };
}

function eliminarEmpleadoDB(id) {
  guardarEmpleados(obtenerEmpleados().filter(e => e.id !== id));
}

function editarEmpleadoDB(id, nuevoNombre, nuevoCargo) {
  const lista = obtenerEmpleados().map(e =>
    e.id === id ? { ...e, nombre: nuevoNombre.trim(), cargo: nuevoCargo } : e
  );
  guardarEmpleados(lista);
}

// ─────────────────────────────────────────────
// REGISTROS DE JORNADA
// ─────────────────────────────────────────────

function obtenerRegistros() {
  const raw = localStorage.getItem('asi_registros');
  return raw ? JSON.parse(raw) : [];
}

function guardarRegistros(registros) {
  localStorage.setItem('asi_registros', JSON.stringify(registros));
}

// ── Entrada ───────────────────────────────────

function registrarEntrada(empleadoId, foto = null, coords = null) { // <--- Agregar parámetros
  const empleado = obtenerEmpleados().find(e => e.id === empleadoId);
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  const hoy = fechaHoy();
  const registros = obtenerRegistros();

  if (_buscarJornadaAbierta(registros, empleadoId, hoy) !== -1) {
    return { ok: false, mensaje: `${empleado.nombre} ya tiene una entrada abierta hoy.` };
  }

  const nuevo = _registroVacio(empleado, hoy);
  nuevo.entrada = horaActual();
  
  // GUARDAR LOS DATOS NUEVOS
  nuevo.foto_entrada = foto;
  nuevo.coords_entrada = coords;

  registros.push(nuevo);
  guardarRegistros(registros);
  return { ok: true, nombre: empleado.nombre, cargo: empleado.cargo };
}

// ── Salida normal ─────────────────────────────

function registrarSalida(empleadoId, foto = null, coords = null) { // <--- Agregar parámetros
  const empleado = obtenerEmpleados().find(e => e.id === empleadoId);
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  const registros = obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok: false, mensaje: `${empleado.nombre} no tiene entrada registrada hoy.` };

  const r = registros[idx];
  _cerrarPermisoAbierto(r);
  r.salida = horaActual();

  // GUARDAR LOS DATOS NUEVOS
  r.foto_salida = foto;
  r.coords_salida = coords;

  _calcularTotales(r);
  guardarRegistros(registros);
  return { ok: true, nombre: empleado.nombre, cargo: empleado.cargo };
}

// ── Salida por permiso ────────────────────────

function registrarSalidaPermiso(empleadoId) {
  const empleado = obtenerEmpleados().find(e => e.id === empleadoId);
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  const registros = obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok: false, mensaje: `${empleado.nombre} no tiene entrada registrada hoy.` };

  const r = registros[idx];
  if (r.permisos.find(p => !p.entrada)) {
    return { ok: false, mensaje: `${empleado.nombre} ya tiene un permiso activo sin regresar.` };
  }

  r.permisos.push({ id: generarID(), salida: horaActual(), entrada: null });
  guardarRegistros(registros);
  return { ok: true, nombre: empleado.nombre, cargo: empleado.cargo };
}

// ── Regreso de permiso ────────────────────────

function registrarEntradaPermiso(empleadoId) {
  const empleado = obtenerEmpleados().find(e => e.id === empleadoId);
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  const registros = obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok: false, mensaje: `${empleado.nombre} no tiene entrada registrada hoy.` };

  const r = registros[idx];
  const permisoAbierto = r.permisos.find(p => !p.entrada);
  if (!permisoAbierto) return { ok: false, mensaje: `${empleado.nombre} no tiene permiso activo.` };

  permisoAbierto.entrada = horaActual();
  r.minutos_permiso = (r.minutos_permiso || 0) + calcularMinutos(permisoAbierto.salida, permisoAbierto.entrada);
  guardarRegistros(registros);
  return { ok: true, nombre: empleado.nombre, cargo: empleado.cargo };
}

// ── Estado actual del empleado hoy ───────────

function estadoEmpleadoHoy(empleadoId) {
  const hoy = fechaHoy();
  const r = obtenerRegistros().find(x => x.empleadoId === empleadoId && x.fecha === hoy);
  if (!r || !r.entrada)                    return 'sin_entrada';
  if (r.salida)                             return 'jornada_cerrada';
  if (r.permisos.find(p => !p.entrada))    return 'en_permiso';
  return 'en_jornada';
}

// ── Cierre automático ─────────────────────────

function ejecutarCierreAutomatico() {
  const hoy   = fechaHoy();
  const ahora = horaActual();
  if (ahora < CONFIG.HORA_CIERRE_AUTO) return;

  const registros = obtenerRegistros();
  let cambios = false;
  registros.forEach(r => {
    if (r.fecha === hoy && r.entrada && !r.salida) {
      _cerrarPermisoAbierto(r);
      r.salida      = CONFIG.HORA_CIERRE_AUTO;
      r.salida_auto = true;
      _calcularTotales(r);
      cambios = true;
    }
  });
  if (cambios) guardarRegistros(registros);
}

// ─────────────────────────────────────────────
// EDICIÓN ADMIN
// ─────────────────────────────────────────────

function editarRegistroAdmin(registroId, campos) {
  const registros = obtenerRegistros();
  const idx = registros.findIndex(r => r.id === registroId);
  if (idx === -1) return { ok: false, mensaje: 'Registro no encontrado.' };

  const r = registros[idx];

  // Log de auditoría
  const log = obtenerLogEdiciones();
  Object.entries(campos).forEach(([campo, nuevoValor]) => {
    log.push({
      registroId,
      campo,
      valorAntes:   r[campo] ?? null,
      valorDespues: nuevoValor,
      fecha:        fechaHoy(),
      hora:         horaActual()
    });
  });
  guardarLogEdiciones(log);

  if (campos.entrada !== undefined) r.entrada = campos.entrada || null;
  if (campos.salida  !== undefined) r.salida  = campos.salida  || null;
  if (campos.nota    !== undefined) r.nota    = campos.nota;

  r.editado     = true;
  r.salida_auto = false;

  if (r.entrada && r.salida) _calcularTotales(r);

  guardarRegistros(registros);
  return { ok: true };
}

function obtenerLogEdiciones() {
  const raw = localStorage.getItem('asi_edits_log');
  return raw ? JSON.parse(raw) : [];
}
function guardarLogEdiciones(log) {
  localStorage.setItem('asi_edits_log', JSON.stringify(log));
}

// ─────────────────────────────────────────────
// CÁLCULO DE PAGOS
// ─────────────────────────────────────────────

function calcularPagoEmpleado(empleadoId, registros) {
  const empleado = obtenerEmpleados().find(e => e.id === empleadoId);
  if (!empleado) return null;

  const cargo     = obtenerCargo(empleado.cargo);
  const completos = registros.filter(r => r.empleadoId === empleadoId && r.salida);

  let pagoBase = 0, pagoExtra = 0, diasTrabajados = 0, horasTotales = 0, horasExtra = 0;

  completos.forEach(r => {
    diasTrabajados++;
    horasTotales += r.total_horas || 0;

    const limMin  = 570 - (r.minutos_permiso || 0);  // jornada normal ajustada
    const totalMin = (r.total_horas || 0) * 60;
    const normMin  = Math.min(totalMin, limMin);
    const extraMin = Math.max(0, totalMin - limMin);
    const hExtra   = extraMin / 60;
    horasExtra    += hExtra;

    if (cargo.tipo === 'diario') {
      pagoBase  += cargo.salario;
      pagoExtra += hExtra * cargo.extra;
    } else {
      pagoBase  += (normMin / 60) * cargo.salario;
      pagoExtra += hExtra * cargo.extra;
    }
  });

  return {
    empleadoId,
    nombre:        empleado.nombre,
    cargo:         cargo.label,
    descripcion:   cargo.descripcion,
    diasTrabajados,
    horasTotales:  Math.round(horasTotales * 100) / 100,
    horasExtra:    Math.round(horasExtra   * 100) / 100,
    pagoBase:      Math.round(pagoBase     * 100) / 100,
    pagoExtra:     Math.round(pagoExtra    * 100) / 100,
    pagoTotal:     Math.round((pagoBase + pagoExtra) * 100) / 100
  };
}

// ─────────────────────────────────────────────
// HELPERS PRIVADOS
// ─────────────────────────────────────────────

function _registroVacio(empleado, fecha) {
  return {
    id: generarID(), 
    empleadoId: empleado.id,
    nombre: empleado.nombre, 
    cargo: empleado.cargo,
    fecha, 
    entrada: null, 
    salida: null,
    // --- NUEVOS CAMPOS ---
    foto_entrada: null,
    coords_entrada: null,
    foto_salida: null,
    coords_salida: null,
    // ---------------------
    salida_auto: false, 
    permisos: [], 
    minutos_permiso: 0,
    horas_normales: null, 
    horas_extra: null, 
    total_horas: null,
    pago_base: null, 
    pago_extra: null, 
    pago_total: null,
    editado: false, 
    nota: ''
  };
}

function _buscarJornadaAbierta(registros, empleadoId, fecha) {
  for (let i = registros.length - 1; i >= 0; i--) {
    const r = registros[i];
    if (r.empleadoId === empleadoId && r.fecha === fecha && r.entrada && !r.salida) return i;
  }
  return -1;
}

function _cerrarPermisoAbierto(r) {
  const p = r.permisos.find(x => !x.entrada);
  if (p) {
    p.entrada = horaActual();
    r.minutos_permiso = (r.minutos_permiso || 0) + calcularMinutos(p.salida, p.entrada);
  }
}

function _calcularTotales(r) {
  const brutoMin    = calcularMinutos(r.entrada, r.salida);
  const efectivoMin = Math.max(0, brutoMin - CONFIG.MINUTOS_ALMUERZO - (r.minutos_permiso || 0));
  const limiteMin   = 570; // 9.5h × 60
  const normMin     = Math.min(efectivoMin, limiteMin);
  const extraMin    = Math.max(0, efectivoMin - limiteMin);

  r.horas_normales = formatearHoras(normMin);
  r.horas_extra    = formatearHoras(extraMin);
  r.total_horas    = Math.round(efectivoMin) / 60;

  const cargo  = obtenerCargo(r.cargo);
  const hExtra = extraMin / 60;

  if (cargo.tipo === 'diario') {
    r.pago_base  = cargo.salario;
    r.pago_extra = Math.round(hExtra * cargo.extra * 100) / 100;
  } else {
    r.pago_base  = Math.round((normMin / 60) * cargo.salario * 100) / 100;
    r.pago_extra = Math.round(hExtra * cargo.extra * 100) / 100;
  }
  r.pago_total = Math.round((r.pago_base + r.pago_extra) * 100) / 100;
}

// ─────────────────────────────────────────────
// UTILIDADES PÚBLICAS
// ─────────────────────────────────────────────

function calcularMinutos(inicio, fin) {
  if (!inicio || !fin) return 0;
  const p = t => { const [h,m,s] = t.split(':').map(Number); return h*3600+m*60+(s||0); };
  return Math.max(0, (p(fin) - p(inicio)) / 60);
}

function formatearHoras(minutos) {
  const h = Math.floor(minutos / 60), m = Math.round(minutos % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fechaHoy()  { return new Date().toISOString().slice(0, 10); }
function horaActual(){ return new Date().toLocaleTimeString('es-HN', { hour12: false }); }
function generarID() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function formatearFecha(f) {
  if (!f) return '';
  const [y,m,d] = f.split('-');
  return `${d}/${m}/${y}`;
}

function calcularResumen(registros) {
  const hoy = fechaHoy();
  return {
    total_registros: registros.length,
    presentes_hoy:   registros.filter(r => r.fecha === hoy && r.entrada && !r.salida).length,
    en_permiso_hoy:  registros.filter(r => r.fecha === hoy && r.entrada && !r.salida && r.permisos.some(p => !p.entrada)).length,
    con_salida:      registros.filter(r => r.salida).length,
    con_extra:       registros.filter(r => r.horas_extra && r.horas_extra !== '0m').length
  };
}
