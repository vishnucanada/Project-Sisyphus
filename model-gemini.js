// Gemini Nano backend (Chrome built-in Prompt API).

const _sessions = new Map();
async function getSession(systemPrompt) {
  if (_sessions.has(systemPrompt)) return _sessions.get(systemPrompt);
  const s = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: systemPrompt }],
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
  });
  _sessions.set(systemPrompt, s);
  return s;
}

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
      monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded))
    });
    s.destroy?.();
  },

  async classify(jd, labels) {
    const s = await getSession(PROMPTS.CLASSIFY_SYSTEM);
    const raw = await s.prompt(PROMPTS.classifyUser(jd, labels), {
      responseConstraint: PROMPTS.classifySchema(labels)
    });
    const obj = JSON.parse(raw);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  async rewriteBullets({ jd, keywords, sectionTitle, subheading, bullets, onProgress }) {
    const n = bullets.length;
    if (n === 0) return [];

    const attempt = async (extra) => {
      const sys = PROMPTS.REWRITE_BULLETS_SYSTEM + (extra ? "\n\nADDITIONAL: " + extra : "");
      const s = await LanguageModel.create({
        initialPrompts: [{ role: "system", content: sys }],
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      try {
        const stream = s.promptStreaming(
          PROMPTS.rewriteBulletsUser({ jd, keywords, sectionTitle, subheading, bullets }),
          { responseConstraint: PROMPTS.rewriteBulletsSchema(n) }
        );
        let full = "";
        for await (const chunk of stream) { full += chunk; onProgress?.(full); }
        return JSON.parse(full).tailored;
      } finally { s.destroy?.(); }
    };

    let tailored = await attempt();
    const checks = bullets.map((b, i) => VALIDATOR.validateBullet({
      original: b.original, rewrite: tailored[i] ?? "", allowedExtras: keywords
    }));
    const bad = checks.filter(c => !c.ok);
    if (bad.length) {
      const offenders = bad.flatMap(c => c.violations.map(v => v.token)).slice(0, 8);
      onProgress?.(`(retry — flagged: ${offenders.join(", ")})`);
      tailored = await attempt(`Your previous output added: ${offenders.join(", ")}. Do NOT introduce these. Stay within the original bullets.`);
    }
    return tailored;
  },

  destroyAll() {
    for (const s of _sessions.values()) s.destroy?.();
    _sessions.clear();
  }
};
