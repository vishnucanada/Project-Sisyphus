const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };

const DEFAULT_VARIANTS = {
  backend: "# Jane Doe — Backend Engineer\n## Experience\n- Built X serving Y rps...\n## Skills\n- Go, Postgres, Kafka",
  ml: "# Jane Doe — ML Engineer\n## Experience\n- Trained Z model...\n## Skills\n- PyTorch, ranking, embeddings",
  frontend: "# Jane Doe — Frontend Engineer\n## Experience\n- Shipped X feature...\n## Skills\n- React, TypeScript, a11y"
};

async function loadVariants() {
  const { variants } = await chrome.storage.local.get("variants");
  return variants || DEFAULT_VARIANTS;
}

async function init() {
  const variants = await loadVariants();
  $("variants").value = JSON.stringify(variants, null, 2);

  const a = await MODEL.available();
  if (a === "no") status("Prompt API not available — enable chrome://flags/#prompt-api-for-gemini-nano");
  else if (a === "downloadable" || a === "downloading") status(`Gemini Nano model: ${a} (first run downloads ~2GB)`);
  else status("Ready.");
}

$("saveBtn").addEventListener("click", async () => {
  try {
    const parsed = JSON.parse($("variants").value);
    await chrome.storage.local.set({ variants: parsed });
    status("Variants saved.");
  } catch (e) { status("Invalid JSON: " + e.message); }
});

$("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("tailored").value);
  status("Copied.");
});

$("tailorBtn").addEventListener("click", async () => {
  $("result").hidden = true;
  status("Scraping job description…");
  const variants = await loadVariants();
  const labels = Object.keys(variants);

  const scrape = await chrome.runtime.sendMessage({ type: "SCRAPE_JD" });
  if (!scrape?.ok || !scrape.text) return status("Failed to scrape page.");

  status("Classifying…");
  let cls;
  try { cls = await MODEL.classify(scrape.text, labels); }
  catch (e) { return status("Classify failed: " + e.message); }

  if (!variants[cls.label]) return status(`Model returned unknown label: ${cls.label}`);

  status(`Matched "${cls.label}" (${Math.round(cls.confidence * 100)}%). Rewriting…`);
  let tailored;
  try { tailored = await MODEL.rewrite(variants[cls.label], scrape.text, cls.keywords || []); }
  catch (e) { return status("Rewrite failed: " + e.message); }

  $("variantLabel").textContent = cls.label;
  $("keywords").innerHTML = (cls.keywords || []).map(k => `<li>${k}</li>`).join("");
  $("tailored").value = tailored;
  $("result").hidden = false;
  status("Done.");
});

init();
