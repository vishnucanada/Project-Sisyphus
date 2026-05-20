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

window.DIFF = { wordDiff, renderDiffHTML };
