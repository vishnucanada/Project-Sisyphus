// Detects fabrication in a rewritten bullet relative to its original.
// Two checks:
//  1. Every NUMBER in the rewrite must appear in the original (no invented metrics).
//  2. Every PROPER-NOUN / TECH-TOKEN in the rewrite must appear in the original
//     OR in the JD keywords list (model is allowed to introduce JD keywords iff
//     they're plausibly synonyms — caller chooses how to treat).
//
// Returns { ok, violations: [{kind, token}], reasonText }.

const STOP = new Set([
  "the","a","an","and","or","but","of","for","to","in","on","at","with","by","from",
  "as","is","was","are","were","be","been","being","this","that","these","those",
  "it","its","i","we","you","they","he","she","me","us","them","my","our","your",
  "their","his","her","not","no","yes","do","does","did","will","would","can",
  "could","should","may","might","must","shall","have","has","had","get","got",
  "go","went","gone","using","used","via","over","through","into","upon",
  "developed","built","designed","implemented","created","worked","led","drove",
  "delivered","shipped","launched","applied","achieved","reduced","improved",
  "system","systems","data","model","models","ml","ai","based","real","time",
  "while","when","where","which","what","who","how","why","than","then","also",
  "more","most","less","least","new","novel","prior","key","main","across","under"
]);

function tokenize(text) {
  // Split on whitespace + punctuation that isn't part of a token. Keep hyphens, dots, slashes
  // inside tokens (PyTorch, scikit-learn, AWS/Azure, GitLab CI/CD).
  return text.split(/[\s,;:()[\]{}"'`]+/).filter(Boolean);
}

function normalize(tok) {
  return tok.toLowerCase().replace(/[.,!?]+$/g, "");
}

function isStopOrCommon(tok) {
  const n = normalize(tok);
  if (STOP.has(n)) return true;
  if (n.length <= 2) return true;
  if (/^\d+$/.test(n)) return false; // numbers handled separately
  // lowercase common-english word (no internal caps, no digits, no symbols)
  if (!/[A-Z0-9./-]/.test(tok) && /^[a-z]+$/.test(tok)) return true;
  return false;
}

function extractNumbers(text) {
  return [...text.matchAll(/\d+(?:\.\d+)?%?/g)].map(m => m[0]);
}

function extractTechTokens(text) {
  return tokenize(text).filter(t => !isStopOrCommon(t));
}

// Build a normalized lookup of tokens present in the source (original bullet + optional extra context).
function sourceTokenSet(...sources) {
  const set = new Set();
  for (const src of sources) {
    if (!src) continue;
    for (const t of tokenize(src)) set.add(normalize(t));
  }
  return set;
}

function validateBullet({ original, rewrite, allowedExtras = [] }) {
  const violations = [];

  // Numbers
  const origNums = new Set(extractNumbers(original));
  for (const n of extractNumbers(rewrite)) {
    if (!origNums.has(n)) violations.push({ kind: "invented-number", token: n });
  }

  // Tech tokens
  const allowed = sourceTokenSet(original, allowedExtras.join(" "));
  for (const t of extractTechTokens(rewrite)) {
    const n = normalize(t);
    if (allowed.has(n)) continue;
    // tolerate trivial morphological variants (plural / past tense)
    if (allowed.has(n.replace(/s$/, ""))) continue;
    if (allowed.has(n.replace(/ed$/, ""))) continue;
    if (allowed.has(n.replace(/ing$/, ""))) continue;
    violations.push({ kind: "invented-term", token: t });
  }

  return {
    ok: violations.length === 0,
    violations,
    reasonText: violations.length
      ? violations.map(v => `${v.kind}: "${v.token}"`).join("; ")
      : "clean"
  };
}

function validateAll(bullets, jdKeywords) {
  return bullets.map(b => ({
    index: b.index,
    ...validateBullet({
      original: b.original,
      rewrite: b.tailored ?? "",
      allowedExtras: jdKeywords
    })
  }));
}

window.VALIDATOR = { validateBullet, validateAll, extractNumbers, extractTechTokens };
