// Word-level diff via LCS. Returns array of {type: 'same'|'add'|'del', value}.
// Whitespace is kept as separate tokens so output is reconstructable.

function tokenize(s) {
  return s.match(/\S+|\s+/g) || [];
}

function wordDiff(a, b) {
  const A = tokenize(a), B = tokenize(b);
  const m = A.length, n = B.length;

  // LCS DP table
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = A[i - 1] === B[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const out = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) { out.push({ type: "same", value: A[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { out.push({ type: "del", value: A[i - 1] }); i--; }
    else { out.push({ type: "add", value: B[j - 1] }); j--; }
  }
  while (i > 0) { out.push({ type: "del", value: A[i - 1] }); i--; }
  while (j > 0) { out.push({ type: "add", value: B[j - 1] }); j--; }
  out.reverse();

  // Coalesce neighbors of the same type
  const merged = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === t.type) last.value += t.value;
    else merged.push({ ...t });
  }
  return merged;
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderDiffHTML(original, rewritten) {
  if (!rewritten || rewritten === original) {
    return `<span class="diff-same">${escapeHTML(original)}</span>`;
  }
  return wordDiff(original, rewritten).map(part => {
    const v = escapeHTML(part.value);
    if (part.type === "same") return `<span class="diff-same">${v}</span>`;
    if (part.type === "add")  return `<span class="diff-add">${v}</span>`;
    return `<span class="diff-del">${v}</span>`;
  }).join("");
}

// Classify a single added token's provenance: did it come from the original,
// from a JD keyword (allowed synonym), or did the model invent it?
function classifyProvenance(token, originalLower, jdKeywords) {
  const t = token.toLowerCase().replace(/[.,!?;:]+$/g, "");
  if (t.length < 3) return "common";
  if (originalLower.includes(t)) return "original";
  if (originalLower.includes(t.replace(/s$/, ""))) return "original";
  if (originalLower.includes(t.replace(/ed$/, ""))) return "original";
  if (originalLower.includes(t.replace(/ing$/, ""))) return "original";
  for (const kw of jdKeywords || []) {
    const k = kw.toLowerCase();
    if (k.includes(t) || t.includes(k)) return "jd";
  }
  if (/^[a-z]+$/.test(token) && !/[A-Z0-9./-]/.test(token)) return "common";
  return "model";
}

const PROV_LABEL = {
  original: "from original resume",
  jd: "from JD keyword (allowed synonym)",
  common: "common word",
  model: "model-introduced — verify"
};

function renderDiffSideBySide(original, rewritten, jdKeywords) {
  if (!rewritten || rewritten === original) {
    const safe = escapeHTML(original || "");
    return { leftHTML: safe, rightHTML: safe };
  }
  const parts = wordDiff(original, rewritten);
  const originalLower = original.toLowerCase();
  let left = "", right = "";
  for (const p of parts) {
    const v = escapeHTML(p.value);
    const isWS = /^\s+$/.test(p.value);
    if (p.type === "same") { left += v; right += v; }
    else if (p.type === "del") { left += isWS ? v : `<span class="diff-del">${v}</span>`; }
    else if (p.type === "add") {
      if (isWS) right += v;
      else {
        const prov = classifyProvenance(p.value, originalLower, jdKeywords);
        right += `<span class="diff-add prov-${prov}" title="${PROV_LABEL[prov]}">${v}</span>`;
      }
    }
  }
  return { leftHTML: left, rightHTML: right };
}

window.DIFF = { wordDiff, renderDiffHTML, renderDiffSideBySide, classifyProvenance };
