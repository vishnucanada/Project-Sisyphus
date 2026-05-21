const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = 1e9; };

const GOOD_ENOUGH_THRESHOLD = 0.70;

let CURRENT_BLOCKS = null;
let CURRENT_CONTEXT = null;

$("variants").value = JSON.stringify(window.RESUMES, null, 2);
for (const [key, jd] of Object.entries(window.SAMPLE_JDS)) {
  const opt = document.createElement("option"); opt.value = key; opt.textContent = key;
  $("sampleJd").appendChild(opt);
}
$("sampleJd").addEventListener("change", () => { if ($("sampleJd").value) $("jd").value = window.SAMPLE_JDS[$("sampleJd").value]; });
$("jd").value = window.SAMPLE_JDS.swe_role;

async function waitFor(key, ms = 8000) {
  const t = performance.now();
  while (!window[key]) {
    if (performance.now() - t > ms) throw new Error(`${key} never loaded`);
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
  $("embDiag").textContent = "Emb: loading";
  await EMBEDDINGS.warm((p) => { if (p?.progress != null) $("embDiag").textContent = `Emb: ${Math.round(p.progress)}%`; })
    .catch(e => log("emb warm failed: " + e.message));
  $("embDiag").textContent = "Emb: ready";
  log("ready.");
})();

const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

function renderScores(scores) {
  $("scores").innerHTML = scores.map((s, i) =>
    `<span class="score-pill ${i === 0 ? "top" : ""}">${s.label}: ${s.score.toFixed(3)}</span>`).join("");
}

function renderQual(q) {
  const cls = q.verdict === "qualified" ? "ok" : q.verdict === "stretch" ? "warn" : "err";
  $("qualBanner").innerHTML = `
    <div class="banner ${cls}">
      <strong>${q.verdict.toUpperCase()}</strong> — ${q.reasoning}
      ${q.missing?.length ? `<br><small>Missing: ${q.missing.join("; ")}</small>` : ""}
    </div>`;
}

function renderFitGap(gap) {
  $("fitgap").innerHTML = `
    <div class="coverage">Coverage: ${Math.round(gap.coverage * 100)}%</div>
    <div class="kwgroup">${gap.present.map(k => `<span class="kw present">${k}</span>`).join("")}${gap.missing.map(k => `<span class="kw missing">${k}</span>`).join("")}</div>`;
}

function renderBulletRow(b, jdKeywords) {
  const row = document.createElement("div"); row.className = "diffrow";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = b.accepted;
  cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

  const left = document.createElement("div"); left.className = "diff-side left";
  const right = document.createElement("div"); right.className = "diff-side right";
  right.title = "Click to edit";

  const renderSides = () => {
    const s = DIFF.renderDiffSideBySide(b.original, b.tailored ?? b.original, jdKeywords);
    left.innerHTML = s.leftHTML; right.innerHTML = s.rightHTML;
    if (b.tailored && b.tailored !== b.original) {
      const v = VALIDATOR.validateBullet({ original: b.original, rewrite: b.tailored, allowedExtras: jdKeywords });
      if (!v.ok) {
        const flag = document.createElement("span");
        flag.className = "badge-flag"; flag.textContent = "flagged: " + v.reasonText;
        right.appendChild(flag);
      }
      const q = VALIDATOR.checkQuantification(b.original, b.tailored);
      if (q) {
        const w = document.createElement("span");
        w.className = "badge-warn"; w.textContent = q.message;
        right.appendChild(w);
      }
    }
  };

  right.addEventListener("click", () => {
    const ta = document.createElement("textarea");
    ta.value = b.tailored ?? b.original;
    ta.rows = Math.max(2, Math.ceil(ta.value.length / 60));
    right.innerHTML = ""; right.appendChild(ta); ta.focus();
    ta.addEventListener("blur", () => { b.tailored = ta.value.trim(); renderSides(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.blur(); }
      if (e.key === "Escape") { ta.value = b.tailored ?? b.original; ta.blur(); }
    });
  });

  renderSides();
  row.append(cb, left, right);
  return row;
}

function renderDiff(blocks, jdKeywords) {
  const root = $("diff"); root.innerHTML = "";
  let headerShown = false;
  for (const sec of RESUME_PARSER.groupBulletsBySection(blocks)) {
    if (sec.protected) continue;
    const h = document.createElement("div"); h.className = "section-title";
    h.textContent = sec.section + (sec.subheading ? " — " + sec.subheading.replace(/\*\*/g, "") : "");
    root.appendChild(h);
    if (!headerShown) {
      const hdr = document.createElement("div"); hdr.className = "diffhdr";
      hdr.innerHTML = `<div></div><div>Original</div><div>Tailored</div>`;
      root.appendChild(hdr);
      headerShown = true;
    }
    for (const b of sec.bullets) root.appendChild(renderBulletRow(b, jdKeywords));
  }
}

async function rankBulletsInPlace(blocks, jd) {
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    if (sec.protected || sec.bullets.length < 2) continue;
    const ranked = await EMBEDDINGS.rankBulletsByJD(sec.bullets.map(b => b.original), jd);
    const permutation = ranked.map(r => r.i);
    RESUME_PARSER.reorderSectionBullets(blocks, sec.bullets, permutation);
    log(`  reordered ${sec.section}${sec.subheading ? " / " + sec.subheading.replace(/\*\*/g, "") : ""} by JD relevance`);
  }
}

async function doRewrite(blocks, ctx) {
  log("ranking bullets by JD relevance…");
  await rankBulletsInPlace(blocks, ctx.jd);
  renderDiff(blocks, ctx.keywords); // show new order before rewrite

  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  log(`parsed ${blocks.filter(b => b.type === "bullet").length} bullets, ${sections.length} sections`);
  const t0 = performance.now();
  for (const sec of sections) {
    if (sec.protected) { sec.bullets.forEach(b => { b.tailored = b.original; }); continue; }
    log(`rewriting: ${sec.section}${sec.subheading ? " / " + sec.subheading.replace(/\*\*/g, "") : ""} (${sec.bullets.length})`);
    try {
      const tailored = await MODEL.rewriteBullets({
        jd: ctx.jd, keywords: ctx.keywords,
        sectionTitle: sec.section, subheading: sec.subheading,
        bullets: sec.bullets
      });
      sec.bullets.forEach((b, i) => { b.tailored = tailored[i] ?? b.original; });
      renderDiff(blocks, ctx.keywords);
    } catch (e) {
      log("  section failed: " + e.message);
      sec.bullets.forEach(b => { b.tailored = b.original; });
    }
  }
  log(`rewrite total: ${(performance.now() - t0).toFixed(0)}ms`);
  CURRENT_BLOCKS = blocks;
  show("diffCard");
}

async function runFlow({ matchOnly }) {
  $("timings").textContent = ""; $("log").textContent = "";
  ["matchCard", "fitCard", "diffCard"].forEach(hide);
  $("diff").innerHTML = ""; $("goodEnough").innerHTML = "";
  CURRENT_BLOCKS = null; CURRENT_CONTEXT = null;

  const variants = JSON.parse($("variants").value);
  const jd = $("jd").value.trim();
  if (!jd) return log("paste a JD first.");

  let t0 = performance.now();
  log("matching variant (embeddings)…");
  const match = await EMBEDDINGS.matchVariant(jd, variants);
  const matchMs = (performance.now() - t0).toFixed(0);
  log(`match → ${match.label} (conf ${match.confidence.toFixed(2)}) in ${matchMs}ms`);
  $("variantLabel").textContent = match.label;
  $("confidence").textContent = `${Math.round(match.confidence * 100)}% confident`;
  renderScores(match.scores);
  show("matchCard");

  const resumeText = variants[match.label];

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
      log("STOP: underqualified. Tick 'Override qual block' to proceed.");
      $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms (BLOCKED)`;
      return;
    }
  }

  log("extracting JD keywords…");
  t0 = performance.now();
  const cls = await MODEL.classify(jd, Object.keys(variants));
  const kwMs = (performance.now() - t0).toFixed(0);
  log(`keywords (${kwMs}ms): ${cls.keywords.join(", ")}`);
  const gap = PROMPTS.fitGap(cls.keywords, resumeText);
  renderFitGap(gap);
  show("fitCard");

  CURRENT_CONTEXT = { jd, keywords: cls.keywords, match, resumeText };

  if (matchOnly) {
    $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms · kw ${kwMs}ms`;
    log("Check-fit done. Click 'Analyze & tailor' to rewrite.");
    return;
  }

  if (gap.coverage >= GOOD_ENOUGH_THRESHOLD && !$("forceRewriteBtn").checked) {
    $("goodEnough").innerHTML = `
      <div class="banner ok">
        <strong>Resume already well-aligned (${Math.round(gap.coverage * 100)}% keyword coverage).</strong>
        Rewrite is optional — your original is a strong fit for this JD.
        <div style="margin-top: 8px"><button id="rewriteAnywayBtn">Rewrite anyway</button></div>
      </div>`;
    $("rewriteAnywayBtn").addEventListener("click", async () => {
      $("goodEnough").innerHTML = "<em>Rewriting…</em>";
      const blocks = RESUME_PARSER.parseResume(resumeText);
      await doRewrite(blocks, CURRENT_CONTEXT);
      $("goodEnough").innerHTML = "";
    });
    CURRENT_BLOCKS = RESUME_PARSER.parseResume(resumeText);
    renderDiff(CURRENT_BLOCKS, cls.keywords);
    show("diffCard");
    $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms · kw ${kwMs}ms (no rewrite needed)`;
    return;
  }

  const tRewrite = performance.now();
  const blocks = RESUME_PARSER.parseResume(resumeText);
  await doRewrite(blocks, CURRENT_CONTEXT);
  const rewriteMs = (performance.now() - tRewrite).toFixed(0);
  $("timings").textContent = `match ${matchMs}ms · qual ${qualMs}ms · kw ${kwMs}ms · rewrite ${rewriteMs}ms`;
}

$("runBtn").addEventListener("click", () => runFlow({ matchOnly: false }).catch(e => log("ERR: " + e.message)));
$("matchBtn").addEventListener("click", () => runFlow({ matchOnly: true }).catch(e => log("ERR: " + e.message)));

$("previewBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return log("nothing to preview — run analyze first");
  PREVIEW.openPreview(CURRENT_BLOCKS, `Resume — ${CURRENT_CONTEXT?.match?.label || "preview"}`);
});

$("copyBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return log("nothing to copy — run analyze first");
  navigator.clipboard.writeText(RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS));
  log("copied tailored resume text to clipboard.");
});

$("docxBtn").addEventListener("click", async () => {
  if (!CURRENT_BLOCKS) return log("nothing to export — run analyze first");
  if (!window.DOCX_EXPORT) return log("docx not loaded yet");
  await DOCX_EXPORT.downloadDocx(CURRENT_BLOCKS, `vishnu_${CURRENT_CONTEXT?.match?.label || "tailored"}.docx`);
  log("downloaded .docx");
});
