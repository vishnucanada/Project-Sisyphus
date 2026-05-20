const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = 1e9; };

let CURRENT_BLOCKS = null; // last tailored blocks (for export)

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
    log("warming LLM (first run downloads ~1.8GB)…");
    await MODEL.warm((loaded, text) => {
      const pct = Math.round(loaded * 100);
      $("diag").textContent = `LLM: ${pct}%`;
      if (text) log(`  ${text}`);
    }).catch(e => log("LLM warm failed: " + e.message));
    $("diag").textContent = "LLM: available";
  }

  log("warming embedding model (~25MB)…");
  $("embDiag").textContent = "emb: loading";
  await EMBEDDINGS.warm((p) => {
    if (p?.progress != null) $("embDiag").textContent = `emb: ${Math.round(p.progress)}%`;
  }).catch(e => log("emb warm failed: " + e.message));
  $("embDiag").textContent = "emb: ready";
  log("ready.");
})();

function renderScores(scores) {
  $("scores").innerHTML = scores.map(s =>
    `<span class="pill">${s.label}: ${s.score.toFixed(3)}</span>`
  ).join(" ");
}

function renderFitGap(gap) {
  $("fitgap").innerHTML = `
    <p>Coverage: <strong>${Math.round(gap.coverage * 100)}%</strong> of JD keywords found in resume.</p>
    <div class="row">
      <div><strong>Present in resume</strong><ul class="present">${gap.present.map(k => `<li>${k}</li>`).join("")}</ul></div>
      <div><strong>Missing (honest gaps)</strong><ul class="missing">${gap.missing.map(k => `<li>${k}</li>`).join("")}</ul></div>
    </div>`;
}

function renderDiff(blocks, jdKeywords) {
  const container = $("diff");
  container.innerHTML = "";
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = sec.section + (sec.subheading ? " — " + sec.subheading.replace(/\*\*/g, "") : "");
    container.appendChild(h);

    for (const b of sec.bullets) {
      const row = document.createElement("div");
      row.className = "diffrow";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!b.accepted;
      cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

      const orig = document.createElement("div");
      orig.className = "orig"; orig.textContent = b.original;

      const tail = document.createElement("div");
      tail.className = "tail";
      if (b.tailored == null) tail.textContent = "(skipped)";
      else if (b.tailored === b.original) {
        tail.innerHTML = `<em style="color:#888">unchanged</em>`;
      } else {
        tail.textContent = b.tailored;
        const v = VALIDATOR.validateBullet({ original: b.original, rewrite: b.tailored, allowedExtras: jdKeywords });
        if (!v.ok) {
          const flag = document.createElement("div");
          flag.className = "badge badge-flag";
          flag.textContent = "flagged: " + v.reasonText;
          flag.title = "Click to reject this bullet";
          tail.appendChild(document.createElement("br"));
          tail.appendChild(flag);
        }
      }

      row.append(cb, orig, tail);
      container.appendChild(row);
    }
  }
}

async function runTailor({ matchOnly }) {
  $("timings").textContent = "";
  $("log").textContent = "";
  $("diff").innerHTML = "";
  $("fitgap").innerHTML = "";
  CURRENT_BLOCKS = null;

  const variants = JSON.parse($("variants").value);
  const jd = $("jd").value;
  log(`labels = ${Object.keys(variants).join(", ")}`);
  log(`jd length = ${jd.length} chars`);

  let t0 = performance.now();
  log("matching variant (embeddings)…");
  const match = await EMBEDDINGS.matchVariant(jd, variants);
  const matchMs = (performance.now() - t0).toFixed(0);
  log(`match done in ${matchMs}ms → ${match.label} (conf ${match.confidence.toFixed(2)})`);
  $("variantLabel").textContent = match.label;
  $("confidence").textContent = `confidence ${(match.confidence * 100).toFixed(0)}%`;
  renderScores(match.scores);

  // Extract JD keywords via LLM (small call, fast).
  log("extracting JD keywords (LLM)…");
  t0 = performance.now();
  const cls = await MODEL.classify(jd, Object.keys(variants));
  const kwMs = (performance.now() - t0).toFixed(0);
  log(`keywords (${kwMs}ms): ${cls.keywords.join(", ")}`);

  const resumeText = variants[match.label];
  const gap = PROMPTS.fitGap(cls.keywords, resumeText);
  renderFitGap(gap);

  if (matchOnly) {
    $("timings").textContent = `match ${matchMs}ms · kw ${kwMs}ms`;
    return;
  }

  // Parse, rewrite section-by-section, render diff.
  const blocks = RESUME_PARSER.parseResume(resumeText);
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  log(`parsed ${blocks.filter(b => b.type === "bullet").length} bullets across ${sections.length} sections.`);

  t0 = performance.now();
  for (const sec of sections) {
    log(`rewriting section: ${sec.section}${sec.subheading ? " / " + sec.subheading.replace(/\*\*/g, "") : ""} (${sec.bullets.length} bullets)`);
    try {
      const tailored = await MODEL.rewriteBullets({
        jd, keywords: cls.keywords,
        sectionTitle: sec.section, subheading: sec.subheading,
        bullets: sec.bullets,
        onProgress: (full) => { /* could surface partial JSON if desired */ }
      });
      sec.bullets.forEach((b, i) => { b.tailored = tailored[i] ?? b.original; });
      renderDiff(blocks, cls.keywords); // re-render incrementally
    } catch (e) {
      log(`  section failed: ${e.message}`);
      sec.bullets.forEach(b => { b.tailored = b.original; });
    }
  }
  const rewriteMs = (performance.now() - t0).toFixed(0);
  log(`rewrite done in ${rewriteMs}ms`);
  $("timings").textContent = `match ${matchMs}ms · kw ${kwMs}ms · rewrite ${rewriteMs}ms`;
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
