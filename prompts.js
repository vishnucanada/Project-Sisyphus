// Prompt definitions only — no model implementation.
// Backends live in model-gemini.js and model-webllm.js and both expose window.MODEL
// with the same surface: available(), warm(), classify(), rewriteStreaming(), destroyAll().

const CLASSIFY_SYSTEM =
`You classify job descriptions into ONE label from a provided list.
Also extract up to 10 high-signal keywords (skills, tools, domains) from the JD, lowercase, no duplicates.
You MUST output valid JSON matching the schema. No prose, no markdown fences.`;

const REWRITE_SYSTEM =
`You tailor a resume to a specific job by editing existing bullets to surface relevant keywords.
Rules:
- NEVER fabricate experience, employers, dates, numbers, or skills not in the original.
- You MAY rephrase, reorder, and substitute synonyms to match JD terminology.
- Keep the section structure of the input resume.
- Output ONLY the full tailored resume in markdown. No preamble, no explanation.`;

function classifyUser(jd, labels) {
  return `Labels: ${labels.join(", ")}
Job description:
${jd.slice(0, 4000)}

Return JSON: {"label": "<one of the labels>", "confidence": 0-1, "keywords": ["k1", ...]}`;
}

function rewriteUser(resumeMd, jd, keywords) {
  return `Target keywords (incorporate naturally where truthful): ${keywords.join(", ")}
Job description:
${jd.slice(0, 2500)}

Original resume:
${resumeMd}`;
}

function classifySchema(labels) {
  return {
    type: "object",
    required: ["label", "keywords"],
    additionalProperties: false,
    properties: {
      label: { type: "string", enum: labels },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      keywords: { type: "array", items: { type: "string" }, maxItems: 10 }
    }
  };
}

// Expose globally for non-module scripts.
window.PROMPTS = { CLASSIFY_SYSTEM, REWRITE_SYSTEM, classifyUser, rewriteUser, classifySchema };
