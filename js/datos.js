/**
 * datos.js — v3.0 Firebase Firestore
 * ====================================
 * Lógica de negocio idéntica a v2 + Firebase como backend.
 * Preserva: cargos (costurera/empaque/estampador/administrador),
 * regla de piso en horas, permisos, cierre automático, auditoría.
 *
 * COLECCIONES Firestore:
 *   'empleados'  → { id, nombre, cargo }
 *   'registros'  → documentos de jornada
 *   'edits_log'  → auditoría de ediciones admin
 */

// ─────────────────────────────────────────────
// FIREBASE
// ─────────────────────────────────────────────
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         getDocs, addDoc, setDoc, updateDoc,
         deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const _app = initializeApp({
  apiKey:            "AIzaSyCw55KmE9Ql6ceF9Agh_cFwnktiJdgUPrc",
  authDomain:        "bbyckidsadmi.firebaseapp.com",
  projectId:         "bbyckidsadmi",
  storageBucket:     "bbyckidsadmi.firebasestorage.app",
  messagingSenderId: "9436616933",
  appId:             "1:9436616933:web:1493ffcf97322c93831c0c"
});
const _db = getFirestore(_app);

// ─────────────────────────────────────────────
// CONFIGURACIÓN GLOBAL
// ─────────────────────────────────────────────
const CONFIG = {
  PASSWORD_ADMIN:    'Diaz1990',
  HORA_ENTRADA_STD:  '08:00',
  HORA_SALIDA_STD:   '18:00',
  MINUTOS_ALMUERZO:  30,
  HORA_CIERRE_AUTO:  '18:30',
  TARIFA_HORA_EXTRA: 1.70,
  VERSION_APP:       '3.0.0'
};

// ─────────────────────────────────────────────
// CARGOS
// ─────────────────────────────────────────────
const CARGOS = {
  costurera:     { label:'Costurera',     tipo:'diario',   salario:20.00, extra:1.70, descripcion:'$20.00 / día + $1.70 h/extra' },
  empaque:       { label:'Empaque',       tipo:'diario',   salario:15.00, extra:1.70, descripcion:'$15.00 / día + $1.70 h/extra' },
  estampador:    { label:'Estampador',    tipo:'por_hora', salario: 1.20, extra:1.20, descripcion:'$1.20 / hora' },
  administrador: { label:'Administrador', tipo:'diario',   salario:20.00, extra:1.70, descripcion:'$20.00 / día + $1.70 h/extra' }
};

function obtenerCargo(clave) {
  return CARGOS[clave] || { label:clave, tipo:'diario', salario:0, extra:0, descripcion:'—' };
}
function listarCargos() {
  return Object.entries(CARGOS).map(([k,v]) => ({ key:k, label:v.label, descripcion:v.descripcion }));
}

// ─────────────────────────────────────────────
// EMPLEADOS
// ─────────────────────────────────────────────

async function obtenerEmpleados() {
  const snap = await getDocs(collection(_db,'empleados'));
  const lista = snap.docs.map(d => ({ ...d.data() }));
  lista.sort((a,b) => a.nombre.localeCompare(b.nombre));
  return lista;
}

async function agregarEmpleadoDB(nombre, cargo) {
  nombre = nombre.trim();
  if (!nombre)        return { ok:false, mensaje:'El nombre no puede estar vacío.' };
  if (!CARGOS[cargo]) return { ok:false, mensaje:'Selecciona un cargo válido.' };
  const lista = await obtenerEmpleados();
  if (lista.find(e => e.nombre.toLowerCase() === nombre.toLowerCase()))
    return { ok:false, mensaje:`"${nombre}" ya existe.` };
  const id = generarID();
  await setDoc(doc(_db,'empleados',id), { id, nombre, cargo });
  return { ok:true };
}

async function eliminarEmpleadoDB(id) {
  await deleteDoc(doc(_db,'empleados',id));
}

async function editarEmpleadoDB(id, nuevoNombre, nuevoCargo) {
  await updateDoc(doc(_db,'empleados',id), { nombre:nuevoNombre.trim(), cargo:nuevoCargo });
}

// ─────────────────────────────────────────────
// REGISTROS
// ─────────────────────────────────────────────

async function obtenerRegistros() {
  const snap = await getDocs(collection(_db,'registros'));
  return snap.docs.map(d => ({ ...d.data() }));
}

async function _guardarRegistro(r) {
  const { _docId, ...data } = r;
  await setDoc(doc(_db,'registros',r.id), data);
}

// ── Entrada ────────────────────────────────────

async function registrarEntrada(empleadoId, foto = null, coords = null) {
  const empleados = await obtenerEmpleados();
  const empleado  = empleados.find(e => e.id === empleadoId);
  if (!empleado) return { ok:false, mensaje:'Empleado no encontrado.' };

  const hoy = fechaHoy();
  const registros = await obtenerRegistros();
  if (_buscarJornadaAbierta(registros, empleadoId, hoy) !== -1)
    return { ok:false, mensaje:`${empleado.nombre} ya tiene una entrada abierta hoy.` };

  const nuevo = _registroVacio(empleado, hoy);
  nuevo.entrada        = horaActual();
  nuevo.foto_entrada   = foto;
  nuevo.coords_entrada = coords;
  await _guardarRegistro(nuevo);
  return { ok:true, nombre:empleado.nombre, cargo:empleado.cargo };
}

// ── Salida ─────────────────────────────────────

async function registrarSalida(empleadoId, foto = null, coords = null) {
  const empleados = await obtenerEmpleados();
  const empleado  = empleados.find(e => e.id === empleadoId);
  if (!empleado) return { ok:false, mensaje:'Empleado no encontrado.' };

  const registros = await obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok:false, mensaje:`${empleado.nombre} no tiene entrada registrada hoy.` };

  const r = registros[idx];
  _cerrarPermisoAbierto(r);
  r.salida       = horaActual();
  r.foto_salida  = foto;
  r.coords_salida = coords;
  _calcularTotales(r);
  await _guardarRegistro(r);
  return { ok:true, nombre:empleado.nombre, cargo:empleado.cargo };
}

// ── Salida por permiso ─────────────────────────

async function registrarSalidaPermiso(empleadoId) {
  const empleados = await obtenerEmpleados();
  const empleado  = empleados.find(e => e.id === empleadoId);
  if (!empleado) return { ok:false, mensaje:'Empleado no encontrado.' };

  const registros = await obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok:false, mensaje:`${empleado.nombre} no tiene entrada hoy.` };

  const r = registros[idx];
  if (r.permisos.find(p => !p.entrada))
    return { ok:false, mensaje:`${empleado.nombre} ya tiene un permiso activo.` };

  r.permisos.push({ id:generarID(), salida:horaActual(), entrada:null });
  await _guardarRegistro(r);
  return { ok:true, nombre:empleado.nombre, cargo:empleado.cargo };
}

// ── Regreso de permiso ─────────────────────────

async function registrarEntradaPermiso(empleadoId) {
  const empleados = await obtenerEmpleados();
  const empleado  = empleados.find(e => e.id === empleadoId);
  if (!empleado) return { ok:false, mensaje:'Empleado no encontrado.' };

  const registros = await obtenerRegistros();
  const idx = _buscarJornadaAbierta(registros, empleadoId, fechaHoy());
  if (idx === -1) return { ok:false, mensaje:`${empleado.nombre} no tiene entrada hoy.` };

  const r = registros[idx];
  const p = r.permisos.find(x => !x.entrada);
  if (!p) return { ok:false, mensaje:`${empleado.nombre} no tiene permiso activo.` };

  p.entrada = horaActual();
  r.minutos_permiso = (r.minutos_permiso||0) + calcularMinutos(p.salida, p.entrada);
  await _guardarRegistro(r);
  return { ok:true, nombre:empleado.nombre, cargo:empleado.cargo };
}

// ── Estado del empleado hoy ────────────────────

async function estadoEmpleadoHoy(empleadoId) {
  const hoy = fechaHoy();
  const registros = await obtenerRegistros();
  const r = registros.find(x => x.empleadoId === empleadoId && x.fecha === hoy);
  if (!r || !r.entrada)                 return 'sin_entrada';
  if (r.salida)                          return 'jornada_cerrada';
  if (r.permisos.find(p => !p.entrada)) return 'en_permiso';
  return 'en_jornada';
}

// ── Cierre automático ──────────────────────────

async function ejecutarCierreAutomatico() {
  const hoy   = fechaHoy();
  const ahora = horaActual();
  if (ahora < CONFIG.HORA_CIERRE_AUTO) return;

  const registros = await obtenerRegistros();
  const promesas  = [];
  registros.forEach(r => {
    if (r.fecha === hoy && r.entrada && !r.salida) {
      _cerrarPermisoAbierto(r);
      r.salida      = CONFIG.HORA_CIERRE_AUTO;
      r.salida_auto = true;
      _calcularTotales(r);
      promesas.push(_guardarRegistro(r));
    }
  });
  await Promise.all(promesas);
}

// ─────────────────────────────────────────────
// EDICIÓN ADMIN
// ─────────────────────────────────────────────

async function editarRegistroAdmin(registroId, campos) {
  const registros = await obtenerRegistros();
  const r = registros.find(x => x.id === registroId);
  if (!r) return { ok:false, mensaje:'Registro no encontrado.' };

  await addDoc(collection(_db,'edits_log'), {
    registroId, cambios:campos, fecha:fechaHoy(), hora:horaActual()
  });

  if (campos.entrada !== undefined) r.entrada = campos.entrada || null;
  if (campos.salida  !== undefined) r.salida  = campos.salida  || null;
  if (campos.nota    !== undefined) r.nota    = campos.nota;
  r.editado     = true;
  r.salida_auto = false;
  if (r.entrada && r.salida) _calcularTotales(r);

  await _guardarRegistro(r);
  return { ok:true };
}

// ─────────────────────────────────────────────
// CÁLCULO DE PAGOS
// ─────────────────────────────────────────────

function calcularPagoEmpleado(empleadoId, empleado, registros) {
  const cargo     = obtenerCargo(empleado.cargo);
  const completos = registros.filter(r => r.empleadoId === empleadoId && r.salida);

  let pagoBase=0, pagoExtra=0, diasTrabajados=0, horasTotales=0, horasExtra=0;

  completos.forEach(r => {
    diasTrabajados++;
    horasTotales += r.total_horas || 0;

    const brutoMin    = calcularMinutos(r.entrada, r.salida);
    const efectivoMin = Math.max(0, brutoMin - CONFIG.MINUTOS_ALMUERZO - (r.minutos_permiso||0));
    const limiteMin   = 570;
    const normMin     = Math.min(efectivoMin, limiteMin);
    const extraMin    = Math.max(0, efectivoMin - limiteMin);
    const hNorm       = Math.floor(normMin  / 60);
    const hExtra      = Math.floor(extraMin / 60);
    horasExtra       += hExtra;

    if (cargo.tipo === 'diario') {
      pagoBase  += efectivoMin >= limiteMin ? cargo.salario : hNorm * (cargo.salario / 9.5);
      pagoExtra += hExtra * cargo.extra;
    } else {
      pagoBase  += hNorm  * cargo.salario;
      pagoExtra += hExtra * cargo.extra;
    }
  });

  return {
    empleadoId,
    nombre:       empleado.nombre,
    cargo:        cargo.label,
    descripcion:  cargo.descripcion,
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
    id:generarID(), empleadoId:empleado.id,
    nombre:empleado.nombre, cargo:empleado.cargo,
    fecha, entrada:null, salida:null,
    foto_entrada:null, coords_entrada:null,
    foto_salida:null,  coords_salida:null,
    salida_auto:false, permisos:[], minutos_permiso:0,
    horas_normales:null, horas_extra:null, total_horas:null,
    pago_base:null, pago_extra:null, pago_total:null,
    editado:false, nota:''
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
    r.minutos_permiso = (r.minutos_permiso||0) + calcularMinutos(p.salida, p.entrada);
  }
}

function _calcularTotales(r) {
  const brutoMin    = calcularMinutos(r.entrada, r.salida);
  const efectivoMin = Math.max(0, brutoMin - CONFIG.MINUTOS_ALMUERZO - (r.minutos_permiso||0));
  const limiteMin   = 570;
  const normMin     = Math.min(efectivoMin, limiteMin);
  const extraMin    = Math.max(0, efectivoMin - limiteMin);

  // Mostrar tiempo real, pagar horas completas (piso)
  r.horas_normales = formatearHoras(normMin);
  r.horas_extra    = formatearHoras(extraMin);
  r.total_horas    = Math.round(efectivoMin) / 60;

  const cargo         = obtenerCargo(r.cargo);
  const hNormPagadas  = Math.floor(normMin  / 60);
  const hExtraPagadas = Math.floor(extraMin / 60);

  if (cargo.tipo === 'diario') {
    r.pago_base  = efectivoMin >= limiteMin
      ? cargo.salario
      : Math.round(hNormPagadas * (cargo.salario / 9.5) * 100) / 100;
    r.pago_extra = Math.round(hExtraPagadas * cargo.extra * 100) / 100;
  } else {
    r.pago_base  = Math.round(hNormPagadas  * cargo.salario * 100) / 100;
    r.pago_extra = Math.round(hExtraPagadas * cargo.extra   * 100) / 100;
  }
  r.pago_total = Math.round((r.pago_base + r.pago_extra) * 100) / 100;
}

// ─────────────────────────────────────────────
// UTILIDADES PÚBLICAS
// ─────────────────────────────────────────────

function calcularMinutos(inicio, fin) {
  if (!inicio || !fin) return 0;
  const p = t => { const [h,m,s]=t.split(':').map(Number); return h*3600+m*60+(s||0); };
  return Math.max(0, (p(fin)-p(inicio))/60);
}

function formatearHoras(minutos) {
  const h=Math.floor(minutos/60), m=Math.round(minutos%60);
  if (h===0) return `${m}m`;
  if (m===0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fechaHoy()   { return new Date().toISOString().slice(0,10); }
function horaActual() { return new Date().toLocaleTimeString('es-HN',{hour12:false}); }
function generarID()  { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function formatearFecha(f) {
  if (!f) return '';
  const [y,m,d]=f.split('-');
  return `${d}/${m}/${y}`;
}

function calcularResumen(registros) {
  const hoy = fechaHoy();
  return {
    total_registros: registros.length,
    presentes_hoy:   registros.filter(r=>r.fecha===hoy&&r.entrada&&!r.salida).length,
    en_permiso_hoy:  registros.filter(r=>r.fecha===hoy&&r.entrada&&!r.salida&&r.permisos.some(p=>!p.entrada)).length,
    con_salida:      registros.filter(r=>r.salida).length,
    con_extra:       registros.filter(r=>r.horas_extra&&r.horas_extra!=='0m').length
  };
}

export {
  CONFIG, CARGOS,
  obtenerCargo, listarCargos,
  obtenerEmpleados, agregarEmpleadoDB, eliminarEmpleadoDB, editarEmpleadoDB,
  obtenerRegistros, registrarEntrada, registrarSalida,
  registrarSalidaPermiso, registrarEntradaPermiso,
  estadoEmpleadoHoy, ejecutarCierreAutomatico,
  editarRegistroAdmin, calcularPagoEmpleado,
  calcularMinutos, formatearHoras, calcularResumen,
  fechaHoy, horaActual, formatearFecha
};
