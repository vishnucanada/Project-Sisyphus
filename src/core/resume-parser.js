// Parses a markdown resume into a flat sequence of blocks. Only `bullet` blocks
// are sent to the model for rewriting; everything else is preserved verbatim.
// Bullets get a stable index so rewrites can be matched 1:1 to originals.

function parseResume(md) {
  const blocks = [];
  let bulletIndex = 0;

  for (const rawLine of md.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) { blocks.push({ type: "blank" }); continue; }

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      blocks.push({ type: "heading", level: m[1].length, text: m[2] });
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      blocks.push({ type: "bullet", index: bulletIndex++, original: m[1], tailored: null, accepted: true });
    } else if (line.match(/^\*\*[^*]+\*\*/)) {
      blocks.push({ type: "subheading", text: line });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  return blocks;
}

// Sections whose bullets must not be rewritten. They are factual records.
// Skills section IS rewritable per product spec — only Projects/Publications/Education are frozen.
const PROTECTED_SECTIONS = new Set(["projects", "publications", "education"]);

function isProtected(sectionTitle) {
  return PROTECTED_SECTIONS.has((sectionTitle || "").toLowerCase().trim());
}

// Build a grouped view for rewrite calls: each section produces one model call
// with all its bullets together, so the model sees local context (job title etc).
function groupBulletsBySection(blocks) {
  const sections = [];
  let currentTitle = "(top)";
  let currentSubheading = null;
  let currentBullets = [];

  const flush = () => {
    if (currentBullets.length) {
      sections.push({
        section: currentTitle,
        subheading: currentSubheading,
        protected: isProtected(currentTitle),
        bullets: currentBullets
      });
      currentBullets = [];
    }
  };

  for (const b of blocks) {
    if (b.type === "heading" && b.level <= 2) {
      flush(); currentTitle = b.text; currentSubheading = null;
    } else if (b.type === "subheading") {
      flush(); currentSubheading = b.text;
    } else if (b.type === "bullet") {
      currentBullets.push(b);
    }
  }
  flush();
  return sections;
}

// Serialize blocks back to markdown. Uses `tailored` text if accepted, else `original`.
function serializeBlocks(blocks) {
  const lines = [];
  for (const b of blocks) {
    if (b.type === "blank") lines.push("");
    else if (b.type === "heading") lines.push("#".repeat(b.level) + " " + b.text);
    else if (b.type === "subheading") lines.push(b.text);
    else if (b.type === "paragraph") lines.push(b.text);
    else if (b.type === "bullet") {
      const text = (b.accepted && b.tailored) ? b.tailored : b.original;
      lines.push("- " + text);
    }
  }
  return lines.join("\n");
}

window.RESUME_PARSER = { parseResume, groupBulletsBySection, serializeBlocks, isProtected, PROTECTED_SECTIONS };
