// Gemini Nano backend (Chrome built-in Prompt API).

// Sampling profiles. Deterministic for JSON classification/qual; mildly creative for rewrite.
const SAMPLING = {
  deterministic: { temperature: 0, topK: 1 },
  rewrite: { temperature: 0.2, topK: 3 }
};

const _sessions = new Map();

function sessionKey(systemPrompt, sampling) {
  return systemPrompt + "|t=" + sampling.temperature + "|k=" + sampling.topK;
}

async function getSession(systemPrompt, sampling = SAMPLING.deterministic) {
  const key = sessionKey(systemPrompt, sampling);
  if (_sessions.has(key)) return _sessions.get(key);
  const s = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: systemPrompt }],
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    temperature: sampling.temperature,
    topK: sampling.topK
  });
  _sessions.set(key, s);
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

  // Build the two deterministic sessions eagerly so the first user click skips session-init latency.
  async preloadSessions() {
    try {
      await Promise.all([
        getSession(PROMPTS.CLASSIFY_SYSTEM),
        getSession(PROMPTS.QUAL_CHECK_SYSTEM)
      ]);
    } catch { /* model not ready yet — preload is best-effort */ }
  },

  async classify(jd, labels) {
    const s = await getSession(PROMPTS.CLASSIFY_SYSTEM);
    const raw = await s.prompt(PROMPTS.classifyUser(jd, labels), {
      responseConstraint: PROMPTS.classifySchema(labels),
      outputLanguage: "en"
    });
    const obj = JSON.parse(raw);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  async checkQualification(jd, resumeText) {
    const s = await getSession(PROMPTS.QUAL_CHECK_SYSTEM);
    const raw = await s.prompt(PROMPTS.qualCheckUser(jd, resumeText), {
      responseConstraint: PROMPTS.qualCheckSchema(),
      outputLanguage: "en"
    });
    return JSON.parse(raw);
  },

  async rewriteBullets({ jd, keywords, sectionTitle, subheading, bullets, onProgress }) {
    const n = bullets.length;
    if (n === 0) return [];

    const attempt = async (extra) => {
      const sys = PROMPTS.REWRITE_BULLETS_SYSTEM + (extra ? "\n\nADDITIONAL: " + extra : "");
      const s = await LanguageModel.create({
        initialPrompts: [{ role: "system", content: sys }],
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        temperature: SAMPLING.rewrite.temperature,
        topK: SAMPLING.rewrite.topK
      });
      try {
        const stream = s.promptStreaming(
          PROMPTS.rewriteBulletsUser({ jd, keywords, sectionTitle, subheading, bullets }),
          { responseConstraint: PROMPTS.rewriteBulletsSchema(n), outputLanguage: "en" }
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
