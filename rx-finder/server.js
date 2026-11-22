// RxReach backend — prescription OCR + medicine understanding.
// Privacy: the uploaded prescription is held in memory only, for a short TTL, and is sent
// solely to Sarvam (the OCR provider). It is never written to disk and its contents are never
// logged. Only the user's own edits/marks (in the browser) persist.

import express from 'express';
import multer from 'multer';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseDocument, blocksFromParse } from './src/sarvam.js';
import { extractMedicines } from './src/extract.js';
import { checkAvailability } from './src/availability.js';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// --- In-memory, expiring store for the just-uploaded image (for the review crop) ---
const IMAGE_TTL_MS = 30 * 60 * 1000;
const images = new Map(); // id -> { buffer, mime, expires }
function putImage(buffer, mime) {
  const id = randomUUID();
  images.set(id, { buffer, mime, expires: Date.now() + IMAGE_TTL_MS });
  return id;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, v] of images) if (v.expires < now) images.delete(id);
}, 60 * 1000).unref();

const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'application/pdf'];

app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { mimetype, buffer, originalname } = req.file;
    if (!ACCEPTED.includes(mimetype)) {
      return res.status(415).json({ error: `Unsupported file type: ${mimetype}. Upload a photo (PNG/JPG) or PDF.` });
    }

    const parsed = await parseDocument(buffer, originalname, mimetype);
    const flat = blocksFromParse(parsed);
    const { medicines, source } = await extractMedicines(flat);

    // Keep the image only for PDFs? No — we keep images so the review step can show crops.
    // For PDFs we still store the bytes; the browser renders page 1 via <embed> fallback.
    const imageId = putImage(buffer, mimetype);

    res.json({
      imageId,
      image: { width: flat.width, height: flat.height, mime: mimetype, pageCount: flat.pageCount },
      medicines,
      meta: {
        source, // 'sarvam-llm' or 'fallback'
        blockCount: flat.blocks.length,
      },
    });
  } catch (err) {
    // Log only the error message, never the prescription content.
    console.error('[extract] failed:', err.message);
    res.status(502).json({ error: 'Could not read the prescription. Please try a clearer photo or a PDF.' });
  }
});

// Default to central Hyderabad; override with precise coordinates for your locality.
const HYD = { lat: 17.4486, lon: 78.3908 };

app.post('/api/availability', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const { medicines, lat, lon } = req.body || {};
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'No medicines to check.' });
    }
    const meds = medicines
      .filter((m) => m && m.name)
      .map((m) => ({ id: String(m.id), name: String(m.name), strength: m.strength || null, form: m.form || null }));
    const results = await checkAvailability(meds, {
      lat: Number.isFinite(lat) ? lat : HYD.lat,
      lon: Number.isFinite(lon) ? lon : HYD.lon,
    });
    res.json({ results });
  } catch (err) {
    console.error('[availability] failed:', err.message);
    res.status(502).json({ error: 'Automated check failed. You can still mark availability yourself.' });
  }
});

app.get('/api/image/:id', (req, res) => {
  const item = images.get(req.params.id);
  if (!item || item.expires < Date.now()) return res.status(404).end();
  res.setHeader('Content-Type', item.mime);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.send(item.buffer);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.SARVAM_API_KEY) });
});

app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RxReach running at http://localhost:${PORT}`);
  if (!process.env.SARVAM_API_KEY) {
    console.log('Note: SARVAM_API_KEY is not set. In the Claude sandbox a proxy injects it; elsewhere, set it in .env');
  }
});

// Minimal .env loader (avoids an extra dependency).
function loadEnv() {
  const p = join(dirname(fileURLToPath(import.meta.url)), '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
