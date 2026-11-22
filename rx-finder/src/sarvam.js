// Sarvam AI client: document OCR (Parse) + chat (medicine structuring).
// Endpoints were verified live against api.sarvam.ai:
//   OCR:  POST /doc-ai/v1/job/parse        (multipart: file, language)  -> { job_id }
//         GET  /doc-ai/v1/job/{id}/status  -> { status: pending|completed|failed }
//         GET  /doc-ai/v1/job/{id}/results -> gzip-compressed JSON (documents[].pages[].blocks[])
//   LLM:  POST /v1/chat/completions         (model sarvam-105b, response_format json_object)
// Auth is the `api-subscription-key` header. In the cloud sandbox a proxy injects the real
// credential, so a dummy value works there; in production set SARVAM_API_KEY to your own key.

import { gunzipSync } from 'node:zlib';

const BASE = 'https://api.sarvam.ai';
const KEY = () => process.env.SARVAM_API_KEY || 'dummy';
const LANGUAGE = () => process.env.SARVAM_LANGUAGE || 'en-IN';
const CHAT_MODEL = () => process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';

function headers(extra = {}) {
  return { 'api-subscription-key': KEY(), ...extra };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run Sarvam document parsing on a file buffer.
 * Returns the full parsed JSON: { documents: [{ pages: [{ image_width, image_height, blocks:[...] }] }] }
 */
export async function parseDocument(buffer, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename || 'upload');
  form.append('language', LANGUAGE());

  const start = await fetch(`${BASE}/doc-ai/v1/job/parse`, {
    method: 'POST',
    headers: headers(),
    body: form,
  });
  if (!start.ok) {
    throw new Error(`Sarvam parse submit failed (${start.status}): ${await safeText(start)}`);
  }
  const { job_id: jobId } = await start.json();
  if (!jobId) throw new Error('Sarvam parse did not return a job_id');

  // Poll status (jobs complete in a few seconds; cap at ~90s).
  let status = 'pending';
  for (let i = 0; i < 45; i++) {
    const res = await fetch(`${BASE}/doc-ai/v1/job/${jobId}/status`, { headers: headers() });
    if (!res.ok) throw new Error(`Sarvam status failed (${res.status})`);
    const body = await res.json();
    status = body.status;
    if (status === 'completed') break;
    if (status === 'failed') throw new Error('Sarvam parse job failed');
    await sleep(i < 5 ? 1200 : 2500);
  }
  if (status !== 'completed') throw new Error('Sarvam parse job timed out');

  const resultRes = await fetch(`${BASE}/doc-ai/v1/job/${jobId}/results`, { headers: headers() });
  if (!resultRes.ok) throw new Error(`Sarvam results failed (${resultRes.status})`);
  const raw = Buffer.from(await resultRes.arrayBuffer());
  // The results body is gzip bytes (served as application/json, no Content-Encoding header).
  const text = raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return JSON.parse(text);
}

/**
 * Flatten Sarvam parse output into ordered blocks with pixel coordinates,
 * plus the source image dimensions. One page (prescriptions are typically single-page;
 * multi-page is concatenated with page offsets left per-page for cropping on page 1).
 */
export function blocksFromParse(parsed) {
  const doc = parsed?.documents?.[0];
  const pages = doc?.pages || [];
  const out = [];
  let width = 0, height = 0;
  for (const pg of pages) {
    if (!width) { width = pg.image_width; height = pg.image_height; }
    for (const b of pg.blocks || []) {
      out.push({
        id: b.block_id,
        page: pg.page_num,
        tag: b.layout_tag,
        order: b.reading_order,
        text: b.text || '',
        coordinates: b.coordinates || null, // {x1,y1,x2,y2} in page pixels
      });
    }
  }
  return { blocks: out, width, height, pageCount: pages.length };
}

/**
 * Call Sarvam's chat model and parse a strict-JSON response.
 * Uses response_format json_object, which returns clean JSON quickly (no long reasoning pass).
 */
export async function chatJSON(system, user, { maxTokens = 4000 } = {}) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: CHAT_MODEL(),
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Sarvam chat failed (${res.status}): ${await safeText(res)}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Sarvam chat returned empty content');
  return JSON.parse(content);
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 300); } catch { return '<no body>'; }
}
