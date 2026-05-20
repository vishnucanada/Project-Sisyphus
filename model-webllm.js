// WebLLM backend (Llama-3.2-3B via MLC, runs on WebGPU).
// ES module: load with <script type="module" src="model-webllm.js">.
// In dev.html (file://) this fetches the runtime from esm.run. For the extension
// (CSP forbids remote JS), npm install @mlc-ai/web-llm and bundle locally.

import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
// Smaller alternative for faster iteration: "Llama-3.2-1B-Instruct-q4f16_1-MLC"

let _enginePromise = null;
let _progress = null;

async function getEngine() {
  if (_enginePromise) return _enginePromise;
  _enginePromise = CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (p) => { _progress = p; }
  });
  return _enginePromise;
}

async function streamChat({ system, user, schema, onDelta }) {
  const engine = await getEngine();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
  const opts = { messages, stream: true, temperature: schema ? 0.1 : 0.3 };
  if (schema) opts.response_format = { type: "json_object", schema: JSON.stringify(schema) };

  const stream = await engine.chat.completions.create(opts);
  let full = "";
  for await (const chunk of stream) {
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

  async classify(jd, labels, onDelta) {
    const full = await streamChat({
      system: PROMPTS.CLASSIFY_SYSTEM,
      user: PROMPTS.classifyUser(jd, labels),
      schema: PROMPTS.classifySchema(labels),
      onDelta: (delta) => onDelta?.(delta)
    });
    const obj = JSON.parse(full);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  async rewriteStreaming(resumeMd, jd, keywords, onUpdate) {
    return streamChat({
      system: PROMPTS.REWRITE_SYSTEM,
      user: PROMPTS.rewriteUser(resumeMd, jd, keywords),
      onDelta: (_delta, full) => onUpdate?.(full)
    });
  },

  destroyAll() {
    // WebLLM keeps a single engine; nothing to destroy between calls.
  }
};

window.dispatchEvent(new Event("model-ready-to-warm"));
