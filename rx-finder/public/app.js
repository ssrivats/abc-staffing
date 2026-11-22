// RxReach frontend orchestration.
const { STORES, STATES, STATE_CYCLE, storeLink, computeCoverage } = window.RxStores;

const state = {
  data: null,          // raw /api/extract response
  medicines: [],       // editable working copy: { id, name, strength, form, confidence, uncertain, raw, region }
  marks: {},           // { medId: { storeId: stateKey } }
  imageEl: null,       // loaded <img> for cropping (raster uploads only)
  isPdf: false,
};
let idSeq = 1;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

/* ---------------- Stage navigation ---------------- */
function showStage(name) {
  for (const s of ['upload', 'review', 'stores']) $('#stage-' + s).classList.toggle('hidden', s !== name);
  document.querySelectorAll('#steps li').forEach((li) => {
    const order = ['upload', 'review', 'stores'];
    const i = order.indexOf(li.dataset.step), cur = order.indexOf(name);
    li.classList.toggle('active', li.dataset.step === name);
    li.classList.toggle('done', i < cur);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Upload ---------------- */
function initUpload() {
  const dz = $('#dropzone'), input = $('#fileInput');
  input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}

async function handleFile(file) {
  $('#uploadError').classList.add('hidden');
  $('#uploadBusy').classList.remove('hidden');
  $('#dropzone').classList.add('hidden');
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/extract', { method: 'POST', body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Extraction failed');

    state.data = body;
    state.isPdf = body.image.mime === 'application/pdf';
    state.medicines = (body.medicines || []).map((m) => ({ ...m, id: 'm' + idSeq++ }));
    state.marks = loadMarks(signature(state.medicines));
    await loadImage(body.imageId, body.image.mime);
    renderReview();
    showStage('review');
  } catch (err) {
    $('#uploadError').textContent = err.message || 'Something went wrong. Please try again.';
    $('#uploadError').classList.remove('hidden');
    $('#dropzone').classList.remove('hidden');
  } finally {
    $('#uploadBusy').classList.add('hidden');
  }
}

function loadImage(imageId, mime) {
  state.imageEl = null;
  const url = '/api/image/' + imageId;
  $('#rxPdfNote').classList.toggle('hidden', mime !== 'application/pdf');
  if (mime === 'application/pdf') { $('#rxPdfLink').href = url; $('#rxFull').src = ''; return Promise.resolve(); }
  $('#rxFull').src = url;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { state.imageEl = img; resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/* ---------------- Review ---------------- */
function renderReview() {
  const meds = state.medicines;
  $('#reviewLede').textContent = meds.length
    ? `We found ${meds.length} medicine${meds.length > 1 ? 's' : ''}. Edit anything, and add or remove entries before searching.`
    : 'We could not confidently find any medicines. Add them manually below.';

  const note = $('#sourceNote');
  if (state.data?.meta?.source === 'fallback') {
    note.classList.remove('hidden');
    note.textContent = 'The AI reader was unavailable, so this is a best-effort text scan — please check every entry carefully.';
  } else note.classList.add('hidden');

  // Uncertain entries pinned up top with image crops.
  const uncertain = meds.filter((m) => m.uncertain);
  const wrap = $('#uncertainWrap');
  wrap.classList.toggle('hidden', uncertain.length === 0);
  $('#uncertainCount').textContent = `(${uncertain.length})`;
  const list = $('#uncertainList'); list.innerHTML = '';
  for (const m of uncertain) list.appendChild(uncertainCard(m));

  renderTable();
}

function uncertainCard(m) {
  const card = el('div', 'uncertain-card');
  const crop = el('div', 'crop');
  const c = cropRegion(m.region);
  if (c) crop.appendChild(c);
  else { crop.classList.add('empty'); crop.textContent = state.isPdf ? 'Open full PDF to verify' : 'No image region'; }

  const fields = el('div', 'uc-fields');
  fields.appendChild(field(m, 'name', 'Medicine name'));
  fields.appendChild(field(m, 'strength', 'Strength'));
  fields.appendChild(field(m, 'form', 'Form'));
  const raw = el('div', 'raw', `Read as: “${esc(m.raw || '')}” <span class="conf ${m.confidence}">${m.confidence}</span>`);
  fields.appendChild(raw);

  card.appendChild(crop);
  card.appendChild(fields);
  return card;
}

function field(m, key, placeholder) {
  const i = el('input');
  i.value = m[key] || '';
  i.placeholder = placeholder;
  i.setAttribute('aria-label', placeholder);
  i.addEventListener('input', () => { m[key] = i.value.trim() || null; });
  i.addEventListener('change', () => { renderTable(); }); // keep the full list in sync
  return i;
}

function renderTable() {
  const body = $('#medsBody'); body.innerHTML = '';
  for (const m of state.medicines) {
    const { row, cropRow } = medRow(m);
    body.appendChild(row);
    body.appendChild(cropRow);
  }
}

function medRow(m) {
  const tr = el('tr');
  const nameTd = el('td', 'name-cell');
  const nameInput = el('input'); nameInput.value = m.name || ''; nameInput.placeholder = 'e.g. Dolo';
  nameInput.addEventListener('input', () => { m.name = nameInput.value.trim(); });
  nameTd.appendChild(nameInput);
  if (m.confidence) nameTd.insertAdjacentHTML('beforeend', `<span class="conf ${m.confidence}">${m.confidence}</span>`);

  const strTd = el('td'); const strI = el('input'); strI.value = m.strength || ''; strI.placeholder = '—';
  strI.addEventListener('input', () => { m.strength = strI.value.trim() || null; }); strTd.appendChild(strI);

  const formTd = el('td'); const formI = el('input'); formI.value = m.form || ''; formI.placeholder = '—';
  formI.addEventListener('input', () => { m.form = formI.value.trim() || null; }); formTd.appendChild(formI);

  // Detail row holding the prescription crop, toggled by the peek button.
  const cropRow = el('tr', 'crop-row hidden');
  const cropTd = el('td'); cropTd.colSpan = 4;
  cropRow.appendChild(cropTd);

  const actTd = el('td', 'row-actions');
  const peek = el('button', 'icon-btn', '🔍'); peek.title = 'Show on prescription';
  peek.addEventListener('click', () => {
    const open = !cropRow.classList.contains('hidden');
    if (open) { cropRow.classList.add('hidden'); return; }
    cropTd.innerHTML = '';
    const crop = el('div', 'crop');
    const c = cropRegion(m.region, 460, 150);
    if (c) crop.appendChild(c);
    else { crop.classList.add('empty'); crop.textContent = state.isPdf ? 'Open full PDF to verify' : 'No image region found'; }
    const cap = el('div', 'crop-cap', `Read as: “${esc(m.raw || m.name)}”`);
    cropTd.append(crop, cap);
    cropRow.classList.remove('hidden');
  });
  const del = el('button', 'icon-btn', '🗑'); del.title = 'Remove';
  del.addEventListener('click', () => { state.medicines = state.medicines.filter((x) => x !== m); renderReview(); });
  actTd.append(peek, del);

  tr.append(nameTd, strTd, formTd, actTd);
  return { row: tr, cropRow };
}

function addRow() {
  state.medicines.push({ id: 'm' + idSeq++, name: '', strength: null, form: null, confidence: null, uncertain: false, raw: '', region: null });
  renderTable();
  $('#medsBody').lastChild?.querySelector('input')?.focus();
}

/* ---------------- Image cropping ---------------- */
function cropRegion(region, boxW = 200, boxH = 90) {
  if (!region || !state.imageEl) return null;
  const img = state.imageEl;
  const parseW = state.data.image.width || img.naturalWidth;
  const parseH = state.data.image.height || img.naturalHeight;
  const sx = img.naturalWidth / parseW, sy = img.naturalHeight / parseH;
  const rx = Math.max(0, region.x1 * sx), ry = Math.max(0, region.y1 * sy);
  const rw = Math.max(1, (region.x2 - region.x1) * sx), rh = Math.max(1, (region.y2 - region.y1) * sy);
  const scale = Math.min(boxW / rw, boxH / rh);
  const cw = Math.round(rw * scale), ch = Math.round(rh * scale);
  const canvas = el('canvas'); canvas.width = cw; canvas.height = ch;
  try {
    canvas.getContext('2d').drawImage(img, rx, ry, rw, rh, 0, 0, cw, ch);
  } catch { return null; }
  return canvas;
}

/* ---------------- Stores ---------------- */
function goStores() {
  // Drop empty rows and require a name.
  state.medicines = state.medicines.filter((m) => m.name && m.name.trim());
  if (!state.medicines.length) { alert('Add at least one medicine before checking stores.'); return; }
  state.marks = loadMarks(signature(state.medicines)) || {};
  for (const m of state.medicines) state.marks[m.id] = state.marks[m.id] || {};
  renderLegend();
  renderGrid();
  renderRecommendation();
  showStage('stores');
}

function renderLegend() {
  const lg = $('#legend'); lg.innerHTML = '';
  for (const key of STATE_CYCLE) {
    const s = STATES[key];
    lg.insertAdjacentHTML('beforeend',
      `<span class="lg"><span class="dot ${s.cls}"></span>${esc(s.label)}</span>`);
  }
}

function renderGrid() {
  const table = $('#storeGrid');
  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th>Medicine</th>';
  for (const s of STORES) {
    thead.insertAdjacentHTML('beforeend',
      `<th><span class="store-head"><span class="store-chip" style="background:${s.color};color:${s.ink}">${esc(s.name)}</span></span></th>`);
  }
  const tbody = table.querySelector('tbody'); tbody.innerHTML = '';
  for (const m of state.medicines) {
    const tr = el('tr'); tr.dataset.med = m.id;
    const sub = [m.strength, m.form].filter(Boolean).join(' · ');
    const nameTd = el('td');
    nameTd.innerHTML = `<div class="med-name">${esc(m.name)}</div>${sub ? `<div class="med-sub">${esc(sub)}</div>` : ''}`;
    tr.appendChild(nameTd);
    for (const s of STORES) tr.appendChild(storeCell(m, s));
    tbody.appendChild(tr);
  }
}

function storeCell(m, store) {
  const td = el('td');
  const cell = el('div', 'cell');
  const link = el('a', 'open-link', 'Open ↗');
  link.href = storeLink(store, m); link.target = '_blank'; link.rel = 'noopener';

  const cur = state.marks[m.id]?.[store.id] || 'unchecked';
  const btn = el('button', 'state-btn ' + STATES[cur].cls, STATES[cur].label);
  btn.addEventListener('click', () => {
    const next = STATE_CYCLE[(STATE_CYCLE.indexOf(state.marks[m.id][store.id] || 'unchecked') + 1) % STATE_CYCLE.length];
    state.marks[m.id][store.id] = next;
    btn.className = 'state-btn ' + STATES[next].cls;
    btn.textContent = STATES[next].label;
    saveMarks(signature(state.medicines), state.marks);
    renderRecommendation();
    markMissingRows();
  });

  cell.append(link, btn);
  td.appendChild(cell);
  return td;
}

function markMissingRows() {
  const { missing } = computeCoverage(state.medicines, state.marks);
  const missSet = new Set(missing);
  document.querySelectorAll('#storeGrid tbody tr').forEach((tr) => {
    // Only flag as missing once every store has been marked for that medicine.
    const m = state.medicines.find((x) => x.id === tr.dataset.med);
    const allMarked = STORES.every((s) => (state.marks[m.id]?.[s.id] || 'unchecked') !== 'unchecked');
    tr.classList.toggle('row-missing', allMarked && missSet.has(m.id));
  });
}

function renderRecommendation() {
  const box = $('#recommendation');
  const { single, combo, coveredByCombo, missing } = computeCoverage(state.medicines, state.marks);
  const total = state.medicines.length;
  const anyMarked = state.medicines.some((m) => STORES.some((s) => (state.marks[m.id]?.[s.id] || 'unchecked') !== 'unchecked'));
  box.className = 'reco';

  if (!anyMarked) {
    box.innerHTML = `<h3>Where can you get everything?</h3><p class="sub">Open each store and mark what you find. As you do, we’ll work out the fewest stores that cover your whole list.</p>`;
    return;
  }
  const chip = (id) => { const s = STORES.find((x) => x.id === id); return `<span class="pill-store" style="background:${s.color};color:${s.ink}">${esc(s.name)}</span>`; };

  if (single) {
    box.classList.add('allfound');
    box.innerHTML = `<h3>✅ One store has everything</h3><div class="big">${chip(single)} covers all ${total} medicines.</div><p class="sub">Order it all in one place.</p>`;
    return;
  }
  const coveredN = coveredByCombo.size;
  let html = `<h3>Smallest combination of stores</h3>`;
  if (combo.length) {
    html += `<div class="big">${combo.map(chip).join(' + ')} covers ${coveredN} of ${total} medicines.</div>`;
  } else {
    html += `<div class="big">No availability marked yet.</div>`;
  }
  if (missing.length) {
    const names = missing.map((id) => state.medicines.find((m) => m.id === id)?.name).filter(Boolean);
    html += `<div class="missing">⚠️ Still missing (not marked available anywhere): ${names.map(esc).join(', ')}</div>`;
  } else if (combo.length) {
    html += `<p class="sub">This combination covers your whole list.</p>`;
  }
  box.innerHTML = html;
}

/* ---------------- Persistence ---------------- */
function signature(meds) {
  return 'rxreach:' + meds.map((m) => (m.name || '').toLowerCase() + '|' + (m.strength || '')).sort().join('~');
}
function saveMarks(sig, marks) { try { localStorage.setItem(sig, JSON.stringify(marks)); } catch {} }
function loadMarks(sig) { try { return JSON.parse(localStorage.getItem(sig) || '{}'); } catch { return {}; } }

/* ---------------- Modal ---------------- */
function initModal() {
  $('#viewRxBtn').addEventListener('click', () => $('#rxModal').classList.remove('hidden'));
  $('#rxModalClose').addEventListener('click', () => $('#rxModal').classList.add('hidden'));
  $('#rxModal').addEventListener('click', (e) => { if (e.target.id === 'rxModal') $('#rxModal').classList.add('hidden'); });
}

/* ---------------- Wire up ---------------- */
function init() {
  initUpload();
  initModal();
  $('#addRowBtn').addEventListener('click', addRow);
  $('#toStoresBtn').addEventListener('click', goStores);
  $('#backToUpload').addEventListener('click', () => location.reload());
  $('#backToReview').addEventListener('click', () => showStage('review'));
  $('#resetMarks').addEventListener('click', () => {
    if (!confirm('Clear all availability marks?')) return;
    state.marks = {}; for (const m of state.medicines) state.marks[m.id] = {};
    saveMarks(signature(state.medicines), state.marks);
    renderGrid(); renderRecommendation(); markMissingRows();
  });
  $('#addrInput').addEventListener('input', (e) => { $('#cityPill').textContent = '📍 ' + (e.target.value.trim() || 'Hyderabad'); });
}
init();
