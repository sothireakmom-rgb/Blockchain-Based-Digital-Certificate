const { Router } = require("express");
const { z } = require("zod");
const crypto = require("node:crypto");

const fs = require("node:fs");

const { prisma } = require("../lib/prisma");
const { getContract, toBytes32Id, computeDataHash } = require("../lib/contract");
const { generateCertificatePdf, pdfPathFor, verificationUrl } = require("../lib/pdf");
const { sendCertificateIssuedEmail } = require("../lib/email");
const { authenticateToken } = require("../middleware/authenticateToken");
const { asyncHandler } = require("../middleware/errorHandler");

const router = Router();

// Confirmations to wait for before trusting the transaction.
const CONFIRMATIONS = 1;

const createSchema = z.object({
  recipientName: z.string().trim().min(1, "recipientName is required"),
  recipientEmail: z.string().trim().toLowerCase().email("a valid recipientEmail is required"),
  courseName: z.string().trim().min(1, "courseName is required"),
  // Accepts an ISO date string, or null/omitted for "never expires".
  expiryDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: "expiryDate must be an ISO date string or null",
    }),
});

function validationResponse(res, error) {
  return res.status(400).json({
    error: "Validation failed",
    details: error.issues.map((i) => ({
      field: i.path.join(".") || "(body)",
      message: i.message,
    })),
  });
}

/** "CERT-2026-7F3A9C" - human readable, with 6 hex chars of randomness. */
function generateCertificateId() {
  const year = new Date().getFullYear();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CERT-${year}-${suffix}`;
}

/** Generates an id that is not already taken, retrying on the tiny chance of a clash. */
async function generateUniqueCertificateId(attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = generateCertificateId();
    const clash = await prisma.certificate.findUnique({
      where: { certificateId: candidate },
    });
    if (!clash) return candidate;
  }
  throw new Error("Could not generate a unique certificateId");
}

function publicCertificate(c) {
  return {
    id: c.id,
    certificateId: c.certificateId,
    recipientName: c.recipientName,
    recipientEmail: c.recipientEmail,
    courseName: c.courseName,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    status: c.status,
    dataHash: c.dataHash,
    txHash: c.txHash,
    organizationId: c.organizationId,
    createdAt: c.createdAt,
  };
}

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

/**
 * GET /api/certificates/verify/:certificateId   (PUBLIC - no auth)
 *
 * The endpoint the QR code leads to. Reads the off-chain record for the human
 * details, then asks the contract directly for the authoritative status, so a
 * tampered or stale database row cannot make a revoked certificate look valid.
 *
 * Deliberately omits recipientEmail: this response is world-readable.
 */
router.get(
  "/verify/:certificateId",
  asyncHandler(async (req, res) => {
    const { certificateId } = req.params;

    const certificate = await prisma.certificate.findUnique({
      where: { certificateId },
      include: { organization: { select: { name: true } } },
    });

    if (!certificate) {
      return res.status(404).json({
        found: false,
        error: "No certificate exists with that ID",
        certificateId,
      });
    }

    // Authoritative status comes from the chain, not the database.
    let onChain = { found: false };
    try {
      const { contract } = getContract();
      const result = await contract.verifyCertificate(toBytes32Id(certificateId));
      onChain = {
        found: true,
        status: result.status,
        revoked: result.revoked,
        dataHash: result.dataHash,
        issueDate: new Date(Number(result.issueDate) * 1000).toISOString(),
        expiryTimestamp: Number(result.expiryTimestamp),
        // If these disagree the off-chain record was altered after issuing.
        dataHashMatches: result.dataHash === certificate.dataHash,
      };
    } catch (err) {
      onChain = {
        found: false,
        error: err.shortMessage || err.reason || "Certificate not found on-chain",
      };
    }

    return res.json({
      found: true,
      certificateId: certificate.certificateId,
      recipientName: certificate.recipientName,
      courseName: certificate.courseName,
      issueDate: certificate.issueDate,
      expiryDate: certificate.expiryDate,
      organizationName: certificate.organization.name,
      dataHash: certificate.dataHash,
      txHash: certificate.txHash,
      // On-chain wins; fall back to the stored value only if the chain is unreachable.
      status: onChain.found ? onChain.status : certificate.status,
      statusSource: onChain.found ? "blockchain" : "database",
      onChain,
      explorerUrl: `${SEPOLIA_EXPLORER}/tx/${certificate.txHash}`,
    });
  })
);

/**
 * POST /api/certificates  (protected)
 *
 * Anchors the certificate on-chain FIRST, then records it in the database.
 * If the chain call fails nothing is written, so there is never a database
 * row claiming an on-chain anchor that does not exist.
 */
router.post(
  "/",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationResponse(res, parsed.error);

    const { recipientName, recipientEmail, courseName, expiryDate } = parsed.data;

    const issueDate = new Date();
    const expiry = expiryDate ? new Date(expiryDate) : null;

    if (expiry && expiry.getTime() <= Date.now()) {
      return res
        .status(400)
        .json({ error: "expiryDate must be in the future, or null for no expiry" });
    }

    // 1. Unique human-readable id.
    const certificateId = await generateUniqueCertificateId();

    // 2. Hash of the core data - this is what goes on-chain.
    const dataHash = computeDataHash({ recipientName, courseName, issueDate, expiryDate: expiry });

    // 3. Send the transaction. 0 means "never expires" in the contract.
    const expiryTimestamp = expiry ? Math.floor(expiry.getTime() / 1000) : 0;

    let receipt;
    try {
      const { contract } = getContract();
      const tx = await contract.issueCertificate(
        toBytes32Id(certificateId),
        dataHash,
        expiryTimestamp
      );
      // 4. Wait for confirmation before touching the database.
      receipt = await tx.wait(CONFIRMATIONS);
      if (!receipt || receipt.status !== 1) {
        return res.status(502).json({
          error: "Blockchain transaction failed",
          txHash: tx.hash,
        });
      }
    } catch (err) {
      // Surface the contract's own revert reason when there is one.
      const reason = err.shortMessage || err.reason || err.message;
      return res.status(502).json({
        error: "Failed to issue certificate on-chain - nothing was saved",
        detail: reason,
      });
    }

    // 5. Persist only after the chain confirms.
    try {
      const certificate = await prisma.certificate.create({
        data: {
          certificateId,
          recipientName,
          recipientEmail,
          courseName,
          issueDate,
          expiryDate: expiry,
          status: "Valid",
          dataHash,
          txHash: receipt.hash,
          organizationId: req.organizationId,
        },
        include: { organization: { select: { name: true } } },
      });

      // PDF generation is best-effort: the certificate is already anchored and
      // saved, and the PDF can be regenerated on demand by the download route.
      let pdfGenerated = true;
      try {
        await generateCertificatePdf(certificate, certificate.organization.name);
      } catch (err) {
        pdfGenerated = false;
        console.error(`PDF generation failed for ${certificateId}:`, err);
      }

      // Email is best-effort for the same reason. sendCertificateIssuedEmail
      // never throws, but guard anyway so nothing here can break issuing.
      let email = { sent: false };
      try {
        email = await sendCertificateIssuedEmail(
          certificate,
          certificate.organization.name
        );
        if (email.sent) {
          // Log the Resend message id so a delivery can be traced later.
          console.log(`Email accepted for ${certificateId}: resend id ${email.id}`);
        } else if (!email.skipped) {
          console.error(`Email failed for ${certificateId}: ${email.error}`);
        }
      } catch (err) {
        email = { sent: false, error: err.message };
        console.error(`Email threw for ${certificateId}:`, err);
      }

      return res.status(201).json({
        certificate: publicCertificate(certificate),
        blockNumber: receipt.blockNumber,
        pdfGenerated,
        emailSent: email.sent,
        emailSkipped: Boolean(email.skipped),
        emailId: email.id,
        emailError: email.sent ? undefined : email.error,
        pdfUrl: `/api/certificates/${certificateId}/pdf`,
        verificationUrl: verificationUrl(certificateId),
      });
    } catch (err) {
      // The chain write succeeded but the database write did not. Report the
      // txHash so the record can be reconciled rather than silently lost.
      console.error("DB write failed after successful on-chain issue:", err);
      return res.status(500).json({
        error:
          "Certificate was issued on-chain but could not be saved. Reconcile using the transaction hash.",
        certificateId,
        txHash: receipt.hash,
      });
    }
  })
);

/**
 * GET /api/certificates  (protected)
 * All certificates belonging to the authenticated organization.
 */
router.get(
  "/",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const certificates = await prisma.certificate.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      count: certificates.length,
      certificates: certificates.map(publicCertificate),
    });
  })
);

/**
 * POST /api/certificates/:certificateId/revoke  (protected)
 *
 * Revokes on-chain first, then marks the database row. Same ordering as
 * issuing: the chain is the source of truth, so the row is only updated once
 * the revocation is actually confirmed.
 */
router.post(
  "/:certificateId/revoke",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { certificateId } = req.params;

    // Scoped to the caller's org, so one org cannot revoke another's.
    const certificate = await prisma.certificate.findFirst({
      where: { certificateId, organizationId: req.organizationId },
    });

    if (!certificate) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    if (certificate.status === "Revoked") {
      return res.status(409).json({
        error: "This certificate has already been revoked",
        certificateId,
        status: "Revoked",
      });
    }

    let receipt;
    try {
      const { contract } = getContract();
      const tx = await contract.revokeCertificate(toBytes32Id(certificateId));
      receipt = await tx.wait(CONFIRMATIONS);
      if (!receipt || receipt.status !== 1) {
        return res.status(502).json({
          error: "Revocation transaction failed",
          txHash: tx.hash,
        });
      }
    } catch (err) {
      const reason = err.shortMessage || err.reason || err.message || "";

      // The contract already considers it revoked while our row says otherwise:
      // reconcile the row rather than leaving the two permanently disagreeing.
      if (/CertificateAlreadyRevoked/i.test(reason)) {
        await prisma.certificate.update({
          where: { id: certificate.id },
          data: { status: "Revoked" },
        });
        return res.status(409).json({
          error: "This certificate has already been revoked",
          certificateId,
          status: "Revoked",
        });
      }

      return res.status(502).json({
        error: "Failed to revoke on-chain - nothing was changed",
        detail: reason,
      });
    }

    const updated = await prisma.certificate.update({
      where: { id: certificate.id },
      data: { status: "Revoked" },
    });

    return res.json({
      certificate: publicCertificate(updated),
      revokeTxHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });
  })
);

/**
 * GET /api/certificates/:certificateId/pdf  (protected)
 *
 * Streams the certificate PDF. Scoped to the authenticated organization, so
 * one org cannot download another's certificates. Regenerates the file if the
 * cached copy is missing, since storage/ is disposable.
 */
router.get(
  "/:certificateId/pdf",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { certificateId } = req.params;

    const certificate = await prisma.certificate.findFirst({
      where: { certificateId, organizationId: req.organizationId },
      include: { organization: { select: { name: true } } },
    });

    if (!certificate) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    let filePath = pdfPathFor(certificateId);
    if (!fs.existsSync(filePath)) {
      filePath = await generateCertificatePdf(certificate, certificate.organization.name);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${certificateId}.pdf"`
    );
    return res.sendFile(filePath);
  })
);

module.exports = router;
