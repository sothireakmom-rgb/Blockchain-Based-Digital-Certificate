/**
 * Tests the certificate email without needing a Resend key.
 *
 *   node test-email.js
 *
 * Covers the two paths that must never break issuing (no key configured, and
 * a rejected key), and renders the template to email-preview.html so the
 * layout can be eyeballed in a browser.
 */
require("dotenv").config();
const fs = require("node:fs");

const {
  sendCertificateIssuedEmail,
  buildSubject,
  buildHtml,
  buildText,
} = require("./src/lib/email");

const CERT = {
  certificateId: "CERT-2026-A1B2C3",
  recipientName: "Ada Lovelace",
  recipientEmail: "ada@example.com",
  courseName: "BSc Computer Science",
  expiryDate: null,
};
const ORG = "Ashcombe Institute";

let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) {
    console.log(`  PASS  ${label} ${extra}`);
    pass += 1;
  } else {
    console.log(`  FAIL  ${label} ${extra}`);
    fail += 1;
  }
}

(async () => {
  console.log("== 1. Subject line ==");
  const subject = buildSubject(CERT.courseName);
  console.log(`  "${subject}"`);
  check(
    "matches the required format",
    subject === "Your certificate for BSc Computer Science has been issued"
  );

  console.log("\n== 2. HTML body contains everything required ==");
  const html = buildHtml({
    ...CERT,
    organizationName: ORG,
    verifyUrl: `http://localhost:3000/verify/${CERT.certificateId}`,
  });
  const required = [
    ["recipient name", "Ada Lovelace"],
    ["course name", "BSc Computer Science"],
    ["issuing organization", ORG],
    ["certificate ID", "CERT-2026-A1B2C3"],
    ["verification link", "http://localhost:3000/verify/CERT-2026-A1B2C3"],
    ["blockchain note", "Ethereum blockchain"],
  ];
  for (const [label, needle] of required) {
    check(`includes ${label}`, html.includes(needle));
  }
  check("is a complete HTML document", html.trimStart().startsWith("<!doctype html>"));

  console.log("\n== 3. Plain-text alternative ==");
  const text = buildText({
    ...CERT,
    organizationName: ORG,
    verifyUrl: `http://localhost:3000/verify/${CERT.certificateId}`,
  });
  check("text part includes the verify URL", text.includes("/verify/CERT-2026-A1B2C3"));
  check("text part names the organization", text.includes(ORG));

  console.log("\n== 4. HTML escaping (injection safety) ==");
  const nasty = buildHtml({
    recipientName: '<script>alert("xss")</script>',
    courseName: "Safe & Sound",
    organizationName: ORG,
    certificateId: "CERT-2026-XSS001",
    expiryDate: null,
    verifyUrl: "http://localhost:3000/verify/CERT-2026-XSS001",
  });
  check("script tag is escaped", !nasty.includes("<script>alert"));
  check("ampersand is escaped", nasty.includes("Safe &amp; Sound"));

  console.log("\n== 5. No API key: skips cleanly, never throws ==");
  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const skipped = await sendCertificateIssuedEmail(CERT, ORG);
  console.log("  result:", JSON.stringify(skipped));
  check("returns sent:false", skipped.sent === false);
  check("flags itself as skipped", skipped.skipped === true);
  if (savedKey) process.env.RESEND_API_KEY = savedKey;

  console.log("\n== 6. Invalid API key: fails softly, never throws ==");
  process.env.RESEND_API_KEY = "re_invalid_key_for_testing_00000000";
  let threw = false;
  let result;
  try {
    result = await sendCertificateIssuedEmail(CERT, ORG);
  } catch (e) {
    threw = true;
    result = { error: e.message };
  }
  console.log("  result:", JSON.stringify(result));
  check("did not throw", !threw);
  check("returns sent:false", result && result.sent === false);
  check("reports an error message", Boolean(result && result.error));
  if (savedKey) process.env.RESEND_API_KEY = savedKey;
  else delete process.env.RESEND_API_KEY;

  fs.writeFileSync("email-preview.html", html);
  console.log("\n  wrote email-preview.html for visual inspection");

  console.log("\n================================");
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log("================================");
  process.exit(fail ? 1 : 0);
})();
