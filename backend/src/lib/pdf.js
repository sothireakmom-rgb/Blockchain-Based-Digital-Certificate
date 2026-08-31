const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// Where generated PDFs are cached. Gitignored - they can always be regenerated
// from the database row, so nothing is lost if the directory is cleared.
const PDF_DIR = path.join(__dirname, "..", "..", "storage", "pdfs");

// Placeholder frontend origin; swap for the real one once the UI is deployed.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const COLORS = {
  ink: "#1a2332",
  muted: "#5b6b7f",
  accent: "#0f4c81",
  gold: "#b08d33",
  rule: "#c8d2dd",
};

function ensurePdfDir() {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  return PDF_DIR;
}

function pdfPathFor(certificateId) {
  // certificateId is generated server-side as CERT-YYYY-XXXXXX, but sanitise
  // anyway so a crafted id can never escape the storage directory.
  const safe = String(certificateId).replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(PDF_DIR, `${safe}.pdf`);
}

function verificationUrl(certificateId) {
  return `${FRONTEND_URL}/verify/${certificateId}`;
}

function formatDate(value) {
  if (!value) return "No Expiry";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Renders the certificate to a PDF on disk and returns its path.
 * Layout is A4 landscape: a double border, a centred title block, the
 * recipient's name as the focal point, a details row, and a QR code
 * bottom-right that resolves to the public verification page.
 */
async function generateCertificatePdf(certificate, organizationName) {
  ensurePdfDir();
  const filePath = pdfPathFor(certificate.certificateId);
  const url = verificationUrl(certificate.certificateId);

  // QR as a PNG buffer, embedded directly into the page.
  const qrPng = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#1a2332", light: "#ffffff" },
  });

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: {
      Title: `Certificate ${certificate.certificateId}`,
      Author: organizationName || "Certificate Authority",
      Subject: certificate.courseName,
    },
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const W = doc.page.width; // 841.89
  const H = doc.page.height; // 595.28

  // --- Background and double border -------------------------------------
  doc.rect(0, 0, W, H).fill("#ffffff");
  doc.lineWidth(3).strokeColor(COLORS.accent).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1).strokeColor(COLORS.gold).rect(34, 34, W - 68, H - 68).stroke();

  // Small corner accents on the inner frame.
  const corner = 18;
  doc.lineWidth(2).strokeColor(COLORS.gold);
  [
    [34, 34, 1, 1],
    [W - 34, 34, -1, 1],
    [34, H - 34, 1, -1],
    [W - 34, H - 34, -1, -1],
  ].forEach(([x, y, dx, dy]) => {
    doc.moveTo(x, y + dy * corner).lineTo(x, y).lineTo(x + dx * corner, y).stroke();
  });

  // --- Title block -------------------------------------------------------
  doc
    .font("Helvetica-Bold")
    .fontSize(34)
    .fillColor(COLORS.accent)
    .text("CERTIFICATE", 0, 78, { align: "center", characterSpacing: 6 });

  doc
    .font("Helvetica")
    .fontSize(13)
    .fillColor(COLORS.muted)
    .text("OF COMPLETION", 0, 120, { align: "center", characterSpacing: 4 });

  // Divider under the title.
  doc
    .lineWidth(1)
    .strokeColor(COLORS.gold)
    .moveTo(W / 2 - 70, 146)
    .lineTo(W / 2 + 70, 146)
    .stroke();

  // --- Recipient ---------------------------------------------------------
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(COLORS.muted)
    .text("This is to certify that", 0, 172, { align: "center" });

  doc
    .font("Helvetica-Bold")
    .fontSize(38)
    .fillColor(COLORS.ink)
    .text(certificate.recipientName, 60, 198, { align: "center", width: W - 120 });

  // Rule under the name.
  doc
    .lineWidth(0.75)
    .strokeColor(COLORS.rule)
    .moveTo(W / 2 - 190, 250)
    .lineTo(W / 2 + 190, 250)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(COLORS.muted)
    .text("has successfully completed", 0, 266, { align: "center" });

  doc
    .font("Helvetica-Bold")
    .fontSize(21)
    .fillColor(COLORS.accent)
    .text(certificate.courseName, 60, 290, { align: "center", width: W - 120 });

  // --- Details row (left) ------------------------------------------------
  const detailsTop = 372;
  const labelSize = 8.5;
  const valueSize = 11.5;

  const details = [
    ["ISSUE DATE", formatDate(certificate.issueDate)],
    ["EXPIRY DATE", certificate.expiryDate ? formatDate(certificate.expiryDate) : "No Expiry"],
    ["CERTIFICATE ID", certificate.certificateId],
  ];

  details.forEach(([label, value], i) => {
    const y = detailsTop + i * 40;
    doc
      .font("Helvetica")
      .fontSize(labelSize)
      .fillColor(COLORS.muted)
      .text(label, 78, y, { characterSpacing: 1.4 });
    doc
      .font("Helvetica-Bold")
      .fontSize(valueSize)
      .fillColor(COLORS.ink)
      .text(value, 78, y + 13);
  });

  // --- Issuer signature block (centre-left) ------------------------------
  doc
    .lineWidth(0.75)
    .strokeColor(COLORS.ink)
    .moveTo(360, 470)
    .lineTo(560, 470)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(organizationName || "Issuing Organization", 360, 478, {
      width: 200,
      align: "center",
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text("ISSUING ORGANIZATION", 360, 494, {
      width: 200,
      align: "center",
      characterSpacing: 1.2,
    });

  // --- QR code (bottom-right) -------------------------------------------
  const qrSize = 104;
  const qrX = W - 78 - qrSize;
  const qrY = 372;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("SCAN TO VERIFY", qrX, qrY + qrSize + 7, {
      width: qrSize,
      align: "center",
      characterSpacing: 1,
    });

  // --- Footer ------------------------------------------------------------
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(
      `Anchored on Ethereum Sepolia  -  tx ${certificate.txHash}`,
      60,
      H - 62,
      { width: W - 120, align: "center" }
    );
  doc
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(url, 60, H - 50, { width: W - 120, align: "center" });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return filePath;
}

module.exports = {
  PDF_DIR,
  generateCertificatePdf,
  pdfPathFor,
  verificationUrl,
};
