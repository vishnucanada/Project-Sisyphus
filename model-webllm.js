// WebLLM backend (Llama-3.2-3B via MLC, runs on WebGPU).

import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

let _enginePromise = null;
let _progress = null;

async function getEngine() {
  if (_enginePromise) return _enginePromise;
  _enginePromise = CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (p) => { _progress = p; }
  });
  return _enginePromise;
}

async function chat({ system, user, schema, stream = false, onDelta }) {
  const engine = await getEngine();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
  const opts = { messages, temperature: schema ? 0.1 : 0.3 };
  if (schema) opts.response_format = { type: "json_object", schema: JSON.stringify(schema) };

  if (!stream) {
    const r = await engine.chat.completions.create(opts);
    return r.choices[0].message.content;
  }
  opts.stream = true;
  const s = await engine.chat.completions.create(opts);
  let full = "";
  for await (const chunk of s) {
    const delta = chunk.choices[0]?.delta?.content || "";
    if (!delta) continue;
    full += delta;
    onDelta?.(delta, full);
  }
  return full;
}

window.MODEL = {
  name: "webllm-llama-3.2-3b",
  modelId: MODEL_ID,

  async available() {
    if (!("gpu" in navigator)) return "no-webgpu";
    return _enginePromise ? "available" : "downloadable";
  },

  async warm(onProgress) {
    const tick = setInterval(() => {
      if (_progress) onProgress?.(_progress.progress, _progress.text);
    }, 200);
    try { await getEngine(); }
    finally { clearInterval(tick); }
    onProgress?.(1, "ready");
  },

  async classify(jd, labels) {
    const raw = await chat({
      system: PROMPTS.CLASSIFY_SYSTEM,
      user: PROMPTS.classifyUser(jd, labels),
      schema: PROMPTS.classifySchema(labels)
    });
    const obj = JSON.parse(raw);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  // Rewrite all bullets in a single section. Returns array of same length as `bullets`.
  // Optionally validates and retries once if fabrication detected.
  async rewriteBullets({ jd, keywords, sectionTitle, subheading, bullets, onProgress }) {
    const n = bullets.length;
    if (n === 0) return [];

    const attempt = async (strictnessNote) => {
      const system = PROMPTS.REWRITE_BULLETS_SYSTEM + (strictnessNote ? "\n\nADDITIONAL: " + strictnessNote : "");
      const raw = await chat({
        system,
        user: PROMPTS.rewriteBulletsUser({ jd, keywords, sectionTitle, subheading, bullets }),
        schema: PROMPTS.rewriteBulletsSchema(n),
        stream: true,
        onDelta: (_d, full) => onProgress?.(full)
      });
      const obj = JSON.parse(raw);
      return obj.tailored;
    };

    let tailored = await attempt();
    // Validate each bullet; if any fail, retry once with a stricter directive.
    const checks = bullets.map((b, i) => VALIDATOR.validateBullet({
      original: b.original, rewrite: tailored[i] ?? "", allowedExtras: keywords
    }));
    const bad = checks.filter(c => !c.ok);
    if (bad.length) {
      const offenders = bad.flatMap(c => c.violations.map(v => v.token)).slice(0, 8);
      onProgress?.(`(retry — flagged: ${offenders.join(", ")})`);
      tailored = await attempt(`Your previous output added terms or numbers not present in the originals: ${offenders.join(", ")}. Do NOT introduce these. Stay strictly within the original bullets' content.`);
    }
    return tailored;
  },

  destroyAll() {}
};

window.dispatchEvent(new Event("model-ready-to-warm"));
