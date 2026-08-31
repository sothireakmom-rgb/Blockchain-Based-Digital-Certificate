/**
 * Extracts the QR code image embedded in a certificate PDF and decodes it.
 *
 *   node decode-pdf-qr.js <path-to.pdf>
 *
 * Proves the QR that actually shipped inside the PDF is machine-readable,
 * rather than only checking the buffer we passed to the PDF writer.
 */
const fs = require("node:fs");
const zlib = require("node:zlib");
const { PDFDocument, PDFRawStream, PDFName } = require("pdf-lib");
const jsQR = require("jsqr");

async function decodeQrFromPdf(pdfPath) {
  const doc = await PDFDocument.load(fs.readFileSync(pdfPath));

  const images = [];
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return;
    const dict = obj.dict;
    const subtype = dict.get(PDFName.of("Subtype"));
    if (!subtype || subtype.toString() !== "/Image") return;
    images.push({
      width: Number(dict.get(PDFName.of("Width")).toString()),
      height: Number(dict.get(PDFName.of("Height")).toString()),
      colorSpace: String(dict.get(PDFName.of("ColorSpace"))),
      contents: obj.contents,
    });
  });

  for (const img of images) {
    // pdfkit stores RGBA PNGs as an RGB image plus a grayscale SMask; the
    // RGB one carries the QR modules.
    if (img.colorSpace !== "/DeviceRGB") continue;

    const raw = zlib.inflateSync(Buffer.from(img.contents));
    const { width, height } = img;
    const expected = width * height * 3;
    if (raw.length !== expected) {
      throw new Error(`unexpected pixel data: got ${raw.length}, expected ${expected}`);
    }

    // jsQR wants RGBA.
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
      rgba[j] = raw[i];
      rgba[j + 1] = raw[i + 1];
      rgba[j + 2] = raw[i + 2];
      rgba[j + 3] = 255;
    }

    const result = jsQR(rgba, width, height);
    if (result) return { text: result.data, width, height };
  }

  return null;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node decode-pdf-qr.js <path-to.pdf>");
    process.exit(1);
  }
  decodeQrFromPdf(target)
    .then((r) => {
      if (!r) {
        console.error("NO QR DECODED");
        process.exit(1);
      }
      console.log(r.text);
    })
    .catch((e) => {
      console.error("ERR:", e.message);
      process.exit(1);
    });
}

module.exports = { decodeQrFromPdf };
