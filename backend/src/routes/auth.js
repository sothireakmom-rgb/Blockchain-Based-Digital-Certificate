const { Router } = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");

const { prisma } = require("../lib/prisma");
const { signToken } = require("../lib/jwt");
const { authenticateToken } = require("../middleware/authenticateToken");
const { asyncHandler } = require("../middleware/errorHandler");

const router = Router();

const BCRYPT_ROUNDS = 12;

const registerSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().toLowerCase().email("a valid email is required"),
  password: z.string().min(8, "password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("a valid email is required"),
  password: z.string().min(1, "password is required"),
});

/** Shape returned to clients. Deliberately omits passwordHash. */
function publicOrganization(org) {
  return {
    id: org.id,
    name: org.name,
    email: org.email,
    createdAt: org.createdAt,
  };
}

/** Turns a zod failure into a 400 with per-field messages. */
function validationResponse(res, error) {
  return res.status(400).json({
    error: "Validation failed",
    details: error.issues.map((i) => ({
      field: i.path.join(".") || "(body)",
      message: i.message,
    })),
  });
}

/**
 * POST /api/auth/register
 * Creates an organization and returns a JWT alongside its public fields.
 */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationResponse(res, parsed.error);

    const { name, email, password } = parsed.data;

    // Friendly duplicate check. The unique constraint below is still the
    // real guard, since two concurrent requests can both pass this.
    const existing = await prisma.organization.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An organization with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let organization;
    try {
      organization = await prisma.organization.create({
        data: { name, email, passwordHash },
      });
    } catch (err) {
      // P2002 = unique constraint violation (lost the race above).
      if (err.code === "P2002") {
        return res.status(409).json({ error: "An organization with that email already exists" });
      }
      throw err;
    }

    return res.status(201).json({
      token: signToken(organization.id),
      organization: publicOrganization(organization),
    });
  })
);

/**
 * POST /api/auth/login
 * Verifies credentials and returns a JWT. 401 on any failure.
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationResponse(res, parsed.error);

    const { email, password } = parsed.data;

    const organization = await prisma.organization.findUnique({ where: { email } });

    // Same generic message and a hash comparison either way, so the response
    // does not reveal whether the email exists.
    const passwordOk = organization
      ? await bcrypt.compare(password, organization.passwordHash)
      : await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");

    if (!organization || !passwordOk) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      token: signToken(organization.id),
      organization: publicOrganization(organization),
    });
  })
);

/**
 * GET /api/auth/me  (protected)
 * Returns the organization identified by the bearer token.
 */
router.get(
  "/me",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({
      where: { id: req.organizationId },
    });

    // Token was valid but the org has since been deleted.
    if (!organization) {
      return res.status(401).json({ error: "Organization no longer exists" });
    }

    return res.json({ organization: publicOrganization(organization) });
  })
);

module.exports = router;
