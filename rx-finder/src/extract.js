// Turn OCR blocks into a classified list of PRESCRIBED medicines.
// Primary path: Sarvam's LLM classifies/structures the text (handles handwriting, brand-only
// entries, Indian brand names). Fallback: a deterministic clue-based scan if the LLM is
// unavailable. Neither path ever invents a name, strength, or form.

import { chatJSON } from './sarvam.js';

const SYSTEM = `You read OCR output from a doctor's prescription and return ONLY the prescribed medicines.

Return STRICT JSON only:
{"medicines":[{"name":string,"strength":string|null,"form":string|null,"raw":string,"confidence":"high"|"medium"|"low","uncertain":boolean}]}

INCLUDE: drugs/brands the doctor prescribed (tablets, capsules, syrups, injections, drops, ointments, inhalers, sachets, etc.), including handwritten entries and brand names written without a strength.

EXCLUDE (never output these): patient name/age/sex, doctor/clinic name/address/phone/registration, dates, diagnosis, vitals/measurements, dosage directions and schedules (e.g. "1-0-1", "after food", "before breakfast", "x 5 days", "SOS", "tsp", "twice daily"), general advice, and any descriptive prose about symbols or images (e.g. text describing the "Rx" symbol).

FIELD RULES — extract only what is actually written; otherwise use null. NEVER guess or infer:
- name: the drug/brand as written, WITHOUT the form prefix ("Tab.", "Cap.", "Syp.", "Inj.") and WITHOUT directions. Keep it otherwise verbatim (keep words like "Duo", "DS", "XR", "-OS").
- strength: the medicinal strength if present, e.g. "625", "40 mg", "650", "5 mg". Do NOT treat pack size like "100 ml" or "10 tabs" as strength. null if not written.
- form: set ONLY from an explicit written cue — Tab./Tablet->"Tablet", Cap./Capsule->"Capsule", Syp./Syr./Syrup->"Syrup", Inj.->"Injection", drops->"Drops", oint./cream/gel->"Ointment", inhaler->"Inhaler", sachet->"Sachet", respule->"Respule". If there is no such cue, use null — do not infer the form from the drug name.
- raw: the original line/segment the medicine came from, verbatim.
- confidence: "high" for clearly printed, "medium" for slightly unclear, "low" for handwritten or ambiguous.
- uncertain: true if the entry is handwritten, partially readable, or you are not fully sure it is a prescribed medicine.

Output JSON only, no commentary.`;

export async function extractMedicines(flat) {
  const { blocks } = flat;
  const docText = blocks
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((b) => `[${b.tag}] ${b.text}`)
    .join('\n');

  let medicines;
  let source = 'sarvam-llm';
  try {
    const parsed = await chatJSON(SYSTEM, `Prescription OCR blocks:\n${docText}`, { maxTokens: 4000 });
    medicines = Array.isArray(parsed?.medicines) ? parsed.medicines : [];
  } catch (err) {
    source = 'fallback';
    medicines = clueFallback(blocks);
  }

  medicines = medicines
    .map(normalizeMedicine)
    .filter((m) => m && m.name);

  attachRegions(medicines, blocks);

  return { medicines, source };
}

function normalizeMedicine(m) {
  if (!m || typeof m !== 'object') return null;
  const name = nullish(clean(m.name));
  if (!name) return null;
  const strength = nullish(clean(m.strength));
  const form = nullish(clean(m.form));
  let confidence = ['high', 'medium', 'low'].includes(m.confidence) ? m.confidence : 'medium';
  let uncertain = Boolean(m.uncertain);
  // Anything the model is not fully confident about is routed to the verify-with-crop step.
  if (confidence !== 'high') uncertain = true;
  return {
    name,
    strength,
    form,
    raw: clean(m.raw) || name,
    confidence,
    uncertain,
    region: null,
  };
}

function clean(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

// Models sometimes emit the literal string "null"/"none"/"-" instead of JSON null.
function nullish(s) {
  if (!s) return null;
  return /^(null|none|n\/?a|-|—)$/i.test(s) ? null : s;
}

// --- Map each medicine to a cropped region of the prescription image for review ---
// Sarvam gives block-level coordinates. When several medicines live in one table block,
// we slice that block vertically into even bands in the order their names appear.
function attachRegions(medicines, blocks) {
  const locatable = blocks.filter((b) => b.coordinates);
  // Choose the best block for each medicine.
  const assignment = medicines.map((m) => {
    const key = firstToken(m.name).toLowerCase();
    let best = null;
    let bestIdx = Infinity;
    for (const b of locatable) {
      const idx = b.text.toLowerCase().indexOf(key);
      if (idx >= 0 && (b.tag === 'table' || b.tag === 'paragraph' || b.tag === 'text' || b.tag === 'list' || idx < bestIdx)) {
        if (idx < bestIdx || !best) { best = b; bestIdx = idx; }
      }
    }
    return { medicine: m, block: best };
  });

  // Group by block to slice multi-medicine blocks.
  const byBlock = new Map();
  for (const a of assignment) {
    if (!a.block) continue;
    if (!byBlock.has(a.block.id)) byBlock.set(a.block.id, { block: a.block, items: [] });
    byBlock.get(a.block.id).items.push(a);
  }

  for (const { block, items } of byBlock.values()) {
    const c = block.coordinates;
    // Order items by position of their name within the block text.
    items.sort((p, q) =>
      block.text.toLowerCase().indexOf(firstToken(p.medicine.name).toLowerCase()) -
      block.text.toLowerCase().indexOf(firstToken(q.medicine.name).toLowerCase()));
    const n = items.length;
    const total = c.y2 - c.y1;
    items.forEach((a, i) => {
      if (n === 1) {
        a.medicine.region = { ...c, page: block.page };
      } else {
        // Even vertical bands, with a little padding so the line isn't clipped.
        const band = total / n;
        const pad = Math.min(14, band * 0.15);
        a.medicine.region = {
          x1: c.x1,
          x2: c.x2,
          y1: Math.max(c.y1, Math.round(c.y1 + i * band - pad)),
          y2: Math.min(c.y2, Math.round(c.y1 + (i + 1) * band + pad)),
          page: block.page,
        };
      }
    });
  }
}

function firstToken(s) {
  return (s || '').trim().split(/\s+/)[0] || s || '';
}

// --- Deterministic fallback: the "clue" approach, used only if the LLM call fails. ---
// Flags everything uncertain/low-confidence so the user reviews it.
const FORM_CUES = [
  [/\btab(?:\.|let)?\b/i, 'Tablet'],
  [/\bcap(?:\.|sule)?\b/i, 'Capsule'],
  [/\bsy(?:p|r)(?:\.|up)?\b/i, 'Syrup'],
  [/\binj(?:\.|ection)?\b/i, 'Injection'],
  [/\bdrops?\b/i, 'Drops'],
  [/\b(?:oint|cream|gel)\b/i, 'Ointment'],
  [/\binhaler\b/i, 'Inhaler'],
  [/\bsachet\b/i, 'Sachet'],
];
const STRENGTH_RE = /\b(\d{1,4}(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%))\b/i;
const DIRECTION_RE = /\d-\d-\d|after food|before food|before breakfast|twice|once|daily|sos|tsp|\bx\s?\d|times a day/i;

function clueFallback(blocks) {
  const out = [];
  const lines = [];
  for (const b of blocks) {
    // Split table rows and multi-line blocks into candidate lines.
    const cells = b.text.replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ');
    for (const line of cells.split('\n')) {
      const t = line.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
    }
  }
  for (const line of lines) {
    const hasForm = FORM_CUES.some(([re]) => re.test(line));
    const strengthMatch = line.match(STRENGTH_RE);
    if (!hasForm && !strengthMatch) continue;
    // Strip leading numbering and form prefix, and trailing directions.
    let name = line.replace(/^\s*\d+[.)]\s*/, '');
    for (const [re] of FORM_CUES) name = name.replace(re, ' ');
    name = name.split(DIRECTION_RE)[0];
    name = name.replace(STRENGTH_RE, ' ').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) continue;
    const form = FORM_CUES.find(([re]) => re.test(line))?.[1] || null;
    out.push({
      name,
      strength: strengthMatch ? strengthMatch[1].replace(/\s+/g, ' ') : null,
      form,
      raw: line,
      confidence: 'low',
      uncertain: true,
    });
  }
  return out;
}
