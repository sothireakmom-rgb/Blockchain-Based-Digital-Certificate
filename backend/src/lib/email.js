const { Resend } = require("resend");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Resend's shared sender works with no domain setup, but only delivers to the
// address that owns the Resend account. Set RESEND_FROM once a domain is verified.
const DEFAULT_FROM = "Certificate Registry <onboarding@resend.dev>";

let client = null;
let warnedMissingKey = false;

/** Lazily constructs the Resend client; returns null when no key is configured. */
function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "RESEND_API_KEY is not set - certificate emails will be skipped."
      );
      warnedMissingKey = true;
    }
    return null;
  }
  if (!client) client = new Resend(key);
  return client;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "No expiry";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildSubject(courseName) {
  return `Your certificate for ${courseName} has been issued`;
}

/** Plain-text alternative, for clients that do not render HTML. */
function buildText({
  recipientName,
  courseName,
  organizationName,
  certificateId,
  verifyUrl,
}) {
  return [
    `Hello ${recipientName},`,
    "",
    `${organizationName} has issued your certificate for ${courseName}.`,
    "",
    `Certificate ID: ${certificateId}`,
    `Verify it here: ${verifyUrl}`,
    "",
    "This certificate is anchored on the Ethereum blockchain, so anyone can",
    "independently confirm it is genuine and has not been altered or revoked.",
    "",
    organizationName,
  ].join("\n");
}

function buildHtml({
  recipientName,
  courseName,
  organizationName,
  certificateId,
  expiryDate,
  verifyUrl,
}) {
  const name = escapeHtml(recipientName);
  const course = escapeHtml(courseName);
  const org = escapeHtml(organizationName);
  const id = escapeHtml(certificateId);
  const url = escapeHtml(verifyUrl);
  const expiry = escapeHtml(formatDate(expiryDate));

  // Table-based layout and inline styles: email clients ignore most CSS.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr><td style="height:5px;background:#0f4c81;"></td></tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Certificate issued</p>
                <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:700;color:#0f172a;">Hello ${name},</h1>
                <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#334155;">
                  <strong style="color:#0f172a;">${org}</strong> has issued your certificate for
                  <strong style="color:#0f172a;">${course}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td style="padding:16px 20px;font-size:14px;color:#64748b;">Certificate ID</td>
                    <td style="padding:16px 20px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;color:#0f172a;text-align:right;">${id}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px 20px;font-size:14px;color:#64748b;">Expires</td>
                    <td style="padding:0 20px 16px 20px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${expiry}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 8px 32px;">
                <a href="${url}" style="display:inline-block;background:#0f4c81;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;">View &amp; verify certificate</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px 32px;">
                <p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;word-break:break-all;">
                  Or paste this link into your browser:<br />
                  <a href="${url}" style="color:#0f4c81;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                  This certificate is anchored on the <strong style="color:#334155;">Ethereum blockchain</strong>.
                  Anyone can independently confirm it is genuine and has not been altered or revoked,
                  without needing to contact ${org}.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">Sent by ${org} via Certificate Registry</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Best-effort notification that a certificate was issued.
 *
 * Never throws: the certificate is already on-chain and in the database by the
 * time this runs, so a mail failure must not affect the issuing result.
 *
 * @returns {Promise<{sent: boolean, skipped?: boolean, id?: string, error?: string}>}
 */
async function sendCertificateIssuedEmail(certificate, organizationName) {
  const resend = getClient();
  if (!resend) return { sent: false, skipped: true, error: "RESEND_API_KEY not set" };

  const verifyUrl = `${FRONTEND_URL}/verify/${certificate.certificateId}`;
  const payload = {
    recipientName: certificate.recipientName,
    courseName: certificate.courseName,
    organizationName,
    certificateId: certificate.certificateId,
    expiryDate: certificate.expiryDate,
    verifyUrl,
  };

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: certificate.recipientEmail,
      subject: buildSubject(certificate.courseName),
      html: buildHtml(payload),
      text: buildText(payload),
    });

    // The SDK reports API-level failures in `error` rather than throwing.
    if (error) {
      return { sent: false, error: error.message || String(error) };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = {
  sendCertificateIssuedEmail,
  buildSubject,
  buildHtml,
  buildText,
};
