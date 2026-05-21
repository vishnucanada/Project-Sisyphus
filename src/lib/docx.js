// Markdown resume → .docx download. Uses the `docx` library from esm.run.
// Handles the subset we generate: heading1/2, subheading bold lines, paragraphs, bullets.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType
} from "../../vendor/docx.mjs";

function runsFromInline(text) {
  // Parse **bold** markers; everything else is plain.
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("**", i);
    if (start === -1) { parts.push({ text: text.slice(i), bold: false }); break; }
    if (start > i) parts.push({ text: text.slice(i, start), bold: false });
    const end = text.indexOf("**", start + 2);
    if (end === -1) { parts.push({ text: text.slice(start), bold: false }); break; }
    parts.push({ text: text.slice(start + 2, end), bold: true });
    i = end + 2;
  }
  return parts.map(p => new TextRun({ text: p.text, bold: p.bold, size: 22 }));
}

function blocksToParagraphs(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "blank") { out.push(new Paragraph({ children: [new TextRun("")] })); continue; }
    if (b.type === "heading" && b.level === 1) {
      out.push(new Paragraph({
        children: [new TextRun({ text: b.text, bold: true, size: 32 })],
        alignment: AlignmentType.CENTER
      }));
    } else if (b.type === "heading" && b.level === 2) {
      out.push(new Paragraph({
        children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 24 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 }
      }));
    } else if (b.type === "subheading") {
      out.push(new Paragraph({ children: runsFromInline(b.text), spacing: { before: 120 } }));
    } else if (b.type === "paragraph") {
      out.push(new Paragraph({ children: runsFromInline(b.text) }));
    } else if (b.type === "bullet") {
      const text = (b.accepted && b.tailored) ? b.tailored : b.original;
      out.push(new Paragraph({ children: runsFromInline(text), bullet: { level: 0 } }));
    }
  }
  return out;
}

async function downloadDocx(blocks, filename = "resume.docx") {
  const doc = new Document({
    sections: [{ properties: {}, children: blocksToParagraphs(blocks) }]
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

window.DOCX_EXPORT = { downloadDocx };
window.dispatchEvent(new Event("docx-ready"));
