// Embedding-based variant matcher using Transformers.js + all-MiniLM-L6-v2 (~25MB).
// Falls back to model.classify() (LLM) if Transformers.js / WebGPU is unavailable.

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

const MODEL = "Xenova/all-MiniLM-L6-v2";

let _extractor = null;
async function getExtractor(onProgress) {
  if (_extractor) return _extractor;
  _extractor = await pipeline("feature-extraction", MODEL, {
    progress_callback: (p) => onProgress?.(p)
  });
  return _extractor;
}

async function embed(text) {
  const fx = await getExtractor();
  const out = await fx(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both normalized → cosine = dot
}

// One-time embed of each variant. Cache by content hash.
const _variantCache = new Map();
async function embedVariants(variants) {
  const out = {};
  for (const [label, text] of Object.entries(variants)) {
    if (_variantCache.has(text)) { out[label] = _variantCache.get(text); continue; }
    const v = await embed(text.slice(0, 4000));
    _variantCache.set(text, v);
    out[label] = v;
  }
  return out;
}

async function matchVariant(jdText, variants) {
  const variantVecs = await embedVariants(variants);
  const jdVec = await embed(jdText.slice(0, 4000));
  const scores = Object.entries(variantVecs).map(([label, v]) => ({
    label, score: cosine(jdVec, v)
  })).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const runnerUp = scores[1] || { score: 0 };
  // Confidence = margin between top and runner-up, scaled.
  const confidence = Math.min(1, Math.max(0, (top.score - runnerUp.score) * 5 + 0.5));
  return { label: top.label, confidence, scores };
}

async function warm(onProgress) {
  await getExtractor((p) => onProgress?.(p));
}

window.EMBEDDINGS = { matchVariant, embed, warm };
window.dispatchEvent(new Event("embeddings-ready-to-warm"));
