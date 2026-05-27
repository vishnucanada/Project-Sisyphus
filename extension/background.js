chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "SCRAPE_JD") return;
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: "No active tab." });
      const url = tab.url || "";
      if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(url)) {
        return sendResponse({ ok: false, error: `Cannot scrape browser-internal page (${url.split(":")[0]}:). Switch to a job posting tab.` });
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeJD
      });
      const result = results?.[0]?.result;
      if (!result || !result.text) {
        return sendResponse({ ok: false, error: "Page had no scrapeable content." });
      }
      sendResponse({ ok: true, ...result, url });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});

function scrapeJD() {
  const host = location.hostname;
  const text = (el) => el?.innerText?.trim() || "";
  const first = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el && text(el).length > 100) return text(el); } return ""; };

  const sites = [
    {
      match: /linkedin\.com/,
      site: "linkedin",
      jd: () => first([
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-description__content",
        ".show-more-less-html__markup"
      ]),
      title: () => text(document.querySelector(".job-details-jobs-unified-top-card__job-title, .topcard__title")),
      company: () => text(document.querySelector(".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link"))
    },
    {
      match: /indeed\.com/,
      site: "indeed",
      jd: () => first(['[data-testid="jobDescriptionText"]', "#jobDescriptionText"]),
      title: () => text(document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')),
      company: () => text(document.querySelector('[data-testid="inlineHeader-companyName"]'))
    },
    {
      match: /greenhouse\.io|boards\.greenhouse\.io/,
      site: "greenhouse",
      jd: () => first(["#content", "#main", "div.opening", "div.section--text"]),
      title: () => text(document.querySelector("h1.app-title, h1")),
      company: () => text(document.querySelector(".company-name, .app-company"))
    },
    {
      match: /lever\.co/,
      site: "lever",
      jd: () => first([".content-wrapper.posting-page", ".section-wrapper.page-centered.posting-page", "[data-qa='job-description']"]),
      title: () => text(document.querySelector(".posting-headline h2, h2")),
      company: () => text(document.querySelector(".main-header-text, .company-name"))
    },
    {
      match: /myworkdayjobs\.com|workday\.com/,
      site: "workday",
      jd: () => first(['[data-automation-id="jobPostingDescription"]', "[data-automation-id='job-posting-details']"]),
      title: () => text(document.querySelector('[data-automation-id="jobPostingHeader"]')),
      company: () => location.hostname.split(".")[0]
    },
    {
      match: /ashbyhq\.com|jobs\.ashbyhq\.com/,
      site: "ashby",
      jd: () => first(['div._descriptionText_12ylk_201', "div[class*='descriptionText']", "div[class*='description']"]),
      title: () => text(document.querySelector("h1")),
      company: () => text(document.querySelector("a[class*='companyName'], img[alt]")) || ""
    }
  ];

  const matched = sites.find(s => s.match.test(host));
  if (matched) {
    const t = matched.jd();
    if (t) return { text: t, site: matched.site, title: matched.title(), company: matched.company() };
  }

  // Generic fallback: longest <article>/<main>, else body
  const candidates = [...document.querySelectorAll("article, main, section, div")]
    .map(el => ({ el, len: text(el).length }))
    .filter(c => c.len > 400 && c.len < 20000)
    .sort((a, b) => b.len - a.len);
  const best = candidates[0]?.el;
  return {
    text: best ? text(best) : document.body.innerText.slice(0, 8000),
    site: "generic",
    title: text(document.querySelector("h1")) || document.title,
    company: ""
  };
}
