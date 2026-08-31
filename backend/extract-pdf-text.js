/**
 * Extracts visible text from a PDF produced by pdfkit.
 *
 *   node extract-pdf-text.js <path-to.pdf>
 *
 * pdfkit emits text as hex strings inside TJ arrays with kerning numbers
 * between them, e.g.  [<434552> 20 <544946494341> 90 <5445> 0] TJ
 * so the hex runs have to be decoded and joined per text block.
 */
const fs = require("node:fs");
const zlib = require("node:zlib");
const { PDFDocument, PDFRawStream, PDFName } = require("pdf-lib");

function contentStreams(doc) {
  let out = "";
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return;
    // Content streams have no /Subtype; images and fonts do.
    if (obj.dict.get(PDFName.of("Subtype"))) return;
    try {
      out += zlib.inflateSync(Buffer.from(obj.contents)).toString("latin1");
    } catch {
      /* not deflate-encoded; skip */
    }
  });
  return out;
}

function extractText(pdfBytes) {
  return PDFDocument.load(pdfBytes).then((doc) => {
    const stream = contentStreams(doc);
    const lines = [];

    // Each TJ array is one run of text.
    const tjArrays = stream.match(/\[[^\]]*\]\s*TJ/g) || [];
    for (const arr of tjArrays) {
      const hexRuns = arr.match(/<[0-9A-Fa-f]*>/g) || [];
      let text = "";
      for (const run of hexRuns) {
        const hex = run.slice(1, -1);
        for (let i = 0; i + 1 < hex.length; i += 2) {
          text += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
      }
      if (text.trim()) lines.push(text);
    }
    return lines;
  });
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node extract-pdf-text.js <path-to.pdf>");
    process.exit(1);
  }
  extractText(fs.readFileSync(target))
    .then((lines) => lines.forEach((l) => console.log(l)))
    .catch((e) => {
      console.error("ERR:", e.message);
      process.exit(1);
    });
}

module.exports = { extractText };
