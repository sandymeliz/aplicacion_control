/**
 * app.js — Lógica pantalla empleados v2.0
 * =========================================
 * Flujo:
 *   1. Pantalla principal → empleada selecciona su nombre (lista o QR)
 *   2. Pantalla de acciones → botones según estado actual de esa empleada
 *   3. Pantalla de confirmación → mensaje 3 segundos → vuelve al inicio
 */

// ── Importación de datos ─────────────────────────────────────
import { 
  obtenerEmpleados, obtenerCargo, estadoEmpleadoHoy, 
  registrarEntrada, registrarSalida, registrarSalidaPermiso, 
  registrarEntradaPermiso, horaActual, fechaHoy 
} from './datos.js';

// ── Estado ─────────────────────────────────────
let empleadoSeleccionado = null;   // { id, nombre, cargo }
let qrActivo             = false;
let html5QrCode          = null;
let timerConfirmacion    = null;

// ── Inicialización ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  iniciarReloj();
  cargarListaEmpleados();
});

function iniciarReloj() {
  const el = document.getElementById('reloj');
  const tick = () => el.textContent = new Date().toLocaleTimeString('es-HN', { hour12: false });
  tick();
  setInterval(tick, 1000);
}

function cargarListaEmpleados() {
  const lista = document.getElementById('lista-empleados-btns');
  if (!lista) return;
  lista.innerHTML = '';
  const empleados = obtenerEmpleados();

  if (empleados.length === 0) {
    lista.innerHTML = '<p style="color:var(--texto-sub);text-align:center;padding:1rem">No hay empleados registrados. Pide al administrador que los agregue.</p>';
    return;
  }

  empleados.forEach(emp => {
    const cargo = obtenerCargo(emp.cargo);
    const estado = estadoEmpleadoHoy(emp.id);
    const indicador = _indicadorEstado(estado);

    const btn = document.createElement('button');
    btn.className = 'empleado-btn';
    btn.innerHTML = `
      <span class="emp-indicador ${indicador.clase}">${indicador.icono}</span>
      <span class="emp-info">
        <span class="emp-nombre">${emp.nombre}</span>
        <span class="emp-cargo">${cargo.label}</span>
      </span>
      <span class="emp-flecha">›</span>
    `;
    btn.onclick = () => seleccionarEmpleado(emp);
    lista.appendChild(btn);
  });
}

function _indicadorEstado(estado) {
  switch (estado) {
    case 'en_jornada':     return { clase: 'ind-verde',    icono: '●' };
    case 'en_permiso':     return { clase: 'ind-naranja',  icono: '◐' };
    case 'jornada_cerrada':return { clase: 'ind-gris',     icono: '✓' };
    default:               return { clase: 'ind-vacio',    icono: '○' };
  }
}

// ── Pantalla 1 → 2: Selección de empleado ──────

function seleccionarEmpleado(emp) {
  empleadoSeleccionado = emp;
  detenerQR();

  const cargo  = obtenerCargo(emp.cargo);
  const estado = estadoEmpleadoHoy(emp.id);

  // Rellenar cabecera de la pantalla de acciones
  document.getElementById('acc-nombre').textContent  = emp.nombre;
  document.getElementById('acc-cargo').textContent   = cargo.label;
  document.getElementById('acc-sueldo').textContent  = cargo.descripcion;

  // Mostrar botones según estado actual
  _renderBotonesAccion(estado);

  mostrarPantalla('screen-acciones');
}

function _renderBotonesAccion(estado) {
  const zona = document.getElementById('zona-botones');
  zona.innerHTML = '';

  switch (estado) {
    case 'sin_entrada':
      zona.appendChild(_crearBoton('ENTRADA', 'btn-accion entrada', '▶', 'Inicio de jornada', accionEntrada));
      break;

    case 'en_jornada':
      zona.appendChild(_crearBoton('SALIDA', 'btn-accion salida', '■', 'Fin de jornada', accionSalida));
      zona.appendChild(_crearBoton('SALIDA PERMISO', 'btn-accion permiso-salida', '↗', 'Salgo un momento', accionSalidaPermiso));
      break;

    case 'en_permiso':
      zona.appendChild(_crearBoton('REGRESÉ', 'btn-accion permiso-entrada', '↩', 'Regreso de permiso', accionEntradaPermiso));
      break;

    case 'jornada_cerrada':
      zona.innerHTML = `
        <div class="jornada-cerrada-msg">
          <span style="font-size:3rem">✅</span>
          <p>Jornada completada hoy</p>
          <p style="font-size:.9rem;opacity:.6;margin-top:.3rem">Si hay un error, avisa al administrador</p>
        </div>`;
      break;
  }
}

function _crearBoton(label, clase, icono, sub, callback) {
  const btn = document.createElement('button');
  btn.className = clase;
  btn.innerHTML = `<span class="btn-icon">${icono}</span><span class="btn-label">${label}</span><span class="btn-sub">${sub}</span>`;
  btn.onclick = callback;
  return btn;
}

// ── Acciones ────────────────────────────────────

async function accionEntrada() {
  // 1. Obtener datos de validación
  const coords = await obtenerUbicacion();
  const foto = capturarFoto();

  // 2. Enviar a la base de datos (necesitarás ajustar registrarEntrada en datos.js para recibir estos 2 params)
  const res = registrarEntrada(empleadoSeleccionado.id, foto, coords);
  _manejarResultado(res, 'ENTRADA');
}
async function accionSalida() { // <--- Debe ser async
  // 1. Obtener datos de validación
  const coords = await obtenerUbicacion();
  const foto = capturarFoto();

  // 2. Enviar con los nuevos parámetros
  const res = registrarSalida(empleadoSeleccionado.id, foto, coords);
  _manejarResultado(res, 'SALIDA');
}
function accionSalidaPermiso() {
  const res = registrarSalidaPermiso(empleadoSeleccionado.id);
  _manejarResultado(res, 'SALIDA_PERMISO');
}
function accionEntradaPermiso() {
  const res = registrarEntradaPermiso(empleadoSeleccionado.id);
  _manejarResultado(res, 'ENTRADA_PERMISO');
}

function _manejarResultado(res, tipo) {
  if (!res.ok) { mostrarError(res.mensaje); return; }
  mostrarConfirmacion(res.nombre, res.cargo, tipo);
}

// ── Confirmación ────────────────────────────────

const CONFIGS_CONFIRMACION = {
  ENTRADA:        { icono: '✅', msg: '¡Bienvenid@!',         color: 'var(--verde)', sub: 'Entrada registrada' },
  SALIDA:         { icono: '👋', msg: '¡Hasta luego!',        color: 'var(--rojo)',  sub: 'Salida registrada' },
  SALIDA_PERMISO: { icono: '↗',  msg: 'Permiso registrado',   color: '#FF9800',      sub: 'Regresa pronto' },
  ENTRADA_PERMISO:{ icono: '↩',  msg: '¡Bienvenid@ de nuevo!',color: 'var(--acento)',sub: 'Regreso registrado' }
};

function mostrarConfirmacion(nombre, cargo, tipo) {
  const cfg = CONFIGS_CONFIRMACION[tipo] || CONFIGS_CONFIRMACION.ENTRADA;
  const cargoObj = obtenerCargo(cargo);

  document.getElementById('confirm-icon').textContent  = cfg.icono;
  document.getElementById('confirm-msg').textContent   = cfg.msg;
  document.getElementById('confirm-msg').style.color   = cfg.color;
  document.getElementById('confirm-nombre').textContent = nombre;
  document.getElementById('confirm-cargo-label').textContent = cargoObj.label;
  document.getElementById('confirm-hora').textContent  = `${cfg.sub} a las ${horaActual()}`;

  const bar = document.querySelector('.confirm-bar');
  bar.style.background = cfg.color === 'var(--verde)' ? 'linear-gradient(90deg, var(--verde), var(--acento))' :
                         cfg.color === 'var(--rojo)'  ? 'linear-gradient(90deg, var(--rojo), #FF9800)' :
                         `linear-gradient(90deg, ${cfg.color}, var(--acento))`;
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = 'shrinkBar 3s linear forwards';

  mostrarPantalla('screen-confirmacion');
  clearTimeout(timerConfirmacion);
  timerConfirmacion = setTimeout(() => {
    empleadoSeleccionado = null;
    cargarListaEmpleados(); // refrescar indicadores
    mostrarPantalla('screen-main');
  }, 3000);
}

// ── QR Scanner (pantalla de selección) ──────────

function toggleQR() {
  qrActivo ? detenerQR() : activarQR();
}

function activarQR() {
  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 200, height: 200 } },
    (texto) => {
      // El contenido del QR es el ID del empleado
      const emp = obtenerEmpleados().find(e => e.id === texto || e.nombre === texto);
      if (emp) {
        detenerQR();
        seleccionarEmpleado(emp);
      } else {
        mostrarError('QR no reconocido. Usa la lista o pide al admin un QR válido.');
      }
    },
    () => {}
  ).catch(() => mostrarError('No se pudo acceder a la cámara. Usa la lista.'));
  qrActivo = true;
  document.getElementById('qr-btn').textContent = '⏹ Detener Cámara';
}

function detenerQR() {
  if (html5QrCode && qrActivo) html5QrCode.stop().catch(() => {});
  html5QrCode = null;
  qrActivo    = false;
  const btn = document.getElementById('qr-btn');
  if (btn) btn.textContent = '📷 Escanear QR';
  const box = document.getElementById('qr-reader');
  if (box) box.innerHTML = '';
}

// ── Navegación ───────────────────────────────────

function mostrarPantalla(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function volverMain() {
  detenerQR();
  empleadoSeleccionado = null;
  mostrarPantalla('screen-main');
}

// --- Obtener Coordenadas
async function obtenerUbicacion() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("No soportado");
    
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude}, ${pos.coords.longitude}`), // <-- Faltaban las comillas invertidas
      () => resolve("Permiso denegado"),
      { timeout: 5000 }
    );
  });
}

// ── Funcion Capturar foto ──────────────────────────────────────
function capturarFoto() {
  const video = document.querySelector('#qr-reader video');
  if (!video) return null;

  const canvas = document.createElement('canvas');
  // REDUCIR TAMAÑO PARA AHORRAR ESPACIO
  canvas.width = 200; 
  canvas.height = 150; 
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Calidad 0.3 (30%) para que la foto pese muy poco
  return canvas.toDataURL('image/jpeg', 0.3); 
}

// ── Errores ──────────────────────────────────────

function mostrarError(mensaje) {
  document.getElementById('error-msg').textContent = mensaje;
  document.getElementById('overlay-error').classList.remove('hidden');
}
function cerrarError() {
  document.getElementById('overlay-error').classList.add('hidden');
}
