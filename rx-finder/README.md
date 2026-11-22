# RxReach

Upload a prescription once → get a clean, editable list of the **prescribed medicines** →
check **Blinkit, Zepto, and Swiggy Instamart** availability for your Hyderabad address in one
flow → see the **smallest set of stores** that covers your whole list.

Built for the real problem: reading a prescription by hand and retyping each medicine into
three apps separately.

## Two ways to run it

- **Hosted page (no setup, no key):** `rxreach.html` is a single self-contained page published
  as a Claude Artifact. Opened inside Claude, it reads the prescription with the viewer's own
  Claude account (the `sample` capability with images) — no API key, no backend. Supports photo
  uploads (PNG/JPG/WebP); for a PDF, screenshot the page and upload the image.
- **Self-hosted server (your own key) — this is the one that auto-checks stock.** The Node app
  (`server.js` + `src/` + `public/`) uses **Sarvam AI** for OCR + structuring, handles PDFs
  directly, shows per-line image crops, and — unlike the hosted page — **automatically checks
  Blinkit, Zepto and Instamart availability** for you (see below). The hosted page can't check
  stock because the stores block in-browser calls; automation needs this server.

## Automated availability check (3 stores)

No quick-commerce platform offers an authorized stock API, so there's no clean way to read stock
without loading the stores' own pages. This app does that the honest way: for each medicine it
opens each store's **real search** in a headless browser (`src/availability.js`, Playwright) with
your **Hyderabad geolocation** spoofed so results match your area, reads the rendered result, and
uses the LLM to judge whether that exact medicine is orderable. The grid fills automatically; you
only tap a cell to override.

- **Available / Out of stock / Couldn't search** are set for you. A page it can't read (location
  prompt, block, markup change) comes back **"Couldn't search" with the link — never a fake
  "in stock."**
- **Run it on your own machine** (your Hyderabad IP + location give the best results, and it's your
  own authorized browsing). A datacenter IP is more likely to be blocked by the stores.
- It needs the Playwright browser: `npx playwright install chromium` after `npm install`.
- Set precise coordinates for your locality (serviceability varies by area); the default is central
  Hyderabad. Adjust `HYD` in `server.js` or pass `lat`/`lon` to `POST /api/availability`.
- This uses the platforms' own pages and may break if a store changes things or rate-limits you;
  treat it as best-effort for personal use.

## What it does

1. **Upload once.** Photo or PDF. The backend runs **Sarvam AI** document OCR (built for
   handwriting + Indian languages) and then uses Sarvam's LLM to keep only the medicines —
   dropping patient details, clinic info, diagnosis, and directions like "after food".
2. **Review.** An editable list with name / strength / form wherever they're readable.
   Uncertain or handwritten entries are pinned to the top and shown **next to the matching
   crop of your prescription** so you can verify them. Unreadable details are left blank —
   nothing is guessed.
3. **Check all three stores in one action.** For each medicine, open the platform's real
   search at your location and mark the result. Four distinct states are tracked:
   **Available · Out of stock · Not checked · Couldn't search** — so an out-of-stock exact
   match is never confused with a search that failed.
4. **Coverage.** If one store has everything, it's surfaced first. Otherwise you get the
   smallest combination of stores that covers the list, with any still-missing medicines
   highlighted.

## Honest limitations (please read)

- **No live stock API exists.** None of Blinkit, Zepto, or Swiggy Instamart offers an
  authorized public availability API. RxReach therefore uses each platform's **public search
  page** (authorized use) and asks *you* to confirm stock. It **never** scrapes private
  endpoints and **never** shows invented/auto-filled availability.
- Delivery location can't be reliably pre-set via URL, so you set your exact Hyderabad address
  inside each app the first time.
- The app **never substitutes** a different medicine, strength, or form.
- `src/stores.js` is structured so a *licensed* quick-commerce data vendor could later fill
  availability automatically — that adapter is intentionally not built.

## Privacy

The uploaded prescription is held **in memory only** (30-min TTL), sent **only** to Sarvam for
OCR, **never written to disk**, and its contents are **never logged**. Only your own edits and
store marks persist, and only in your browser (`localStorage`).

## Run it

Requires Node 18+ (uses built-in `fetch`/`FormData`).

```bash
cd rx-finder
cp .env.example .env        # then add your SARVAM_API_KEY
npm install
npm start                   # http://localhost:3000
```

Get a Sarvam API key at https://dashboard.sarvam.ai. The key is read server-side from
`SARVAM_API_KEY` and is never exposed to the browser.

### Config (env)

| Variable | Default | Purpose |
|---|---|---|
| `SARVAM_API_KEY` | – | Sarvam AI key (required) |
| `PORT` | `3000` | HTTP port |
| `SARVAM_LANGUAGE` | `en-IN` | OCR language hint (e.g. `hi-IN`, `te-IN`) |
| `SARVAM_CHAT_MODEL` | `sarvam-105b` | Model used to structure medicines |

## How it's wired

```
Browser (public/)                     Backend (server.js)                Sarvam AI
  upload ─────────────── POST /api/extract ──► parse job  ──► /doc-ai/v1/job/parse
                                               poll status ──► /doc-ai/v1/job/{id}/status
                                               fetch result ─► /doc-ai/v1/job/{id}/results (gzip JSON)
                                               classify ─────► /v1/chat/completions (JSON)
  review  ◄───── { medicines[], imageId, image dims } ◄──────
  GET /api/image/:id  (in-memory crop source)
  stores  ── deep-links + coverage computed entirely in the browser (stores.js)
```

## Project layout

- `server.js` — routes, in-memory image store, static hosting
- `src/sarvam.js` — Sarvam OCR (Parse job flow) + chat client
- `src/extract.js` — medicine classification prompt, region mapping, clue-based fallback
- `public/` — UI (`index.html`, `app.js`, `styles.css`) and `stores.js` (deep-links + coverage)
- `samples/` — a synthetic prescription for testing (no real patient data)
