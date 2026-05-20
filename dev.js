const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = 1e9; };

const DEFAULT_VARIANTS = {
  backend: "# Jane Doe — Backend Engineer\n## Experience\n- Built X serving Y rps\n## Skills\n- Go, Postgres, Kafka",
  ml: "# Jane Doe — ML Engineer\n## Experience\n- Trained Z model\n## Skills\n- PyTorch, ranking, embeddings",
  frontend: "# Jane Doe — Frontend Engineer\n## Experience\n- Shipped X feature\n## Skills\n- React, TypeScript, a11y"
};

$("variants").value = JSON.stringify(DEFAULT_VARIANTS, null, 2);
$("jd").value = "We're hiring a backend engineer to scale our Go services on Postgres and Kafka. You'll own observability and SLOs.";

// MODEL is set by either model-gemini.js (sync) or model-webllm.js (ESM, async).
async function waitForModel(timeoutMs = 5000) {
  const start = performance.now();
  while (!window.MODEL) {
    if (performance.now() - start > timeoutMs) throw new Error("MODEL never loaded");
    await new Promise(r => setTimeout(r, 50));
  }
}

(async () => {
  try { await waitForModel(); }
  catch (e) { $("diag").textContent = "no model backend"; log(e.message); return; }

  log(`backend = ${MODEL.name}${MODEL.modelId ? " (" + MODEL.modelId + ")" : ""}`);
  const a = await MODEL.available();
  $("diag").textContent = `state: ${a}`;
  log(`availability = ${a}`);

  if (a === "no-webgpu") { log("WebGPU not available — chrome://flags/#enable-unsafe-webgpu or use Chrome 113+"); return; }
  if (a === "no-api")    { log("Prompt API not exposed — wrong backend or flag missing"); return; }

  if (a !== "available") {
    log("warming model (first run downloads weights from HuggingFace, ~1.8GB for Llama 3.2 3B)…");
    try {
      await MODEL.warm((loaded, text) => {
        const pct = Math.round(loaded * 100);
        $("diag").textContent = `loading: ${pct}%`;
        if (text) log(`  ${text}`);
      });
      $("diag").textContent = "state: available";
      log("ready.");
    } catch (e) { log("warm failed: " + e.message); }
  }
})();

async function run({ rewriteToo }) {
  $("timings").textContent = "";
  $("log").textContent = "";
  $("tailored").value = "";
  const variants = JSON.parse($("variants").value);
  const labels = Object.keys(variants);
  const jd = $("jd").value;

  log(`labels = ${labels.join(", ")}`);
  log(`jd length = ${jd.length} chars`);

  let t0 = performance.now();
  log("classifying…");
  const cls = await MODEL.classify(jd, labels, (delta) => log(`  classify> ${delta}`));
  const classifyMs = (performance.now() - t0).toFixed(0);
  log(`classify done in ${classifyMs}ms: ${JSON.stringify(cls)}`);

  $("variantLabel").textContent = cls.label;
  $("keywords").textContent = (cls.keywords || []).join(", ");

  if (!rewriteToo) { $("timings").textContent = `classify ${classifyMs}ms`; return; }
  if (!variants[cls.label]) { log(`unknown label: ${cls.label}`); return; }

  t0 = performance.now();
  log("rewriting (streaming)…");
  await MODEL.rewriteStreaming(
    variants[cls.label], jd, cls.keywords || [],
    (full) => { $("tailored").value = full; }
  );
  const rewriteMs = (performance.now() - t0).toFixed(0);
  log(`rewrite done in ${rewriteMs}ms`);
  $("timings").textContent = `classify ${classifyMs}ms · rewrite ${rewriteMs}ms`;
}

$("runBtn").addEventListener("click", () => run({ rewriteToo: true }).catch(e => log("ERR: " + e.message)));
$("classifyBtn").addEventListener("click", () => run({ rewriteToo: false }).catch(e => log("ERR: " + e.message)));
