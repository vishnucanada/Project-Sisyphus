const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };

let CURRENT_BLOCKS = null;
let CURRENT_META = null;

async function loadVariants() {
  const { variants } = await chrome.storage.local.get("variants");
  return variants || window.RESUMES;
}

// Tab switching
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

// Simple cosine on token overlap as a no-embedding fallback for variant matching.
function tokenSim(a, b) {
  const ta = new Set(a.toLowerCase().match(/[a-z][a-z0-9+./-]{2,}/g) || []);
  const tb = new Set(b.toLowerCase().match(/[a-z][a-z0-9+./-]{2,}/g) || []);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const denom = Math.sqrt(ta.size * tb.size) || 1;
  return inter / denom;
}

function matchVariantLocal(jd, variants) {
  const scores = Object.entries(variants).map(([label, text]) => ({ label, score: tokenSim(jd, text) }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0], next = scores[1] || { score: 0 };
  const confidence = Math.min(1, Math.max(0, (top.score - next.score) * 5 + 0.5));
  return { label: top.label, confidence, scores };
}

function renderDiff(blocks, jdKeywords) {
  const root = $("diff"); root.innerHTML = "";
  for (const sec of RESUME_PARSER.groupBulletsBySection(blocks)) {
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = sec.section + (sec.subheading ? " — " + sec.subheading.replace(/\*\*/g, "") : "");
    root.appendChild(h);

    for (const b of sec.bullets) {
      const row = document.createElement("div");
      row.className = "diffrow";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = b.accepted;
      cb.addEventListener("change", () => { b.accepted = cb.checked; row.classList.toggle("rejected", !cb.checked); });

      const stack = document.createElement("div");
      const orig = document.createElement("div"); orig.className = "orig"; orig.textContent = b.original;
      const tail = document.createElement("div"); tail.className = "tail";
      if (!b.tailored || b.tailored === b.original) tail.innerHTML = "<em style='color:#888'>unchanged</em>";
      else {
        tail.textContent = b.tailored;
        const v = VALIDATOR.validateBullet({ original: b.original, rewrite: b.tailored, allowedExtras: jdKeywords });
        if (!v.ok) {
          const f = document.createElement("span"); f.className = "badge-flag"; f.textContent = " ⚠ " + v.reasonText;
          tail.appendChild(f);
        }
      }
      stack.append(orig, tail);
      row.append(cb, stack);
      root.appendChild(row);
    }
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
    </div>
  `).join("");
  root.querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => {
    await HISTORY.deleteApplication(b.dataset.id); renderHistory();
  }));
}

$("clearHistBtn").addEventListener("click", async () => {
  if (confirm("Clear all saved applications?")) { await HISTORY.clearHistory(); renderHistory(); }
});

$("tailorBtn").addEventListener("click", async () => {
  $("diff").innerHTML = ""; $("fitgap").innerHTML = ""; CURRENT_BLOCKS = null;
  status("Scraping JD…");
  const variants = await loadVariants();
  const scrape = await chrome.runtime.sendMessage({ type: "SCRAPE_JD" });
  if (!scrape?.ok || !scrape.text) return status("Failed to scrape page.");
  status(`Scraped ${scrape.site} · ${scrape.text.length} chars.`);

  // Variant match: token-overlap fallback (no Transformers.js in extension yet).
  const match = matchVariantLocal(scrape.text, variants);
  $("matchSummary").innerHTML = `Matched <strong>${match.label}</strong> · confidence ${(match.confidence * 100).toFixed(0)}%`;

  status("Extracting JD keywords…");
  const cls = await MODEL.classify(scrape.text, Object.keys(variants));
  const resumeText = variants[match.label];
  renderFitGap(PROMPTS.fitGap(cls.keywords, resumeText));

  const blocks = RESUME_PARSER.parseResume(resumeText);
  const sections = RESUME_PARSER.groupBulletsBySection(blocks);
  for (const sec of sections) {
    status(`Rewriting: ${sec.section} (${sec.bullets.length})…`);
    try {
      const tailored = await MODEL.rewriteBullets({
        jd: scrape.text, keywords: cls.keywords,
        sectionTitle: sec.section, subheading: sec.subheading,
        bullets: sec.bullets
      });
      sec.bullets.forEach((b, i) => { b.tailored = tailored[i] ?? b.original; });
      renderDiff(blocks, cls.keywords);
    } catch (e) {
      status(`Section "${sec.section}" failed: ${e.message}`);
      sec.bullets.forEach(b => { b.tailored = b.original; });
    }
  }

  CURRENT_BLOCKS = blocks;
  CURRENT_META = {
    url: scrape.url, site: scrape.site,
    company: scrape.company || "", role: scrape.title || "",
    variant: match.label, keywords: cls.keywords
  };
  status("Done.");
});

$("copyBtn").addEventListener("click", () => {
  if (!CURRENT_BLOCKS) return;
  navigator.clipboard.writeText(RESUME_PARSER.serializeBlocks(CURRENT_BLOCKS));
  status("Copied.");
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
  status(`Saved (${accepted}/${total} bullets accepted).`);
});

init();
