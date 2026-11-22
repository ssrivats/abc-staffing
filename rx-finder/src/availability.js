// Best-effort automated availability check for Blinkit, Zepto and Swiggy Instamart.
//
// How it works: for each store we open its REAL search page in a headless browser with the
// user's Hyderabad geolocation spoofed (the stores set the delivery area from the browser's
// geolocation), let it render, read the visible text, and ask the LLM whether the specific
// medicine is actually orderable there. Reading the rendered text + judging with the LLM is far
// more robust to markup changes than CSS-selector scraping, and it is conservative: anything it
// cannot clearly confirm comes back "failed" (couldn't check) rather than a fake "available".
//
// Honest limits: these are the platforms' own pages, loaded as the user would — run this on YOUR
// machine (your Hyderabad IP + location), not a datacenter that the stores may block. Serviceability
// varies by exact locality; set precise coordinates for your area. If a store changes something and
// a page won't read, that medicine/store shows "couldn't check" with the manual search link.

import { createRequire } from 'module';
import { chatJSON } from './sarvam.js';

const require = createRequire(import.meta.url);

const STORE_URL = {
  blinkit:   (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
  zepto:     (q) => `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}`,
  instamart: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
};

function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    try { return require('playwright-core').chromium; } catch { return null; }
  }
}

/**
 * @param medicines [{id,name,strength,form}]
 * @param location  {lat, lon}
 * @returns { [medId]: { [store]: {status:'available'|'oos'|'failed', detail?, matched?} } }
 */
export async function checkAvailability(medicines, { lat, lon }) {
  const chromium = loadChromium();
  if (!chromium) {
    const miss = {};
    for (const m of medicines) { miss[m.id] = {}; for (const s of Object.keys(STORE_URL)) miss[m.id][s] = { status: 'failed', detail: 'playwright not installed' }; }
    return miss;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = {};
  for (const m of medicines) results[m.id] = {};

  try {
    // Run the three stores in parallel (each its own context), medicines sequentially within a store.
    await Promise.all(Object.keys(STORE_URL).map(async (store) => {
      const ctx = await browser.newContext({
        geolocation: { latitude: lat, longitude: lon },
        permissions: ['geolocation'],
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        viewport: { width: 412, height: 915 },
        userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      const page = await ctx.newPage();
      for (const med of medicines) {
        results[med.id][store] = await checkOne(page, store, med);
      }
      await ctx.close().catch(() => {});
    }));
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

async function checkOne(page, store, med) {
  const q = [med.name, med.strength].filter(Boolean).join(' ');
  try {
    await page.goto(STORE_URL[store](q), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500); // let product cards hydrate
    const text = (await page.evaluate(() => (document.body && document.body.innerText) || '')).slice(0, 6000);
    return await judge(text, med, store);
  } catch (e) {
    return { status: 'failed', detail: (e.message || 'load error').slice(0, 120) };
  }
}

async function judge(pageText, med, store) {
  if (!pageText || pageText.replace(/\s+/g, '').length < 40) {
    return { status: 'failed', detail: 'page did not render (location prompt or block?)' };
  }
  const system =
`You are given the visible text of a ${store} quick-commerce SEARCH RESULTS page. Decide whether a specific medicine is available to order at the user's location.
Respond with ONLY JSON: {"verdict":"available"|"out_of_stock"|"not_found"|"unclear","matched":string|null}
Rules:
- "available": a product clearly matching the medicine name (and strength if given) is shown AND looks orderable — it has a price or an Add button and is NOT marked out of stock / sold out / notify me.
- "out_of_stock": a matching product is shown but marked out of stock / sold out / notify me / unavailable.
- "not_found": no matching product appears (a "no results" message, or only unrelated products).
- "unclear": you cannot tell — the page looks like a location/permission prompt, a login wall, a captcha, or an empty shell.
Match the actual medicine, not just any shared word. Never answer "available" unless you can see an orderable matching product.`;
  const user = `Medicine: ${med.name}${med.strength ? ' ' + med.strength : ''}${med.form ? ' (' + med.form + ')' : ''}\n\nPage text:\n${pageText}`;
  let r;
  try {
    r = await chatJSON(system, user, { maxTokens: 300 });
  } catch {
    return { status: 'failed', detail: 'could not judge page' };
  }
  switch (r && r.verdict) {
    case 'available':    return { status: 'available', matched: r.matched || null };
    case 'out_of_stock': return { status: 'oos', detail: 'out of stock', matched: r.matched || null };
    case 'not_found':    return { status: 'oos', detail: 'not listed', matched: null };
    default:             return { status: 'failed', detail: 'result unclear' };
  }
}
