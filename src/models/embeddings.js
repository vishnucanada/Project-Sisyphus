// Embedding-based variant matcher + bullet ranker using Transformers.js + all-MiniLM-L6-v2 (~25MB).
// Embeddings are cached in localStorage by content hash so they survive page reloads.

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const CACHE_PREFIX = "emb_v1_";

// Fast non-cryptographic hash (FNV-1a). 32-bit, base36-encoded.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? Float32Array.from(JSON.parse(raw)) : null;
  } catch { return null; }
}

function cacheSet(key, vec) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(Array.from(vec))); }
  catch { /* quota exceeded — fine to skip */ }
}

let _extractor = null;
async function getExtractor(onProgress) {
  if (_extractor) return _extractor;
  _extractor = await pipeline("feature-extraction", MODEL, {
    progress_callback: (p) => onProgress?.(p)
  });
  return _extractor;
}

const _memCache = new Map(); // in-memory layer above localStorage

async function embed(text) {
  const trimmed = text.slice(0, 4000);
  const key = hash(trimmed);
  if (_memCache.has(key)) return _memCache.get(key);
  const persisted = cacheGet(key);
  if (persisted) { _memCache.set(key, persisted); return persisted; }

  const fx = await getExtractor();
  const out = await fx(trimmed, { pooling: "mean", normalize: true });
  const vec = Float32Array.from(out.data);
  _memCache.set(key, vec);
  cacheSet(key, vec);
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both normalized → cosine == dot
}

async function matchVariant(jdText, variants) {
  const variantVecs = {};
  for (const [label, text] of Object.entries(variants)) {
    variantVecs[label] = await embed(text);
  }
  const jdVec = await embed(jdText);
  const scores = Object.entries(variantVecs).map(([label, v]) => ({
    label, score: cosine(jdVec, v)
  })).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const runnerUp = scores[1] || { score: 0 };
  const confidence = Math.min(1, Math.max(0, (top.score - runnerUp.score) * 5 + 0.5));
  return { label: top.label, confidence, scores };
}

// Rank a list of bullets by relevance to a JD. Returns indices in descending relevance order.
async function rankBulletsByJD(bullets, jdText) {
  const jdVec = await embed(jdText);
  const scored = [];
  for (let i = 0; i < bullets.length; i++) {
    const v = await embed(bullets[i]);
    scored.push({ i, score: cosine(jdVec, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function warm(onProgress) {
  await getExtractor((p) => onProgress?.(p));
}

function clearCache() {
  _memCache.clear();
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

window.EMBEDDINGS = { matchVariant, rankBulletsByJD, embed, cosine, warm, clearCache };
window.dispatchEvent(new Event("embeddings-ready-to-warm"));
