const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = 1e9; };

const GOOD_ENOUGH_THRESHOLD = 0.70;
let CURRENT_BLOCKS = null;
let CURRENT_META = null;
let CURRENT_CONTEXT = null;

async function loadVariants() {
  const { variants } = await chrome.storage.local.get("variants");
  return variants || window.RESUMES;
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + t.dataset.tab));
  if (t.dataset.tab === "history") renderHistory();
}));

document.querySelectorAll('input[name="jdSource"]').forEach(r => r.addEventListener("change", () => {
  $("manualBlock").hidden = r.value !== "manual" || !r.checked;
}));

async function waitFor(key, ms = 8000) {
  const t = performance.now();
  while (!window[key]) {
    if (performance.now() - t > ms) throw new Error(`${key} never loaded`);
    await new Promise(r => setTimeout(r, 50));
  }
}

async function init() {
  $("variants").value = JSON.stringify(await loadVariants(), null, 2);

  for (const key of Object.keys(window.SAMPLE_JDS || {})) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = key;
    $("sampleJd").appendChild(opt);
  }
  $("sampleJd").addEventListener("change", () => {
    if ($("sampleJd").value) $("jd").value = window.SAMPLE_JDS[$("sampleJd").value];
  });

  try { await Promise.all([waitFor("MODEL"), waitFor("EMBEDDINGS")]); }
  catch (e) { log("init: " + e.message); }

  log(`backend = ${MODEL.name}`);
  const a = await MODEL.available();
  $("diag").textContent = `LLM: ${a}`;
  if (a === "no-api") {
    status("Prompt API missing — enable chrome://flags/#prompt-api-for-gemini-nano.");
  } else if (a === "downloadable" || a === "downloading") {
    status("Warming LLM…");
    log("warming LLM…");
    try {
      await MODEL.warm((loaded) => {
        $("diag").textContent = `LLM: ${Math.round(loaded * 100)}%`;
      });
      $("diag").textContent = "LLM: available";
      status("LLM ready.");
    } catch (e) {
      log("LLM warm failed: " + e.message);
      status("LLM warm failed: " + e.message);
    }
  } else {
    status("LLM ready.");
  }

  MODEL.preloadSessions?.();

  if (window.EMBEDDINGS) {
    log("warming embedding model…");
    $("embDiag").textContent = "Emb: loading";
    try {
      await EMBEDDINGS.warm((p) => {
        if (p?.progress != null) $("embDiag").textContent = `Emb: ${Math.round(p.progress)}%`;
      });
      $("embDiag").textContent = "Emb: ready";
      log("embeddings ready.");
    } catch (e) {
      $("embDiag").textContent = "Emb: failed";
      log("emb warm failed: " + e.message);
    }
  }
}

$("saveVarsBtn").addEventListener("click", async () => {
  try {
    const parsed = JSON.parse($("variants").value);
    await chrome.storage.local.set({ variants: parsed });
    status("Variants saved.");
  } catch (e) { status("Invalid JSON: " + e.message); }
});

function tokenSim(a, b) {
  const ta = new Set(a.toLowerCase().match(/[a-z][a-z0-9+./-]{2,}/g) || []);
  const tb = new Set(b.toLowerCase().match(/[a-z][a-z0-9+./-]{2,}/g) || []);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (Math.sqrt(ta.size * tb.size) || 1);
}

function matchVariantFallback(jd, variants) {
  const scores = Object.entries(variants).map(([label, text]) => ({ label, score: tokenSim(jd, text) }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0], next = scores[1] || { score: 0 };
  return { label: top.label, confidence: Math.min(1, Math.max(0, (top.score - next.score) * 5 + 0.5)), scores };
}

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
    <div class="kwgroup">
      ${gap.present.map(k => `<span class="kw present">${k}</span>`).join("")}
      ${gap.missing.map(k => `<span class="kw missing">${k}</span>`).join("")}
    </div>`;
}

function renderBulletRow(b, jdKeywords) {
  const row = document.createElement("div");
  row.className = "diffrow";

  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = b.accepted;
  cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

  const stack = document.createElement("div");
  stack.className = "diff-stack";
  const left = document.createElement("div"); left.className = "diff-side left";
  const right = document.createElement("div"); right.className = "diff-side right";
  right.title = "Click to edit";

  const renderSides = () => {
    const sides = DIFF.renderDiffSideBySide(b.original, b.tailored ?? b.original, jdKeywords);
    left.innerHTML = sides.leftHTML;
    right.innerHTML = sides.rightHTML;
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
    ta.rows = Math.max(2, Math.ceil(ta.value.length / 40));
    right.innerHTML = ""; right.appendChild(ta); ta.focus();
    ta.addEventListener("blur", () => { b.tailored = ta.value.trim(); renderSides(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.blur(); }
      if (e.key === "Escape") { ta.value = b.tailored ?? b.original; ta.blur(); }
    });
  });

  renderSides();
  stack.append(left, right);
  row.append(cb, stack);
  return row;
}

function renderDiff(blocks, jdKeywords) {
  const root = $("diff"); root.innerHTML = "";
  let headerShown = false;
  for (const sec of RESUME_PARSER.groupBulletsBySection(blocks)) {
    if (sec.protected) continue;
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = sec.section + (sec.subheading ? " — " + sec.subheading.replace(/\*\*/g, "") : "");
    root.appendChild(h);
    if (!headerShown) {
      const hdr = document.createElement("div");
      hdr.className = "diffhdr";
      hdr.innerHTML = `<div></div><div>Original</div><div class="hdr-tailored">Tailored</div>`;
      root.appendChild(hdr);
      headerShown = true;
    }
    for (const b of sec.bullets) root.appendChild(renderBulletRow(b, jdKeywords));
  }
}

async function renderHistory() {
  const items = await HISTORY.loadHistory();
  const root = $("history");
  if (!items.length) { root.innerHTML = `<div class="empty">No saved applications yet.</div>`; return; }
  root.innerHTML = items.map(it => `
    <div class="hist-row">
      <strong>${it.company || "?"}</strong> — ${it.role || "?"}<br>
      <span class="meta">${it.variant} · ${new Date(it.savedAt).toLocaleString()}</span>
      <button data-id="${it.id}" class="del">delete</button><br>
      <span class="meta">${it.url || ""}</span>
    </div>`).join("");
  root.querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => {
    await HISTORY.deleteApplication(b.dataset.id); renderHistory();
  }));
}

$("clearHistBtn").addEventListener("click", async () => {
  if (confirm("Clear all saved applications?")) { await HISTORY.clearHistory(); renderHistory(); }
});

async function rankBulletsInPlace(blocks, jd) {
  if (!window.EMBEDDINGS) return;
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    if (sec.protected || sec.bullets.length < 2) continue;
    try {
      const ranked = await EMBEDDINGS.rankBulletsByJD(sec.bullets.map(b => b.original), jd);
      RESUME_PARSER.reorderSectionBullets(blocks, sec.bullets, ranked.map(r => r.i));
      log(`  reordered ${sec.section}${sec.subheading ? " / " + sec.subheading.replace(/\*\*/g, "") : ""} by JD relevance`);
    } catch (e) { log("  rank failed for " + sec.section + ": " + e.message); }
  }
}

async function doRewrite(blocks, ctx) {
  log("ranking bullets by JD relevance…");
  status("Ranking bullets…");
  await rankBulletsInPlace(blocks, ctx.jd);
  renderDiff(blocks, ctx.keywords);

  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  log(`parsed ${blocks.filter(b => b.type === "bullet").length} bullets, ${sections.length} sections`);
  const t0 = performance.now();
  for (const sec of sections) {
    if (sec.protected) { sec.bullets.forEach(b => { b.tailored = b.original; }); continue; }
    status(`Rewriting: ${sec.section} (${sec.bullets.length})…`);
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
  $("diffCard").hidden = false;
  status("Done.");
}

async function getJD() {
  const source = document.querySelector('input[name="jdSource"]:checked').value;
  if (source === "manual") {
    const text = $("jd").value.trim();
    if (!text) { status("Paste a JD first."); return null; }
    return { text, site: "manual", url: "", title: "", company: "" };
  }
  status("Scraping JD…");
  let scrape;
  try {
    scrape = await chrome.runtime.sendMessage({ type: "SCRAPE_JD" });
  } catch (e) {
    status("Scrape failed: " + (e?.message || e));
    log("scrape channel error: " + (e?.message || e));
    return null;
  }
  if (!scrape?.ok || !scrape.text) {
    const reason = scrape?.error || "no content";
    status("Scrape failed — " + reason);
    log("scrape failed: " + reason);
    return null;
  }
  status(`Scraped ${scrape.site} · ${scrape.text.length} chars.`);
  log(`scraped ${scrape.site} · ${scrape.text.length} chars`);
  return scrape;
}

async function runFlow({ matchOnly }) {
  $("timings").textContent = ""; $("log").textContent = "";
  ["matchCard", "fitCard", "diffCard"].forEach(id => { $(id).hidden = true; });
  $("diff").innerHTML = ""; $("goodEnough").innerHTML = ""; $("qualBanner").innerHTML = "";
  CURRENT_BLOCKS = null; CURRENT_META = null; CURRENT_CONTEXT = null;

  const variants = await loadVariants();
  const scrape = await getJD();
  if (!scrape) return;
  const jd = scrape.text;

  let t0 = performance.now();
  log(window.EMBEDDINGS ? "matching variant (embeddings)…" : "matching variant (token overlap)…");
  status("Matching variant…");
  const match = window.EMBEDDINGS
    ? await EMBEDDINGS.matchVariant(jd, variants)
    : matchVariantFallback(jd, variants);
  const matchMs = (performance.now() - t0).toFixed(0);
  log(`match → ${match.label} (conf ${match.confidence.toFixed(2)}) in ${matchMs}ms`);

  $("variantLabel").textContent = match.label;
  $("confidence").textContent = `${Math.round(match.confidence * 100)}% confident`;
  renderScores(match.scores);
  $("matchCard").hidden = false;

  const resumeText = variants[match.label];

  const override = $("overrideQualBtn").checked;
  status(override ? "Extracting keywords…" : "Checking qualifications + keywords…");
  log(override
    ? "extracting JD keywords (qual skipped — override on)…"
    : "running qual check + keyword extraction in parallel…");
  t0 = performance.now();

  // When override is on, skip the qual call entirely — we'd ignore the result anyway.
  const qualPromise = override
    ? Promise.resolve(null)
    : MODEL.checkQualification(jd, resumeText).catch(e => { log("qual check failed (continuing): " + e.message); return null; });
  const clsPromise = MODEL.classify(jd, Object.keys(variants));

  const [qual, cls] = await Promise.all([qualPromise, clsPromise]);
  const parallelMs = (performance.now() - t0).toFixed(0);

  if (qual) {
    log(`qual: ${qual.verdict} — ${qual.reasoning}`);
    renderQual(qual);
    if (qual.verdict === "underqualified") {
      log("STOP: underqualified. Tick 'Override qual block' to proceed.");
      status("BLOCKED — underqualified. Tick override to proceed.");
      $("timings").textContent = `match ${matchMs}ms · qual+kw ${parallelMs}ms (BLOCKED)`;
      return;
    }
  }
  log(`keywords: ${cls.keywords.join(", ")}`);
  const gap = PROMPTS.fitGap(cls.keywords, resumeText);
  renderFitGap(gap);
  $("fitCard").hidden = false;

  CURRENT_CONTEXT = { jd, keywords: cls.keywords, match, resumeText };
  CURRENT_META = {
    url: scrape.url, site: scrape.site,
    company: scrape.company || "", role: scrape.title || "",
    variant: match.label, keywords: cls.keywords,
    qualVerdict: qual?.verdict || "unknown"
  };

  if (matchOnly) {
    $("timings").textContent = `match ${matchMs}ms · qual+kw ${parallelMs}ms`;
    log("Check-fit done. Click 'Analyze & tailor' to rewrite.");
    status("Check-fit done.");
    return;
  }

  if (gap.coverage >= GOOD_ENOUGH_THRESHOLD && !$("forceRewriteBtn").checked) {
    CURRENT_BLOCKS = RESUME_PARSER.parseResume(resumeText);
    renderDiff(CURRENT_BLOCKS, cls.keywords);
    $("diffCard").hidden = false;
    $("goodEnough").innerHTML = `
      <div class="banner ok">
        <strong>Resume already well-aligned (${Math.round(gap.coverage * 100)}% keyword coverage).</strong>
        Rewrite is optional — your original is a strong fit.
        <div style="margin-top: 6px"><button id="rewriteAnywayBtn">Rewrite anyway</button></div>
      </div>`;
    $("rewriteAnywayBtn").addEventListener("click", async () => {
      $("goodEnough").innerHTML = "<em>Rewriting…</em>";
      await doRewrite(RESUME_PARSER.parseResume(resumeText), CURRENT_CONTEXT);
      $("goodEnough").innerHTML = "";
    });
    $("timings").textContent = `match ${matchMs}ms · qual+kw ${parallelMs}ms (no rewrite needed)`;
    status("No rewrite needed — preview/export the original.");
    return;
  }

  const tRewrite = performance.now();
  const blocks = RESUME_PARSER.parseResume(resumeText);
  await doRewrite(blocks, CURRENT_CONTEXT);
  const rewriteMs = (performance.now() - tRewrite).toFixed(0);
  $("timings").textContent = `match ${matchMs}ms · qual+kw ${parallelMs}ms · rewrite ${rewriteMs}ms`;
}

$("tailorBtn").addEventListener("click", () => runFlow({ matchOnly: false }).catch(e => { log("ERR: " + e.message); status("Error: " + e.message); }));
$("matchBtn").addEventListener("click", () => runFlow({ matchOnly: true }).catch(e => { log("ERR: " + e.message); status("Error: " + e.message); }));

$("previewBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return status("Nothing to preview yet.");
  PREVIEW.openPreview(CURRENT_BLOCKS, `Resume — ${CURRENT_META?.variant || "preview"}`);
});

$("copyBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return status("Nothing to copy yet.");
  navigator.clipboard.writeText(RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS));
  status("Copied tailored resume to clipboard.");
});

$("docxBtn").addEventListener("click", async () => {
  if (!CURRENT_BLOCKS) return status("Nothing to export yet.");
  if (!window.DOCX_EXPORT) return status("docx not loaded yet");
  const name = (CURRENT_META?.company || CURRENT_META?.variant || "tailored").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  await DOCX_EXPORT.downloadDocx(CURRENT_BLOCKS, `${name}_resume.docx`);
  status("Downloaded .docx");
});

$("saveBtn").addEventListener("click", async () => {
  if (!CURRENT_BLOCKS || !CURRENT_META) return status("Nothing to save yet.");
  const accepted = CURRENT_BLOCKS.filter(b => b.type === "bullet" && b.accepted).length;
  const total = CURRENT_BLOCKS.filter(b => b.type === "bullet").length;
  await HISTORY.saveApplication({
    ...CURRENT_META,
    acceptedBullets: accepted, totalBullets: total,
    markdown: RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS)
  });
  status(`Saved (${accepted}/${total} accepted).`);
});

init();
