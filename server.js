// server.js v1.0.1 — cotizador-share · Ü Health
// Orden de rutas: health → save → archivos estáticos → 404
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const QUOTES_DIR = process.env.QUOTES_DIR || '/app/quotes';

// Asegura que el directorio de cotizaciones existe
if (!fs.existsSync(QUOTES_DIR)) {
  fs.mkdirSync(QUOTES_DIR, { recursive: true });
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ limit: '5mb' }));

// ─── 1. HEALTH CHECK ────────────────────────────────────────────────────────
app.get('/q/health', (req, res) => {
  let count = 0;
  try {
    count = fs.readdirSync(QUOTES_DIR).filter(f => f.endsWith('.html')).length;
  } catch (_) {}
  res.json({ ok: true, cotizaciones: count, version: '1.0.1' });
});

// ─── 2. GUARDAR COTIZACIÓN ───────────────────────────────────────────────────
app.post('/q/save', (req, res) => {
  try {
    // Acepta body como texto HTML o JSON { html: '...' }
    let html = '';
    if (typeof req.body === 'string') {
      html = req.body;
    } else if (req.body && typeof req.body.html === 'string') {
      html = req.body.html;
    } else {
      return res.status(400).json({ ok: false, error: 'Body inválido. Envía HTML como texto o { html: "..." }' });
    }

    if (html.length < 100) {
      return res.status(400).json({ ok: false, error: 'HTML demasiado corto' });
    }

    const id = crypto.randomBytes(6).toString('hex');
    const filename = `${id}.html`;
    const filepath = path.join(QUOTES_DIR, filename);

    fs.writeFileSync(filepath, html, 'utf8');

    const url = `${req.protocol}://${req.get('host')}/q/${filename}`;
    res.json({ ok: true, url, filename });
  } catch (err) {
    console.error('Error guardando cotización:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ─── 3. SERVIR ARCHIVOS GUARDADOS ───────────────────────────────────────────
app.get('/q/:archivo', (req, res) => {
  const archivo = req.params.archivo;

  // Solo permite archivos .html con nombre hexadecimal (seguridad)
  if (!/^[a-f0-9]{12}\.html$/.test(archivo)) {
    return res.status(400).send(pagina404('Nombre de archivo inválido'));
  }

  const filepath = path.join(QUOTES_DIR, archivo);

  if (!fs.existsSync(filepath)) {
    return res.status(404).send(pagina404('Cotización no encontrada'));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(filepath);
});

// ─── 4. RAÍZ ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ servicio: 'cotizador-share · Ü Health', version: '1.0.1', status: 'ok' });
});

// ─── 5. CATCH-ALL 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(pagina404('Ruta no encontrada'));
});

// ─── INICIO ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[cotizador-share v1.0.1] Escuchando en puerto ${PORT}`);
  console.log(`[cotizador-share] Directorio de cotizaciones: ${QUOTES_DIR}`);
});

// ─── HELPER: página 404 amigable ────────────────────────────────────────────
function pagina404(mensaje) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>No encontrado — Ü Health</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: #f5eefa; color: #2d1b4e; }
    .card { text-align: center; padding: 2rem; background: white;
            border-radius: 1rem; box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 400px; }
    h1 { font-size: 3rem; margin: 0; }
    p  { color: #666; margin-top: .5rem; }
    a  { color: #d81b7c; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔍</h1>
    <h2>404 — ${mensaje}</h2>
    <p>El enlace puede haber expirado o ser incorrecto.</p>
    <p><a href="https://cotizador.saludu.com">Ir al cotizador</a></p>
  </div>
</body>
</html>`;
}
