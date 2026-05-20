// Gemini Nano backend (Chrome built-in Prompt API).
// Requires chrome://flags/#prompt-api-for-gemini-nano AND #optimization-guide-on-device-model.

const _sessions = new Map();
async function getSession(systemPrompt, monitor) {
  if (_sessions.has(systemPrompt)) return _sessions.get(systemPrompt);
  const s = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: systemPrompt }],
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor
  });
  _sessions.set(systemPrompt, s);
  return s;
}

const downloadMonitor = (onProgress) =>
  (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded));

window.MODEL = {
  name: "gemini-nano",

  async available() {
    if (!("LanguageModel" in self)) return "no-api";
    try { return await LanguageModel.availability(); } catch { return "error"; }
  },

  async warm(onProgress) {
    const s = await LanguageModel.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      monitor: downloadMonitor((p) => onProgress?.(p))
    });
    s.destroy?.();
  },

  async classify(jd, labels, onDelta) {
    const s = await getSession(PROMPTS.CLASSIFY_SYSTEM);
    const stream = s.promptStreaming(PROMPTS.classifyUser(jd, labels), {
      responseConstraint: PROMPTS.classifySchema(labels)
    });
    let full = "";
    for await (const chunk of stream) { full += chunk; onDelta?.(chunk); }
    const obj = JSON.parse(full);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  async rewriteStreaming(resumeMd, jd, keywords, onUpdate) {
    const s = await getSession(PROMPTS.REWRITE_SYSTEM);
    const stream = s.promptStreaming(PROMPTS.rewriteUser(resumeMd, jd, keywords));
    let full = "";
    for await (const chunk of stream) { full += chunk; onUpdate?.(full); }
    return full;
  },

  destroyAll() {
    for (const s of _sessions.values()) s.destroy?.();
    _sessions.clear();
  }
};
