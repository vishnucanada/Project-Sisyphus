const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };

const GOOD_ENOUGH_THRESHOLD = 0.70;
let CURRENT_BLOCKS = null;
let CURRENT_META = null;
let CURRENT_KEYWORDS = [];

async function loadVariants() {
  const { variants } = await chrome.storage.local.get("variants");
  return variants || window.RESUMES;
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + t.dataset.tab));
  if (t.dataset.tab === "history") renderHistory();
}));

async function init() {
  $("variants").value = JSON.stringify(await loadVariants(), null, 2);
  const a = await MODEL.available();
  if (a === "no-api") status("Prompt API missing — enable chrome://flags/#prompt-api-for-gemini-nano.");
  else if (a !== "available") {
    status(`Model: ${a}. Warming…`);
    try { await MODEL.warm((loaded) => status(`Downloading: ${Math.round(loaded * 100)}%`)); status("Ready."); }
    catch (e) { status("Warm failed: " + e.message); }
  } else status("Ready.");
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

function matchVariantLocal(jd, variants) {
  const scores = Object.entries(variants).map(([label, text]) => ({ label, score: tokenSim(jd, text) }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0], next = scores[1] || { score: 0 };
  return { label: top.label, confidence: Math.min(1, Math.max(0, (top.score - next.score) * 5 + 0.5)), scores };
}

function renderQual(q) {
  const cls = "qual-" + q.verdict;
  $("qualBanner").innerHTML = `
    <div class="qual-banner ${cls}">
      <strong>${q.verdict.toUpperCase()}</strong> — ${q.reasoning}
      ${q.missing?.length ? `<br><em>Missing:</em> ${q.missing.join("; ")}` : ""}
    </div>`;
}

function renderBulletRow(b, jdKeywords) {
  const row = document.createElement("div");
  row.className = "diffrow";

  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = b.accepted;
  cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

  const left = document.createElement("div");
  left.className = "diff-side left";

  const right = document.createElement("div");
  right.className = "diff-side right";
  right.title = "Click to edit";

  const renderSides = () => {
    const sides = DIFF.renderDiffSideBySide(b.original, b.tailored ?? b.original, jdKeywords);
    left.innerHTML = sides.leftHTML;
    right.innerHTML = sides.rightHTML;
    if (b.tailored && b.tailored !== b.original) {
      const v = VALIDATOR.validateBullet({ original: b.original, rewrite: b.tailored, allowedExtras: jdKeywords });
      if (!v.ok) {
        const flag = document.createElement("span");
        flag.className = "badge-flag"; flag.textContent = " ⚠ " + v.reasonText;
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
  row.append(cb, left, right);
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
      hdr.innerHTML = `<div></div><div>Original</div><div>Tailored</div>`;
      root.appendChild(hdr);
      headerShown = true;
    }
    for (const b of sec.bullets) root.appendChild(renderBulletRow(b, jdKeywords));
  }
}

function renderFitGap(gap) {
  $("fitgap").innerHTML = `
    Coverage <strong>${Math.round(gap.coverage * 100)}%</strong>.<br>
    ${gap.present.map(k => `<span class="pill present">${k}</span>`).join("")}
    ${gap.missing.map(k => `<span class="pill missing">${k}</span>`).join("")}`;
}

async function renderHistory() {
  const items = await HISTORY.loadHistory();
  const root = $("history");
  if (!items.length) { root.innerHTML = "<p><em>No saved applications yet.</em></p>"; return; }
  root.innerHTML = items.map(it => `
    <div class="hist-row">
      <strong>${it.company || "?"}</strong> — ${it.role || "?"} · <span class="meta">${it.variant} · ${new Date(it.savedAt).toLocaleString()}</span><br>
      <span class="meta">${it.url || ""}</span>
      <button data-id="${it.id}" class="del">delete</button>
    </div>`).join("");
  root.querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => {
    await HISTORY.deleteApplication(b.dataset.id); renderHistory();
  }));
}

$("clearHistBtn").addEventListener("click", async () => {
  if (confirm("Clear all saved applications?")) { await HISTORY.clearHistory(); renderHistory(); }
});

async function rankBulletsInPlace(blocks, jd) {
  if (!window.EMBEDDINGS) return; // extension may not have embeddings bundled yet
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    if (sec.protected || sec.bullets.length < 2) continue;
    try {
      const ranked = await EMBEDDINGS.rankBulletsByJD(sec.bullets.map(b => b.original), jd);
      RESUME_PARSER.reorderSectionBullets(blocks, sec.bullets, ranked.map(r => r.i));
    } catch (e) { /* skip silently — ranking is optional */ }
  }
}

async function runRewrite(blocks, ctx) {
  status("Ranking bullets by relevance…");
  await rankBulletsInPlace(blocks, ctx.jd);
  renderDiff(blocks, ctx.keywords);

  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    if (sec.protected) { sec.bullets.forEach(b => { b.tailored = b.original; }); continue; }
    status(`Rewriting: ${sec.section} (${sec.bullets.length})…`);
    try {
      const tailored = await MODEL.rewriteBullets({
        jd: ctx.jd, keywords: ctx.keywords,
        sectionTitle: sec.section, subheading: sec.subheading,
        bullets: sec.bullets
      });
      sec.bullets.forEach((b, i) => { b.tailored = tailored[i] ?? b.original; });
      renderDiff(blocks, ctx.keywords);
    } catch (e) {
      status(`Section "${sec.section}" failed: ${e.message}`);
      sec.bullets.forEach(b => { b.tailored = b.original; });
    }
  }
  CURRENT_BLOCKS = blocks;
  status("Done.");
}

$("tailorBtn").addEventListener("click", async () => {
  $("diff").innerHTML = ""; $("fitgap").innerHTML = "";
  $("qualBanner").innerHTML = ""; $("goodEnough").innerHTML = "";
  CURRENT_BLOCKS = null;

  status("Scraping JD…");
  const variants = await loadVariants();
  const scrape = await chrome.runtime.sendMessage({ type: "SCRAPE_JD" });
  if (!scrape?.ok || !scrape.text) return status("Failed to scrape page.");
  status(`Scraped ${scrape.site} · ${scrape.text.length} chars.`);

  const match = matchVariantLocal(scrape.text, variants);
  $("matchSummary").innerHTML = `Matched <strong>${match.label}</strong> · confidence ${(match.confidence * 100).toFixed(0)}%`;
  const resumeText = variants[match.label];

  status("Checking qualifications…");
  let qual;
  try { qual = await MODEL.checkQualification(scrape.text, resumeText); renderQual(qual); }
  catch (e) { status("Qual check failed (continuing): " + e.message); }
  if (qual?.verdict === "underqualified" && !$("overrideQualBtn").checked) {
    return status("BLOCKED — underqualified. Tick override to proceed.");
  }

  status("Extracting JD keywords…");
  const cls = await MODEL.classify(scrape.text, Object.keys(variants));
  CURRENT_KEYWORDS = cls.keywords;
  const gap = PROMPTS.fitGap(cls.keywords, resumeText);
  renderFitGap(gap);

  const ctx = { jd: scrape.text, keywords: cls.keywords };
  CURRENT_META = {
    url: scrape.url, site: scrape.site,
    company: scrape.company || "", role: scrape.title || "",
    variant: match.label, keywords: cls.keywords,
    qualVerdict: qual?.verdict || "unknown"
  };

  // "Good enough" gate
  if (gap.coverage >= GOOD_ENOUGH_THRESHOLD && !$("forceRewriteBtn").checked) {
    const blocks = RESUME_PARSER.parseResume(resumeText);
    CURRENT_BLOCKS = blocks;
    renderDiff(blocks, cls.keywords);
    $("goodEnough").innerHTML = `
      <div class="qual-banner qual-qualified">
        Resume already well-aligned (${Math.round(gap.coverage * 100)}% coverage). Rewrite optional.
        <button id="rewriteAnywayBtn" style="margin-left:6px">Rewrite anyway</button>
      </div>`;
    $("rewriteAnywayBtn").addEventListener("click", async () => {
      $("goodEnough").innerHTML = "<em>Rewriting…</em>";
      await runRewrite(RESUME_PARSER.parseResume(resumeText), ctx);
      $("goodEnough").innerHTML = "";
    });
    status("No rewrite needed — preview/export the original.");
    return;
  }

  const blocks = RESUME_PARSER.parseResume(resumeText);
  await runRewrite(blocks, ctx);
});

$("previewBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return status("Nothing to preview yet.");
  PREVIEW.openPreview(CURRENT_BLOCKS, `Resume — ${CURRENT_META?.variant || "preview"}`);
});

$("copyBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return;
  navigator.clipboard.writeText(RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS));
  status("Copied tailored resume to clipboard.");
});

$("docxBtn").addEventListener("click", async () => {
  if (!CURRENT_BLOCKS) return;
  if (!window.DOCX_EXPORT) return status("docx not loaded yet");
  const name = (CURRENT_META?.company || "tailored").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  await DOCX_EXPORT.downloadDocx(CURRENT_BLOCKS, `${name}_resume.docx`);
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
