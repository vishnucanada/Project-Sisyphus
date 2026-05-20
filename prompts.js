// Prompts kept tight to fit Gemini Nano's context window and minimize latency.
// Streaming is used everywhere so the UI can show progress.

const CLASSIFY_SYSTEM =
`Classify the job description into ONE label from the provided list.
Also return up to 10 high-signal keywords (skills, tools, domains) from the JD, lowercase.`;

const REWRITE_SYSTEM =
`You tailor a resume to a specific job by editing existing bullets to surface relevant keywords.
Rules:
- NEVER fabricate experience, employers, dates, numbers, or skills not in the original.
- You MAY rephrase, reorder, and substitute synonyms to match JD terminology.
- Keep the section structure of the input resume.
- Output ONLY the full tailored resume in markdown. No preamble.`;

function classifyUser(jd, labels) {
  return `Labels: ${labels.join(", ")}
Job description:
${jd.slice(0, 4000)}`;
}

function rewriteUser(resumeMd, jd, keywords) {
  return `Target keywords: ${keywords.join(", ")}
Job description:
${jd.slice(0, 2500)}

Original resume:
${resumeMd}`;
}

// Cache one session per system prompt — avoids re-paying setup cost on each call.
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

function downloadMonitor(onProgress) {
  return (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded));
}

const MODEL = {
  async available() {
    if (!("LanguageModel" in self)) return "no-api";
    try { return await LanguageModel.availability(); }
    catch { return "error"; }
  },

  async classify(jd, labels, onDelta) {
    const session = await getSession(CLASSIFY_SYSTEM);
    const stream = session.promptStreaming(classifyUser(jd, labels), {
      responseConstraint: {
        type: "object",
        required: ["label", "keywords"],
        additionalProperties: false,
        properties: {
          label: { type: "string", enum: labels },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          keywords: { type: "array", items: { type: "string" }, maxItems: 10 }
        }
      }
    });
    let full = "";
    for await (const chunk of stream) {
      full += chunk;
      onDelta?.(chunk);
    }
    const obj = JSON.parse(full);
    if (typeof obj.confidence !== "number") obj.confidence = 0.5;
    return obj;
  },

  async rewriteStreaming(resumeMd, jd, keywords, onUpdate) {
    const session = await getSession(REWRITE_SYSTEM);
    const stream = session.promptStreaming(rewriteUser(resumeMd, jd, keywords));
    let full = "";
    for await (const chunk of stream) {
      full += chunk;
      onUpdate?.(full);
    }
    return full;
  },

  // Convenience: pre-warm the model so the first user click isn't slow.
  // Triggers the ~2GB Gemini Nano weights download on first run.
  async warm(onDownloadProgress) {
    const s = await LanguageModel.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      monitor: downloadMonitor(onDownloadProgress)
    });
    s.destroy?.();
  },

  // Free GPU memory if needed.
  destroyAll() {
    for (const s of _sessions.values()) s.destroy?.();
    _sessions.clear();
  }
};
