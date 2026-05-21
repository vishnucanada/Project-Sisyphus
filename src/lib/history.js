// Persists each tailoring run to chrome.storage.local for history/search/analytics.

async function loadHistory() {
  const { applications = [] } = await chrome.storage.local.get("applications");
  return applications;
}

async function saveApplication(entry) {
  const all = await loadHistory();
  all.unshift({ id: crypto.randomUUID(), savedAt: Date.now(), ...entry });
  await chrome.storage.local.set({ applications: all.slice(0, 200) });
}

async function deleteApplication(id) {
  const all = await loadHistory();
  await chrome.storage.local.set({ applications: all.filter(a => a.id !== id) });
}

async function clearHistory() {
  await chrome.storage.local.set({ applications: [] });
}

// Aggregate keywords across all saved applications.
// Returns sorted lists:
//   trending: keywords that appear most often across JDs you've tailored for
//   gaps:     keywords that were MISSING in your resume most often (priority skills to learn)
//   coverage: median coverage % across all applications
async function aggregateKeywords() {
  const apps = await loadHistory();
  if (!apps.length) return { trending: [], gaps: [], coverage: null, count: 0 };

  const seenCount = new Map();   // kw -> # JDs that mentioned it
  const missingCount = new Map(); // kw -> # JDs where it was missing from matched resume
  const coverages = [];

  for (const a of apps) {
    const kws = a.keywords || [];
    const missing = a.missingKeywords || [];
    for (const k of kws) seenCount.set(k, (seenCount.get(k) || 0) + 1);
    for (const k of missing) missingCount.set(k, (missingCount.get(k) || 0) + 1);
    if (typeof a.coverage === "number") coverages.push(a.coverage);
  }

  const trending = [...seenCount.entries()]
    .map(([kw, n]) => ({
      keyword: kw,
      seen: n,
      missing: missingCount.get(kw) || 0,
      missingRate: (missingCount.get(kw) || 0) / n
    }))
    .sort((a, b) => b.seen - a.seen);

  const gaps = trending
    .filter(t => t.missing >= 2)
    .sort((a, b) => (b.missing * b.missingRate) - (a.missing * a.missingRate));

  const median = coverages.length
    ? coverages.sort((a, b) => a - b)[Math.floor(coverages.length / 2)]
    : null;

  return { trending: trending.slice(0, 25), gaps: gaps.slice(0, 15), coverage: median, count: apps.length };
}

window.HISTORY = { loadHistory, saveApplication, deleteApplication, clearHistory, aggregateKeywords };
