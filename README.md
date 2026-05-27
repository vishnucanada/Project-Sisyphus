# Resume Tailor

A Chrome extension (codename **Sisyphus**) that scrapes the job description on the active tab, picks the best-matching resume variant from a local library, checks whether you meet the listed qualifications, and rewrites your bullets to align with the JD — all on-device.

No backend. No API keys. The LLM is Chrome's built-in Gemini Nano; the embedding model is `all-MiniLM-L6-v2` running locally via Transformers.js + ONNX Runtime WASM.

## Features

- **One-click JD scrape** with site-specific extractors for LinkedIn, Indeed, Greenhouse, Lever, Workday, and Ashby, plus a generic fallback.
- **Variant matching** via cosine similarity between the JD and each resume variant's embedding (`Xenova/all-MiniLM-L6-v2`, ~25 MB, cached in `localStorage`).
- **Qualification check** — Gemini Nano reads the JD's hard requirements and your resume and flags any gaps.
- **Bullet rewriting** with a validator that rejects hallucinated tech, employers, or metrics. If the validator catches the model inventing things, the rewrite is retried with the offenders explicitly forbidden.
- **Diff view** that color-codes each added word by provenance: from the original bullet, from a JD keyword, or model-introduced.
- **Export** to clipboard, a styled `.docx`, or a print-ready preview tab.
- **History** of saved applications, with per-entry timings.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select this directory.
3. Pin the extension and click its icon to open the side panel.

Requires Chrome 128+ with the built-in **Prompt API** (Gemini Nano) available. Visit `chrome://on-device-internals` to confirm the model is downloaded; the side panel's `LLM:` pill will also report status.

## Layout

```
manifest.json           MV3 manifest (side panel + scripting + activeTab)
extension/              Side panel UI + background service worker
  background.js           JD scraping (runs in the active tab via chrome.scripting)
  sidepanel.{html,css,js} Side panel UI and orchestration
src/
  core/                   Pure logic — no extension APIs
    prompts.js              System + user prompts, JSON schemas for structured output
    resume-parser.js        Resume text → sections → subheadings → bullets
    validator.js            Rejects rewrites that introduce unauthorized tokens
    diff.js                 Word-level diff with provenance tagging
  data/resumes.js         Built-in resume variants (ml_ai / research / swe)
  lib/                    Side-effectful helpers (storage, rendering)
    history.js, preview.js, docx.js
  models/
    gemini.js               Gemini Nano sessions: classify, qual-check, rewrite
    embeddings.js           Transformers.js variant matcher + bullet ranker
    webllm.js               (legacy) WebLLM backend, unused by current UI
vendor/                 Vendored transformers.min.js, docx.mjs, ORT WASM
dev/                    Standalone dev page for iterating on the UI outside Chrome
samples/                Reference resume .docx files
```

## How it works

1. **Scrape** — `background.js` injects `scrapeJD` into the active tab. Per-site selectors run first; if none match, it picks the largest reasonable `<article>`/`<main>` block.
2. **Match** — the JD is embedded and compared against each variant's embedding. Confidence is the margin between the top two scores.
3. **Qual check** — Gemini Nano returns a structured JSON verdict (meet/partial/miss) with reasons. Output is constrained by `PROMPTS.qualCheckSchema()`.
4. **Rewrite** — bullets are ranked by JD relevance, then the top set is rewritten with `responseConstraint` enforcing shape. `VALIDATOR.validateBullet` checks each rewrite for unauthorized tokens (companies, technologies, metrics not present in the original). Violations trigger one retry with the offenders explicitly forbidden.
5. **Render** — `diff.js` produces a word-level diff with provenance tags (original / JD-keyword / model-introduced) for the UI.

## Privacy

Everything runs in your browser. The JD never leaves your machine. The embedding model weights stream once from `huggingface.co` on first run, then live in IndexedDB; embeddings themselves are cached in `localStorage` by content hash.

## Development

There's no build step — the side panel loads source files directly. To iterate on UI logic without reloading the extension each time, open `dev/dev.html` in a regular Chrome tab.
