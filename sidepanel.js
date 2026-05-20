const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };

const DEFAULT_VARIANTS = {
  backend: "# Jane Doe — Backend Engineer\n## Experience\n- Built X serving Y rps\n## Skills\n- Go, Postgres, Kafka",
  ml: "# Jane Doe — ML Engineer\n## Experience\n- Trained Z model\n## Skills\n- PyTorch, ranking, embeddings",
  frontend: "# Jane Doe — Frontend Engineer\n## Experience\n- Shipped X feature\n## Skills\n- React, TypeScript, a11y"
};

async function loadVariants() {
  const { variants } = await chrome.storage.local.get("variants");
  return variants || DEFAULT_VARIANTS;
}

async function init() {
  $("variants").value = JSON.stringify(await loadVariants(), null, 2);

  const a = await MODEL.available();
  if (a === "no-api") {
    status("Prompt API missing — enable chrome://flags/#prompt-api-for-gemini-nano then restart.");
  } else if (a === "available") {
    status("Model ready.");
  } else {
    status(`Model state: ${a}. Pre-warming…`);
    try {
      await MODEL.warm((loaded) => status(`Downloading model: ${Math.round(loaded * 100)}%`));
      status("Model ready.");
    } catch (e) { status("Warm failed: " + e.message); }
  }
}

$("saveBtn").addEventListener("click", async () => {
  try {
    const parsed = JSON.parse($("variants").value);
    await chrome.storage.local.set({ variants: parsed });
    MODEL.destroyAll(); // variants changed; not strictly needed but cheap
    status("Variants saved.");
  } catch (e) { status("Invalid JSON: " + e.message); }
});

$("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("tailored").value);
  status("Copied.");
});

$("tailorBtn").addEventListener("click", async () => {
  $("result").hidden = true;
  $("tailored").value = "";
  status("Scraping JD…");

  const variants = await loadVariants();
  const labels = Object.keys(variants);
  const scrape = await chrome.runtime.sendMessage({ type: "SCRAPE_JD" });
  if (!scrape?.ok || !scrape.text) return status("Failed to scrape page.");

  const t0 = performance.now();
  status(`Classifying (${scrape.text.length} chars)…`);
  let cls;
  try { cls = await MODEL.classify(scrape.text, labels); }
  catch (e) { return status("Classify failed: " + e.message); }
  const classifyMs = Math.round(performance.now() - t0);

  if (!variants[cls.label]) return status(`Unknown label from model: ${cls.label}`);

  $("variantLabel").textContent = `${cls.label} (${Math.round((cls.confidence ?? 0.5) * 100)}%)`;
  $("keywords").innerHTML = (cls.keywords || []).map(k => `<li>${k}</li>`).join("");
  $("result").hidden = false;

  status(`Matched in ${classifyMs}ms. Rewriting (streaming)…`);
  const t1 = performance.now();
  try {
    await MODEL.rewriteStreaming(variants[cls.label], scrape.text, cls.keywords || [],
      (full) => { $("tailored").value = full; }
    );
  } catch (e) { return status("Rewrite failed: " + e.message); }
  const rewriteMs = Math.round(performance.now() - t1);
  status(`Done — classify ${classifyMs}ms · rewrite ${rewriteMs}ms`);
});

init();
