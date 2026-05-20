// Opens a styled HTML preview of the resume in a new tab. Same function works
// in dev.html (file://) and the extension side panel.

function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function inline(text) {
  // **bold** → <strong>...</strong>; everything else is plain.
  let out = "", i = 0;
  while (i < text.length) {
    const start = text.indexOf("**", i);
    if (start === -1) { out += esc(text.slice(i)); break; }
    out += esc(text.slice(i, start));
    const end = text.indexOf("**", start + 2);
    if (end === -1) { out += esc(text.slice(start)); break; }
    out += "<strong>" + esc(text.slice(start + 2, end)) + "</strong>";
    i = end + 2;
  }
  return out;
}

function bulletText(b) {
  return (b.accepted && b.tailored) ? b.tailored : b.original;
}

function blocksToBodyHTML(blocks) {
  const parts = [];
  let inList = false;
  const closeList = () => { if (inList) { parts.push("</ul>"); inList = false; } };

  for (const b of blocks) {
    if (b.type === "bullet") {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${inline(bulletText(b))}</li>`);
      continue;
    }
    closeList();
    if (b.type === "blank") { /* skip explicit blanks; CSS handles spacing */ }
    else if (b.type === "heading" && b.level === 1) parts.push(`<h1>${inline(b.text)}</h1>`);
    else if (b.type === "heading") parts.push(`<h2>${inline(b.text)}</h2>`);
    else if (b.type === "subheading") parts.push(`<p class="sub">${inline(b.text)}</p>`);
    else if (b.type === "paragraph") parts.push(`<p>${inline(b.text)}</p>`);
  }
  closeList();
  return parts.join("\n");
}

const PREVIEW_CSS = `
  :root { color-scheme: light; }
  body { font: 13px/1.45 "Times New Roman", Georgia, serif; max-width: 720px; margin: 32px auto; padding: 0 32px; color: #111; background: #fff; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 4px; letter-spacing: 0.5px; }
  h1 + p { text-align: center; color: #555; font-size: 12px; margin: 0 0 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; border-bottom: 1px solid #888; padding-bottom: 2px; margin: 14px 0 6px; }
  .sub { margin: 6px 0 2px; }
  ul { margin: 2px 0 6px 18px; padding: 0; }
  li { margin: 2px 0; }
  p { margin: 4px 0; }
  @media print { body { margin: 0; padding: 24px; } }
`;

function generatePreviewHTML(blocks, title = "Resume preview") {
  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>${PREVIEW_CSS}</style>
</head><body>
${blocksToBodyHTML(blocks)}
</body></html>`;
}

function openPreview(blocks, title) {
  const html = generatePreviewHTML(blocks, title);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  // Chrome extension side panels can't use window.open reliably; use chrome.tabs if available.
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank");
  }
}

window.PREVIEW = { openPreview, generatePreviewHTML };
