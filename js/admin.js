/**
 * admin.js — Panel Administrador v2.0
 * =====================================
 * Incluye: autenticación, tabla con edición inline,
 * gestión de empleados con cargo, generación de pagos,
 * exportación CSV/XLSX y cierre automático de jornadas.
 */

// ── IMportar datos ──────────────────────────────────────
import { 
  CONFIG, obtenerEmpleados, obtenerRegistros, obtenerCargo, 
  listarCargos, agregarEmpleadoDB, eliminarEmpleadoDB, 
  editarEmpleadoDB, ejecutarCierreAutomatico, editarRegistroAdmin, 
  calcularPagoEmpleado, calcularResumen, fechaHoy, formatearFecha 
} from './datos.js';

// ── Login ──────────────────────────────────────

function verificarPassword() {
  if (document.getElementById('input-pass').value === CONFIG.PASSWORD_ADMIN) {
    document.getElementById('login-error').classList.add('hidden');
    mostrarPanelAdmin();
  } else {
    document.getElementById('login-error').classList.remove('hidden');
    document.getElementById('input-pass').value = '';
    document.getElementById('input-pass').focus();
  }
}

function cerrarSesion() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('input-pass').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') verificarPassword();
  });
  document.getElementById('nuevo-nombre')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') agregarEmpleado();
  });
});

// ── Panel principal ────────────────────────────

function mostrarPanelAdmin() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  ejecutarCierreAutomatico();
  cargarFiltroEmpleados();
  renderListaEmpleados();
  renderTabla();
  renderPagos();
  // Cierre automático cada 5 min
  setInterval(ejecutarCierreAutomatico, 5 * 60 * 1000);
}

// ── Filtros ────────────────────────────────────

function cargarFiltroEmpleados() {
  ['filtro-empleado', 'pago-empleado'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    obtenerEmpleados().forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.nombre;
      sel.appendChild(opt);
    });
  });
}

function limpiarFiltros() {
  ['filtro-empleado','filtro-desde','filtro-hasta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderTabla();
}

function obtenerRegistrosFiltrados() {
  let r = obtenerRegistros();
  const emp   = document.getElementById('filtro-empleado')?.value;
  const desde = document.getElementById('filtro-desde')?.value;
  const hasta = document.getElementById('filtro-hasta')?.value;
  if (emp)   r = r.filter(x => x.empleadoId === emp);
  if (desde) r = r.filter(x => x.fecha >= desde);
  if (hasta) r = r.filter(x => x.fecha <= hasta);
  return r.sort((a,b) => b.fecha.localeCompare(a.fecha) || (b.entrada||'').localeCompare(a.entrada||''));
}

// ── Tabla de registros ─────────────────────────

function renderTabla() {
  const registros = obtenerRegistrosFiltrados();
  const tbody = document.getElementById('tabla-body');
  const vacia = document.getElementById('tabla-vacia');
  const tabla = document.getElementById('tabla-registros');

  renderResumen(registros);

  if (registros.length === 0) {
    tbody.innerHTML = ''; tabla.style.display = 'none';
    vacia.classList.remove('hidden'); return;
  }
  tabla.style.display = ''; vacia.classList.add('hidden');

  tbody.innerHTML = registros.map(r => {
    const tieneExtra = r.horas_extra && r.horas_extra !== '0m';
    const cargoBadge = r.cargo ? `<span class="badge-cargo badge-${r.cargo}">${obtenerCargo(r.cargo).label}</span>` : '—';
    const tags = (r.salida_auto ? '<span class="tag-auto">⚡auto</span>' : '') +
                 (r.editado     ? '<span class="tag-editado">✏ editado</span>' : '');
    const permTag = r.minutos_permiso > 0
      ? `<span style="color:var(--naranja);font-size:.75rem"> -${formatearHoras(r.minutos_permiso)} permiso</span>` : '';

    return `<tr>
      <td><strong>${r.nombre}</strong> ${cargoBadge}</td>
      <td>${formatearFecha(r.fecha)}</td>
      <td>${r.entrada || '—'} ${tags}</td>
      <td>${r.salida  || '<span style="color:var(--texto-sub)">Pendiente</span>'}</td>
      <td class="horas-normal">${r.horas_normales || '—'}${permTag}</td>
      <td class="${tieneExtra ? 'horas-extra' : ''}">${r.horas_extra || '—'}</td>
      <td>${r.total_horas ? Number(r.total_horas).toFixed(2)+'h' : '—'}</td>
      <td>${r.pago_base  != null ? '$'+r.pago_base.toFixed(2)  : '—'}</td>
      <td>${r.pago_extra != null ? '$'+r.pago_extra.toFixed(2) : '—'}</td>
      <td class="pago-total">${r.pago_total != null ? '$'+r.pago_total.toFixed(2) : '—'}</td>
      <td><button class="btn-editar" onclick="abrirModalEdicion('${r.id}')">✏ Editar</button></td>
    </tr>`;
  }).join('');
}

function renderResumen(registros) {
  const res = calcularResumen(registros);
  document.getElementById('resumen-grid').innerHTML = `
    <div class="resumen-card"><span class="rc-val">${res.total_registros}</span><span class="rc-lbl">Total registros</span></div>
    <div class="resumen-card"><span class="rc-val" style="color:var(--verde)">${res.presentes_hoy}</span><span class="rc-lbl">Presentes hoy</span></div>
    <div class="resumen-card"><span class="rc-val" style="color:var(--naranja)">${res.en_permiso_hoy}</span><span class="rc-lbl">En permiso hoy</span></div>
    <div class="resumen-card"><span class="rc-val">${res.con_salida}</span><span class="rc-lbl">Con salida completa</span></div>
    <div class="resumen-card"><span class="rc-val" style="color:#FF9800">${res.con_extra}</span><span class="rc-lbl">Con horas extra</span></div>`;
}

// ── Modal de edición de registro ───────────────

let _idRegistroEditando = null;

function abrirModalEdicion(registroId) {
  const r = obtenerRegistros().find(x => x.id === registroId);
  if (!r) return;
  _idRegistroEditando = registroId;

  document.getElementById('edit-empleado-nombre').textContent = r.nombre;
  document.getElementById('edit-fecha').textContent           = formatearFecha(r.fecha);
  document.getElementById('edit-entrada').value               = (r.entrada || '').slice(0,5);
  document.getElementById('edit-salida').value                = (r.salida  || '').slice(0,5);
  document.getElementById('edit-nota').value                  = r.nota || '';

  document.getElementById('modal-edicion').classList.remove('hidden');
}

function cerrarModalEdicion() {
  document.getElementById('modal-edicion').classList.add('hidden');
  _idRegistroEditando = null;
}

function guardarEdicion() {
  if (!_idRegistroEditando) return;
  const entrada = document.getElementById('edit-entrada').value;
  const salida  = document.getElementById('edit-salida').value;
  const nota    = document.getElementById('edit-nota').value.trim();

  if (entrada && salida && salida <= entrada) {
    alert('La hora de salida debe ser posterior a la entrada.');
    return;
  }

  const res = editarRegistroAdmin(_idRegistroEditando, {
    entrada: entrada ? entrada + ':00' : null,
    salida:  salida  ? salida  + ':00' : null,
    nota
  });

  if (!res.ok) { alert(res.mensaje); return; }
  cerrarModalEdicion();
  renderTabla();
  renderPagos();
}

// ── Gestión de empleados ───────────────────────

async function renderListaEmpleados() {
  const ul = document.getElementById('lista-empleados');
  const empleados = obtenerEmpleados();
  ul.innerHTML = empleados.length === 0
    ? '<li style="color:var(--texto-sub);padding:.5rem">No hay empleados aún.</li>'
    : empleados.map(e => {
        const cargo = obtenerCargo(e.cargo);
        return `<li>
          <span class="li-nombre">${e.nombre}</span>
          <span class="li-cargo badge-cargo badge-${e.cargo}">${cargo.label}</span>
          <div class="li-actions">
            <button class="btn-li-edit" onclick="editarEmpleadoUI('${e.id}','${e.nombre.replace(/'/g,"\\'")}','${e.cargo}')">✏</button>
            <button class="btn-li-del"  onclick="eliminarEmpleadoAdmin('${e.id}','${e.nombre.replace(/'/g,"\\'")}')">✕</button>
          </div>
        </li>`;
      }).join('');
  cargarFiltroEmpleados();
}

async function agregarEmpleado() {
  const nombre = document.getElementById('nuevo-nombre').value.trim();
  const cargo  = document.getElementById('nuevo-cargo').value;
  
  if (!nombre) { alert('Escribe el nombre del empleado.'); return; }
  if (!cargo)  { alert('Selecciona un cargo.'); return; }

  // AGREGAMOS 'await' aquí para esperar a Firebase
  const res = await agregarEmpleadoDB(nombre, cargo); 

  if (!res.ok) { 
    alert(res.mensaje); 
    return; 
  }

  document.getElementById('nuevo-nombre').value = '';
  document.getElementById('nuevo-cargo').value  = '';
  
  // Refrescamos la lista (también debe ser async o esperar internamente)
  await renderListaEmpleados(); 
  alert('¡Empleado agregado con éxito!');
}

function editarEmpleadoUI(id, nombre, cargo) {
  const nuevoNombre = prompt('Nuevo nombre:', nombre);
  if (nuevoNombre === null) return;
  const cargos = listarCargos();
  const opciones = cargos.map((c,i) => `${i+1}. ${c.label} (${c.descripcion})`).join('\n');
  const idx = prompt(`Nuevo cargo (escribe el número):\n${opciones}`, cargos.findIndex(c=>c.key===cargo)+1);
  if (idx === null) return;
  const nuevoCargo = cargos[parseInt(idx)-1]?.key;
  if (!nuevoCargo) { alert('Número de cargo no válido.'); return; }
  editarEmpleadoDB(id, nuevoNombre.trim(), nuevoCargo);
  renderListaEmpleados();
  renderTabla();
}

function eliminarEmpleadoAdmin(id, nombre) {
  if (!confirm(`¿Eliminar a "${nombre}" de la lista?\n(Sus registros históricos no se borrarán.)`)) return;
  eliminarEmpleadoDB(id);
  renderListaEmpleados();
  renderTabla();
}

// ── Generación de pagos ────────────────────────

function renderPagos() {
  const desde = document.getElementById('pago-desde')?.value;
  const hasta = document.getElementById('pago-hasta')?.value;
  const empId = document.getElementById('pago-empleado')?.value;

  let registros = obtenerRegistros().filter(r => r.salida);
  if (desde) registros = registros.filter(r => r.fecha >= desde);
  if (hasta) registros = registros.filter(r => r.fecha <= hasta);

  const empleados = obtenerEmpleados().filter(e => !empId || e.id === empId);
  const resumen   = empleados.map(e => calcularPagoEmpleado(e.id, registros)).filter(Boolean);

  const tbody = document.getElementById('tabla-pagos-body');
  if (!tbody) return;

  if (resumen.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--texto-sub)">Sin registros para el período seleccionado.</td></tr>`;
    return;
  }

  const grandTotal = resumen.reduce((s, r) => s + r.pagoTotal, 0);

  tbody.innerHTML = resumen.map(r => `
    <tr>
      <td><strong>${r.nombre}</strong></td>
      <td><span class="badge-cargo badge-${r.cargo.toLowerCase()}">${r.cargo}</span></td>
      <td style="text-align:center">${r.diasTrabajados}</td>
      <td style="text-align:center">${r.horasTotales.toFixed(2)}</td>
      <td style="text-align:center;color:#FF9800">${r.horasExtra.toFixed(2)}</td>
      <td style="text-align:right">$${r.pagoBase.toFixed(2)}</td>
      <td style="text-align:right;color:#FF9800">$${r.pagoExtra.toFixed(2)}</td>
      <td style="text-align:right" class="pago-total">$${r.pagoTotal.toFixed(2)}</td>
    </tr>`).join('') +
    `<tr class="pago-grand-total">
      <td colspan="5">TOTAL A PAGAR</td>
      <td></td><td></td>
      <td style="text-align:right">$${grandTotal.toFixed(2)}</td>
    </tr>`;
}

function exportarPagosCSV() {
  const desde = document.getElementById('pago-desde')?.value;
  const hasta = document.getElementById('pago-hasta')?.value;
  let registros = obtenerRegistros().filter(r => r.salida);
  if (desde) registros = registros.filter(r => r.fecha >= desde);
  if (hasta) registros = registros.filter(r => r.fecha <= hasta);

  const empleados = obtenerEmpleados();
  const resumen   = empleados.map(e => calcularPagoEmpleado(e.id, registros)).filter(Boolean);

  if (resumen.length === 0) { alert('Sin datos para exportar.'); return; }

  const enc = ['Empleado','Cargo','Días','Horas Totales','Horas Extra','Pago Base','Pago Extra','Total'];
  const filas = resumen.map(r => [r.nombre,r.cargo,r.diasTrabajados,r.horasTotales,r.horasExtra,`$${r.pagoBase}`,`$${r.pagoExtra}`,`$${r.pagoTotal}`]);

  const csv = [enc,...filas]
    .map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  _descargar(blob, `pagos_${fechaHoy()}.csv`);
}

// ── Exportación de registros ───────────────────

function exportarCSV() {
  const registros = obtenerRegistrosFiltrados();
  if (registros.length === 0) { alert('No hay registros para exportar.'); return; }

  const enc = ['Empleado','Cargo','Fecha','Entrada','Salida','H.Normales','H.Extra','Total Horas','Pago Base','Pago Extra','Total Pago','Nota'];
  const filas = registros.map(r => [
    r.nombre, obtenerCargo(r.cargo).label, formatearFecha(r.fecha),
    r.entrada||'', r.salida||'', r.horas_normales||'', r.horas_extra||'',
    r.total_horas ? Number(r.total_horas).toFixed(2) : '',
    r.pago_base  != null ? r.pago_base.toFixed(2)  : '',
    r.pago_extra != null ? r.pago_extra.toFixed(2) : '',
    r.pago_total != null ? r.pago_total.toFixed(2) : '',
    r.nota||''
  ]);

  const csv = [enc,...filas]
    .map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  _descargar(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}), `asistencia_${fechaHoy()}.csv`);
}

function exportarXLSX() {
  alert('Para exportar Excel instala la librería SheetJS.\nPor ahora usa "Exportar CSV" — abre directamente en Excel.');
  exportarCSV();
}

function _descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// --- EXPOSICIÓN GLOBAL PARA HTML ---
// Esto permite que los atributos 'onclick' del HTML encuentren las funciones
window.verificarPassword = verificarPassword;
window.cerrarSesion = cerrarSesion;
window.exportarCSV = exportarCSV;
window.exportarXLSX = exportarXLSX;
window.limpiarFiltros = limpiarFiltros;
window.renderTabla = renderTabla;
window.renderPagos = renderPagos;
window.abrirModalEdicion = abrirModalEdicion;
window.cerrarModalEdicion = cerrarModalEdicion;
window.guardarEdicion = guardarEdicion;
window.agregarEmpleado = agregarEmpleado;
window.editarEmpleadoUI = editarEmpleadoUI;
window.eliminarEmpleadoAdmin = eliminarEmpleadoAdmin;
window.exportarPagosCSV = exportarPagosCSV;
