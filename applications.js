// Persists each tailoring run to chrome.storage.local for history/search.

async function loadHistory() {
  const { applications = [] } = await chrome.storage.local.get("applications");
  return applications;
}

async function saveApplication(entry) {
  const all = await loadHistory();
  all.unshift({ id: crypto.randomUUID(), savedAt: Date.now(), ...entry });
  // Cap to 200 most recent
  await chrome.storage.local.set({ applications: all.slice(0, 200) });
}

async function deleteApplication(id) {
  const all = await loadHistory();
  await chrome.storage.local.set({ applications: all.filter(a => a.id !== id) });
}

async function clearHistory() {
  await chrome.storage.local.set({ applications: [] });
}

window.HISTORY = { loadHistory, saveApplication, deleteApplication, clearHistory };
