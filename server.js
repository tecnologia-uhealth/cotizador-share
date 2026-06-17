const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const QUOTES_DIR = path.join(__dirname, 'quotes');
const DAYS_TO_EXPIRE = 7;

// Crear directorio si no existe
if (!fs.existsSync(QUOTES_DIR)) {
  fs.mkdirSync(QUOTES_DIR, { recursive: true });
}

// ─── Limpieza automática cada 6 horas ───────────────────────────────────────
function limpiarCotizacionesViejas() {
  try {
    const ahora = Date.now();
    const limite = DAYS_TO_EXPIRE * 24 * 60 * 60 * 1000;
    const archivos = fs.readdirSync(QUOTES_DIR);
    let eliminados = 0;

    archivos.forEach(archivo => {
      const ruta = path.join(QUOTES_DIR, archivo);
      const stat = fs.statSync(ruta);
      if (ahora - stat.mtimeMs > limite) {
        fs.unlinkSync(ruta);
        eliminados++;
      }
    });

    if (eliminados > 0) {
      console.log(`[cleanup] ${eliminados} cotización(es) eliminada(s)`);
    }
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
  }
}

limpiarCotizacionesViejas();
setInterval(limpiarCotizacionesViejas, 6 * 60 * 60 * 1000);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const origen = req.headers.origin;
  const permitidos = [
    'https://cotizador.saludu.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  if (!origen || permitidos.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(texto) {
  return (texto || 'sin-nombre')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase()
    .slice(0, 40);
}

function formatearFecha() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}`;
}

// ─── POST /q/save ─────────────────────────────────────────────────────────────
app.post('/q/save', (req, res) => {
  try {
    const { html, empresa } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Se requiere el campo "html"' });
    }
    if (html.length < 500) {
      return res.status(400).json({ error: 'HTML demasiado corto' });
    }

    const slug = slugify(empresa);
    const fecha = formatearFecha();
    const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
    const nombreArchivo = `${slug}-${fecha}-${hash}.html`;
    const rutaArchivo = path.join(QUOTES_DIR, nombreArchivo);

    fs.writeFileSync(rutaArchivo, html, 'utf8');

    const baseUrl = process.env.BASE_URL || 'https://ver.saludu.com';
    const url = `${baseUrl}/q/${nombreArchivo}`;

    console.log(`[save] ${nombreArchivo} (${(html.length / 1024).toFixed(1)} KB)`);

    return res.json({ ok: true, url, archivo: nombreArchivo, expira: `${DAYS_TO_EXPIRE} días` });
  } catch (err) {
    console.error('[save] Error:', err.message);
    return res.status(500).json({ error: 'Error al guardar cotización' });
  }
});

// ─── GET /q/health ── DEBE IR ANTES DE /:archivo ─────────────────────────────
app.get('/q/health', (req, res) => {
  const archivos = fs.readdirSync(QUOTES_DIR).length;
  res.json({ ok: true, cotizaciones: archivos, version: '1.0.2' });
});

// ─── GET /q/:archivo ─────────────────────────────────────────────────────────
app.get('/q/:archivo', (req, res) => {
  try {
    const { archivo } = req.params;

    if (!archivo.endsWith('.html') || archivo.includes('..') || archivo.includes('/')) {
      return res.status(400).send('Archivo inválido');
    }

    const ruta = path.join(QUOTES_DIR, archivo);

    if (!fs.existsSync(ruta)) {
      return res.status(404).send(pagina404());
    }

    const stat = fs.statSync(ruta);
    const diasTranscurridos = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);

    if (diasTranscurridos > DAYS_TO_EXPIRE) {
      fs.unlinkSync(ruta);
      return res.status(410).send(paginaExpirada());
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    // FIX: root requerido para rutas absolutas en Express
    res.sendFile(ruta, { root: '/' });
  } catch (err) {
    console.error('[get] Error:', err.message);
    return res.status(500).send('Error interno');
  }
});

// ─── Páginas de error ─────────────────────────────────────────────────────────
function pagina404() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotización no encontrada</title>
<style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#f5f5f7;color:#1d1d3b}.box{text-align:center;padding:40px;max-width:400px}
.ico{font-size:56px;margin-bottom:16px}h1{font-size:24px;font-weight:800;margin:0 0 8px}
p{color:#666;font-size:15px;line-height:1.5;margin:0 0 24px}
a{display:inline-block;background:#D70984;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}</style>
</head><body><div class="box"><div class="ico">📄</div><h1>Cotización no encontrada</h1>
<p>El enlace que buscas no existe o fue eliminado.</p>
<a href="https://cotizador.saludu.com">Generar nueva cotización</a></div></body></html>`;
}

function paginaExpirada() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotización expirada</title>
<style>body{font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#f5f5f7;color:#1d1d3b}.box{text-align:center;padding:40px;max-width:400px}
.ico{font-size:56px;margin-bottom:16px}h1{font-size:24px;font-weight:800;margin:0 0 8px}
p{color:#666;font-size:15px;line-height:1.5;margin:0 0 24px}
a{display:inline-block;background:#D70984;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}</style>
</head><body><div class="box"><div class="ico">⏰</div><h1>Cotización expirada</h1>
<p>Este enlace estuvo disponible 7 días y ya fue eliminado.<br>Solicita una nueva cotización.</p>
<a href="https://cotizador.saludu.com">Generar nueva cotización</a></div></body></html>`;
}

app.listen(PORT, () => {
  console.log(`✅ cotizador-share v1.0.2 en puerto ${PORT}`);
  console.log(`📁 Cotizaciones: ${QUOTES_DIR}`);
});
