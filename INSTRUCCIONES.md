# 📋 GUÍA DE INSTALACIÓN Y USO
## Control de Asistencia — Sin necesidad de servidores

---

## ¿Qué incluye esta aplicación?

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Pantalla de empleados (ENTRADA / SALIDA) |
| `admin.html` | Panel del administrador (tabla, exportar) |
| `qr-empleados.html` | Generador de códigos QR para imprimir |
| `css/style.css` | Estilos visuales |
| `js/datos.js` | Motor de datos (compartido) |
| `js/app.js` | Lógica de empleados |
| `js/admin.js` | Lógica del administrador |

---

## 🚀 OPCIÓN A — Uso Local (el más fácil, sin internet)

### Paso 1: Abrir la aplicación
1. Descomprime la carpeta `asistencia/` donde quieras
2. Haz **doble clic** en `index.html`
3. Se abrirá en tu navegador (Chrome o Edge recomendado)

> ⚠️ **Importante:** El escáner de QR requiere HTTPS o `localhost`.  
> Para uso solo con la lista desplegable, el doble clic funciona perfectamente.

### ¿Dónde se guardan los datos?
Los registros se guardan automáticamente en el **navegador del dispositivo** (localStorage).  
No se necesita internet ni servidor. Los datos persisten aunque cierres el navegador.

> ⚠️ Si limpias los datos del navegador o usas modo incógnito, los datos se borrarán.  
> Para mayor seguridad, exporta a CSV/Excel regularmente desde el panel admin.

---

## 🌐 OPCIÓN B — Publicar gratis en la web (acceso desde cualquier dispositivo)

Así todos los empleados pueden registrar su asistencia desde su teléfono.

### Con GitHub Pages (gratis, 5 minutos):

1. Crea una cuenta gratis en [github.com](https://github.com)
2. Crea un repositorio nuevo (botón verde "New")
3. Sube todos los archivos de la carpeta `asistencia/`
4. Ve a **Settings → Pages → Branch: main → Save**
5. Tu app estará en: `https://TU_USUARIO.github.io/NOMBRE_REPO/`

### Con Netlify (también gratis, aún más fácil):

1. Ve a [netlify.com](https://netlify.com) y crea una cuenta
2. Arrastra la carpeta `asistencia/` al área de deploy
3. ¡Listo! Te dará una URL como `https://nombre-aleatorio.netlify.app`

> 💡 Con la opción web, el escáner QR también funcionará correctamente.

---

## ⚙️ CONFIGURACIÓN INICIAL

### 1. Cambiar la contraseña del administrador

Abre `js/datos.js` con el Bloc de notas y busca:

```javascript
PASSWORD_ADMIN: 'Diaz1990',
```

### 2. Cambiar el límite de jornada normal

En el mismo archivo `js/datos.js`:

```javascript
HORAS_JORNADA_NORMAL: 8,   // ← Cambia 8 por las horas que necesites
```

### 3. Agregar empleados

**Opción A:** Abre `admin.html`, inicia sesión y usa la sección "Gestión de Empleados".

**Opción B:** Edita `js/datos.js`, busca:
```javascript
const defaults = ['María García', 'Juan Pérez', ...];
```
Y reemplaza con los nombres reales de tu equipo.

---

## 🖨️ IMPRIMIR CÓDIGOS QR

1. Abre `qr-empleados.html` en el navegador
2. Los QR se generan automáticamente para cada empleado
3. Haz clic en **"Imprimir Tarjetas"**
4. Recorta y entrega cada tarjeta a su empleado
5. En el quiosco de asistencia, el empleado escanea su QR con la cámara

---

## 📊 EXPORTAR DATOS

1. Abre `admin.html`
2. Ingresa la contraseña (por defecto: `admin1234`)
3. Filtra por empleado o fecha si lo necesitas
4. Haz clic en **"Exportar CSV"** (abre en Excel, Sheets, LibreOffice)

> Para exportar a XLSX real, la aplicación necesita conexión a internet.  
> El CSV se puede abrir directamente en Excel y tiene todos los datos.

---

## 📱 CÓMO USARLO DÍA A DÍA

### El empleado:
1. Se acerca al tablet/computador con la app abierta en `index.html`
2. Pulsa el botón **VERDE (ENTRADA)** al llegar
3. Selecciona su nombre en la lista **O** escanea su QR
4. Ve el mensaje de confirmación en pantalla
5. Repite con el botón **ROJO (SALIDA)** al salir

### El administrador:
1. Abre `admin.html`
2. Ingresa la contraseña
3. Ve el resumen del día y la tabla completa
4. Filtra y exporta cuando lo necesite

---

## ❓ PREGUNTAS FRECUENTES

**¿Se pueden usar dos dispositivos a la vez?**  
Si usas la versión local (doble clic), los datos son del dispositivo. Si publicas en la web con GitHub Pages / Netlify, los datos siguen siendo locales por navegador. Para sincronización entre dispositivos, se necesitaría un backend (Firebase, Google Sheets API) — escríbenos si lo necesitas.

**¿El empleado puede registrarse dos veces en el día?**  
Sí, se registra cada entrada/salida por separado. El sistema alerta si intenta hacer una segunda ENTRADA sin haber marcado SALIDA.

**¿Qué pasa si el navegador se cierra?**  
Los datos persisten en localStorage. Se recuperan automáticamente al reabrir.

**¿Es compatible con móviles?**  
Sí, el diseño es responsive. Funciona en tablets y teléfonos.

---

## 🛠️ SOPORTE TÉCNICO

Si algo no funciona, verifica:
- Que uses Chrome, Edge o Firefox (no Internet Explorer)
- Que no estés en modo incógnito (los datos no persisten)
- Que el archivo `js/datos.js` esté en la misma carpeta que `index.html`

---

*Versión 1.0 — Control de Asistencia sin servidor*
