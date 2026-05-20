// Prompt definitions and JSON schemas only — no model implementation.

const CLASSIFY_SYSTEM =
`You classify a job description into ONE label from a provided list, and extract keywords.
Output JSON matching the schema. No prose, no markdown fences.`;

const REWRITE_BULLETS_SYSTEM =
`You tailor resume bullets to a job description. You will receive an ARRAY of original bullets
and must return an ARRAY of the same length with tailored versions.

HARD RULES:
- Output array length MUST equal input array length. One tailored bullet per original.
- NEVER fabricate. Do not introduce skills, tools, technologies, employers, dates, or numbers
  that are not in the original bullet. You MAY use JD keywords ONLY if they describe the same
  thing the original already mentions (synonym substitution).
- You MAY rephrase, reorder words, and tighten language. Preserve all numeric metrics exactly.
- If a bullet is already well-aligned with the JD, return it unchanged.
- Output JSON: {"tailored": ["bullet1", "bullet2", ...]}`;

function classifyUser(jd, labels) {
  return `Labels: ${labels.join(", ")}
Return JSON {"label": "...", "confidence": 0..1, "keywords": ["k1",...]}

Job description:
${jd.slice(0, 4000)}`;
}

function rewriteBulletsUser({ jd, keywords, sectionTitle, subheading, bullets }) {
  return `Section: ${sectionTitle}${subheading ? "\n" + subheading : ""}
Target JD keywords (use only as synonyms for things already present): ${keywords.join(", ")}

Job description (for tone/terminology only):
${jd.slice(0, 1500)}

Original bullets (rewrite each, preserve all numbers exactly, output array of same length):
${JSON.stringify(bullets.map(b => b.original), null, 2)}`;
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

function rewriteBulletsSchema(n) {
  return {
    type: "object",
    required: ["tailored"],
    additionalProperties: false,
    properties: {
      tailored: { type: "array", items: { type: "string" }, minItems: n, maxItems: n }
    }
  };
}

// Fit gap: keywords from JD not present in resume text. Pure string ops, no model needed.
function fitGap(jdKeywords, resumeText) {
  const haystack = resumeText.toLowerCase();
  const missing = [];
  const present = [];
  for (const kw of jdKeywords) {
    const needle = kw.toLowerCase().trim();
    if (!needle) continue;
    if (haystack.includes(needle)) present.push(kw);
    else missing.push(kw);
  }
  return { present, missing, coverage: present.length / Math.max(1, jdKeywords.length) };
}

window.PROMPTS = {
  CLASSIFY_SYSTEM, REWRITE_BULLETS_SYSTEM,
  classifyUser, rewriteBulletsUser,
  classifySchema, rewriteBulletsSchema,
  fitGap
};
