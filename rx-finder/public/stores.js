// Store deep-links + coverage optimizer. Runs entirely in the browser — no medicine data
// leaves the device for the store step. These are the platforms' public search pages
// (authorized use); delivery location is chosen by the user inside each app.
// Wrapped in an IIFE so only window.RxStores is exposed (avoids global name clashes).
(function () {
const STORES = [
  { id: 'blinkit',  name: 'Blinkit',          color: '#f8cb46', ink: '#1a1a1a', search: (q) => `https://blinkit.com/s/?q=${q}` },
  { id: 'zepto',    name: 'Zepto',            color: '#7b2d8e', ink: '#ffffff', search: (q) => `https://www.zeptonow.com/search?query=${q}` },
  { id: 'instamart',name: 'Swiggy Instamart', color: '#f25c2a', ink: '#ffffff', search: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${q}` },
];

// Availability states (the four the brief distinguishes)
const STATES = {
  unchecked: { label: 'Not checked',   short: '—',  cls: 'st-unchecked' },
  available: { label: 'Available',     short: '✓',  cls: 'st-available' },
  oos:       { label: 'Out of stock',  short: '✕',  cls: 'st-oos' },
  failed:    { label: "Couldn't search", short: '!', cls: 'st-failed' },
};
const STATE_CYCLE = ['unchecked', 'available', 'oos', 'failed'];

function medQuery(med) {
  const q = [med.name, med.strength].filter(Boolean).join(' ');
  return encodeURIComponent(q);
}
function storeLink(store, med) {
  return store.search(medQuery(med));
}

/**
 * marks: { [medId]: { [storeId]: stateKey } }
 * medicines: [{ id, name, ... }]
 * Returns the recommendation:
 *  - single: storeId that alone covers EVERY medicine (or null)
 *  - combo: smallest set of stores covering the most medicines
 *  - coveredByCombo: Set of medId covered by `combo`
 *  - missing: medIds not available at ANY store
 *  - perStore: { storeId: {covered:[medId], count} }
 */
function computeCoverage(medicines, marks) {
  const medIds = medicines.map((m) => m.id);
  const availAt = (storeId) =>
    new Set(medIds.filter((id) => (marks[id] && marks[id][storeId]) === 'available'));

  const perStore = {};
  for (const s of STORES) {
    const covered = [...availAt(s.id)];
    perStore[s.id] = { covered, count: covered.length };
  }

  // Single store that covers everything.
  let single = null;
  for (const s of STORES) {
    if (medIds.length && perStore[s.id].count === medIds.length) { single = s.id; break; }
  }

  // Brute-force all 2^n subsets; pick max coverage, tie-break fewest stores.
  let best = { ids: [], covered: new Set(), size: 0 };
  const n = STORES.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const ids = [];
    const covered = new Set();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        ids.push(STORES[i].id);
        for (const id of perStore[STORES[i].id].covered) covered.add(id);
      }
    }
    const better =
      covered.size > best.covered.size ||
      (covered.size === best.covered.size && ids.length < best.size);
    if (better) best = { ids, covered, size: ids.length };
  }

  const missing = medIds.filter((id) =>
    !STORES.some((s) => (marks[id] && marks[id][s.id]) === 'available'));

  return { single, combo: best.ids, coveredByCombo: best.covered, missing, perStore };
}

window.RxStores = { STORES, STATES, STATE_CYCLE, medQuery, storeLink, computeCoverage };
})();
