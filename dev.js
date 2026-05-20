const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = 1e9; };

let CURRENT_BLOCKS = null;
let CURRENT_KEYWORDS = [];

$("variants").value = JSON.stringify(window.RESUMES, null, 2);
for (const [key, jd] of Object.entries(window.SAMPLE_JDS)) {
  const opt = document.createElement("option");
  opt.value = key; opt.textContent = key;
  $("sampleJd").appendChild(opt);
}
$("sampleJd").addEventListener("change", () => { if ($("sampleJd").value) $("jd").value = window.SAMPLE_JDS[$("sampleJd").value]; });
$("jd").value = window.SAMPLE_JDS.ml_role;

async function waitFor(key, timeoutMs = 8000) {
  const t = performance.now();
  while (!window[key]) {
    if (performance.now() - t > timeoutMs) throw new Error(`${key} never loaded`);
    await new Promise(r => setTimeout(r, 50));
  }
}

(async () => {
  try { await Promise.all([waitFor("MODEL"), waitFor("EMBEDDINGS")]); }
  catch (e) { log("init: " + e.message); return; }
  log(`backend = ${MODEL.name}`);
  const a = await MODEL.available();
  $("diag").textContent = `LLM: ${a}`;
  if (a === "downloadable" || a === "downloading") {
    log("warming LLM…");
    await MODEL.warm((loaded, text) => {
      $("diag").textContent = `LLM: ${Math.round(loaded * 100)}%`;
      if (text) log("  " + text);
    }).catch(e => log("LLM warm failed: " + e.message));
    $("diag").textContent = "LLM: available";
  }
  log("warming embedding model…");
  $("embDiag").textContent = "emb: loading";
  await EMBEDDINGS.warm((p) => { if (p?.progress != null) $("embDiag").textContent = `emb: ${Math.round(p.progress)}%`; })
    .catch(e => log("emb warm failed: " + e.message));
  $("embDiag").textContent = "emb: ready";
  log("ready.");
})();

function renderScores(scores) {
  $("scores").innerHTML = scores.map(s =>
    `<span class="pill">${s.label}: ${s.score.toFixed(3)}</span>`).join(" ");
}

function renderFitGap(gap) {
  $("fitgap").innerHTML = `
    <p>Coverage: <strong>${Math.round(gap.coverage * 100)}%</strong> of JD keywords found in resume.</p>
    <div class="row">
      <div><strong>Present in resume</strong><ul class="present">${gap.present.map(k => `<li>${k}</li>`).join("")}</ul></div>
      <div><strong>Missing (honest gaps)</strong><ul class="missing">${gap.missing.map(k => `<li>${k}</li>`).join("")}</ul></div>
    </div>`;
}

function renderQual(q) {
  const cls = "qual-" + q.verdict;
  $("qualBanner").innerHTML = `
    <div class="qual-banner ${cls}">
      <strong>${q.verdict.toUpperCase()}</strong> — ${q.reasoning}
      ${q.missing?.length ? `<br><em>Missing:</em> ${q.missing.join("; ")}` : ""}
      ${q.candidate_summary || q.role_summary ? `<br><small>${q.candidate_summary || ""}${q.candidate_summary && q.role_summary ? " · " : ""}${q.role_summary || ""}</small>` : ""}
    </div>`;
}

function renderBulletRow(b, sectionProtected, jdKeywords) {
  const row = document.createElement("div");
  row.className = "diffrow" + (sectionProtected ? " protected" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = b.accepted;
  cb.disabled = sectionProtected;
  cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

  const stack = document.createElement("div");
  const orig = document.createElement("div");
  orig.className = "orig"; orig.textContent = "original: " + b.original;
  stack.appendChild(orig);

  const tail = document.createElement("div");
  tail.className = "tail";
  tail.title = sectionProtected ? "Protected section — not modified" : "Click to edit";

  const renderTail = () => {
    if (sectionProtected || !b.tailored || b.tailored === b.original) {
      tail.innerHTML = `<span class="diff-same">${b.original.replace(/[<>&]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;" }[c]))}</span>`;
    } else {
      tail.innerHTML = DIFF.renderDiffHTML(b.original, b.tailored);
      const v = VALIDATOR.validateBullet({ original: b.original, rewrite: b.tailored, allowedExtras: jdKeywords });
      if (!v.ok) {
        const flag = document.createElement("span");
        flag.className = "badge-flag"; flag.textContent = " ⚠ " + v.reasonText;
        tail.appendChild(flag);
      }
    }
  };

  // Inline edit on click (unless protected)
  tail.addEventListener("click", () => {
    if (sectionProtected) return;
    const ta = document.createElement("textarea");
    ta.value = b.tailored ?? b.original;
    ta.rows = Math.max(2, Math.ceil(ta.value.length / 80));
    tail.innerHTML = ""; tail.appendChild(ta); ta.focus();
    const save = () => {
      b.tailored = ta.value.trim();
      renderTail();
    };
    ta.addEventListener("blur", save);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.blur(); }
      if (e.key === "Escape") { ta.value = b.tailored ?? b.original; ta.blur(); }
    });
  });

  renderTail();
  stack.appendChild(tail);
  row.append(cb, stack);
  return row;
}

function renderDiff(blocks, jdKeywords) {
  const container = $("diff"); container.innerHTML = "";
  for (const sec of RESUME_PARSER.groupBulletsBySection(blocks)) {
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = sec.section + (sec.subheading ? " — " + sec.subheading.replace(/\*\*/g, "") : "") + (sec.protected ? "  (protected)" : "");
    container.appendChild(h);
    for (const b of sec.bullets) container.appendChild(renderBulletRow(b, sec.protected, jdKeywords));
  }
}

async function runTailor({ matchOnly }) {
  $("timings").textContent = ""; $("log").textContent = "";
  $("diff").innerHTML = ""; $("fitgap").innerHTML = ""; $("qualBanner").innerHTML = "";
  CURRENT_BLOCKS = null; CURRENT_KEYWORDS = [];

  const variants = JSON.parse($("variants").value);
  const jd = $("jd").value;
  log(`jd length = ${jd.length} chars`);

  let t0 = performance.now();
  log("matching variant (embeddings)…");
  const match = await EMBEDDINGS.matchVariant(jd, variants);
  const matchMs = (performance.now() - t0).toFixed(0);
  log(`match → ${match.label} (conf ${match.confidence.toFixed(2)}) in ${matchMs}ms`);
  $("variantLabel").textContent = match.label;
  $("confidence").textContent = `confidence ${(match.confidence * 100).toFixed(0)}%`;
  renderScores(match.scores);

  const resumeText = variants[match.label];

  // QUALIFICATION GATE
  log("checking qualifications…");
  t0 = performance.now();
  let qual;
  try { qual = await MODEL.checkQualification(jd, resumeText); }
  catch (e) { log("qual check failed (continuing): " + e.message); }
  const qualMs = (performance.now() - t0).toFixed(0);
  if (qual) {
    log(`qual: ${qual.verdict} (${qualMs}ms) — ${qual.reasoning}`);
    renderQual(qual);
    if (qual.verdict === "underqualified" && !$("overrideQualBtn").checked) {
      log("STOP: underqualified for this role. Tick 'Override' to proceed anyway.");
      $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms (BLOCKED)`;
      return;
    }
  }

  log("extracting JD keywords…");
  t0 = performance.now();
  const cls = await MODEL.classify(jd, Object.keys(variants));
  CURRENT_KEYWORDS = cls.keywords;
  const kwMs = (performance.now() - t0).toFixed(0);
  log(`keywords (${kwMs}ms): ${cls.keywords.join(", ")}`);
  renderFitGap(PROMPTS.fitGap(cls.keywords, resumeText));

  if (matchOnly) { $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms · kw ${kwMs}ms`; return; }

  const blocks = RESUME_PARSER.parseResume(resumeText);
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  log(`parsed ${blocks.filter(b => b.type === "bullet").length} bullets across ${sections.length} sections.`);

  t0 = performance.now();
  for (const sec of sections) {
    if (sec.protected) {
      log(`skip section: ${sec.section} (protected)`);
      sec.bullets.forEach(b => { b.tailored = b.original; });
      renderDiff(blocks, cls.keywords);
      continue;
    }
    log(`rewriting: ${sec.section}${sec.subheading ? " / " + sec.subheading.replace(/\*\*/g, "") : ""} (${sec.bullets.length})`);
    try {
      const tailored = await MODEL.rewriteBullets({
        jd, keywords: cls.keywords,
        sectionTitle: sec.section, subheading: sec.subheading,
        bullets: sec.bullets
      });
      sec.bullets.forEach((b, i) => { b.tailored = tailored[i] ?? b.original; });
      renderDiff(blocks, cls.keywords);
    } catch (e) {
      log("  section failed: " + e.message);
      sec.bullets.forEach(b => { b.tailored = b.original; });
    }
  }
  const rewriteMs = (performance.now() - t0).toFixed(0);
  log(`rewrite done in ${rewriteMs}ms`);
  $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms · kw ${kwMs}ms · rewrite ${rewriteMs}ms`;
  CURRENT_BLOCKS = blocks;
}

$("runBtn").addEventListener("click", () => runTailor({ matchOnly: false }).catch(e => log("ERR: " + e.message)));
$("matchBtn").addEventListener("click", () => runTailor({ matchOnly: true }).catch(e => log("ERR: " + e.message)));

$("exportMdBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return log("nothing to export — run tailor first");
  navigator.clipboard.writeText(RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS));
  log("copied tailored markdown.");
});

$("exportDocxBtn").addEventListener("click", async () => {
  if (!CURRENT_BLOCKS) return log("nothing to export — run tailor first");
  if (!window.DOCX_EXPORT) return log("docx-export.js not loaded yet");
  await DOCX_EXPORT.downloadDocx(CURRENT_BLOCKS, "vishnu_tailored.docx");
  log("docx downloaded.");
});
