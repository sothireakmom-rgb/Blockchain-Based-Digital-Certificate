const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Fail fast at boot rather than issuing unsigned/weakly-signed tokens later.
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set - check backend/.env");
}

/** Sign a token whose subject is the organization's id. */
function signToken(organizationId) {
  return jwt.sign({ sub: organizationId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/** Verify a token, throwing if invalid or expired. */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
