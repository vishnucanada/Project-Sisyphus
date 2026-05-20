chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "SCRAPE_JD") return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return sendResponse({ ok: false, error: "No active tab" });

    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selectors = [
          ".jobs-description__content",        // LinkedIn
          "#jobDescriptionText",                // Indeed
          '[data-testid="jobDescriptionText"]', // Indeed (newer)
          ".show-more-less-html__markup",      // LinkedIn guest
          "article", "main"
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.length > 200) return el.innerText;
        }
        return document.body.innerText.slice(0, 8000);
      }
    });
    sendResponse({ ok: true, text: result, url: tab.url });
  })();
  return true; // keep channel open for async sendResponse
});
