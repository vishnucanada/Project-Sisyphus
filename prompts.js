// Prompts kept small to fit Gemini Nano's context. Swap MODEL.* with a cloud
// API (Claude, OpenAI) if quality matters more than latency/privacy.

const CLASSIFY_SYSTEM = `You classify job descriptions into one of a known set of resume variant labels.
Output STRICT JSON only: {"label": "<one of the labels>", "confidence": 0-1, "keywords": ["k1", "k2", ...]}.
Pick up to 12 high-signal keywords (skills, tools, domains) from the JD, lowercase, no duplicates.
No prose, no markdown fences.`;

function classifyUserPrompt(jdText, labels) {
  return `Labels: ${JSON.stringify(labels)}
Job description:
"""
${jdText.slice(0, 6000)}
"""`;
}

const REWRITE_SYSTEM = `You tailor a resume to a specific job description by editing existing bullets to surface relevant keywords and outcomes.
Rules:
- Do NOT fabricate experience, employers, dates, numbers, or skills not present in the original.
- You MAY rephrase, reorder bullets, and substitute synonyms to match JD terminology.
- Keep the same overall structure and section headings as the input resume.
- Prefer concrete, quantified bullets. Tighten verbose lines.
- Output the full tailored resume as markdown. No preamble, no explanation.`;

function rewriteUserPrompt(resumeMd, jdText, keywords) {
  return `Target keywords (incorporate naturally where truthful): ${keywords.join(", ")}

Job description:
"""
${jdText.slice(0, 4000)}
"""

Original resume:
"""
${resumeMd}
"""`;
}

// Thin wrapper around the built-in Prompt API. Falls back gracefully.
const MODEL = {
  async available() {
    if (!("LanguageModel" in self)) return "no";
    const a = await LanguageModel.availability();
    return a; // "available" | "downloadable" | "downloading" | "unavailable"
  },
  async session(systemPrompt) {
    return LanguageModel.create({
      initialPrompts: [{ role: "system", content: systemPrompt }]
    });
  },
  async classify(jdText, labels) {
    const s = await this.session(CLASSIFY_SYSTEM);
    const raw = await s.prompt(classifyUserPrompt(jdText, labels));
    s.destroy?.();
    return JSON.parse(raw.trim().replace(/^```json|```$/g, ""));
  },
  async rewrite(resumeMd, jdText, keywords) {
    const s = await this.session(REWRITE_SYSTEM);
    const out = await s.prompt(rewriteUserPrompt(resumeMd, jdText, keywords));
    s.destroy?.();
    return out.trim();
  }
};
