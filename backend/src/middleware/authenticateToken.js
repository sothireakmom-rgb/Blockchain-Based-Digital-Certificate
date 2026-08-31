const { verifyToken } = require("../lib/jwt");

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success attaches the organization id to `req.organizationId`.
 */
function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
  }

  try {
    const payload = verifyToken(token);
    req.organizationId = payload.sub;
    return next();
  } catch (err) {
    // Distinguish expiry from a bad signature - both are 401, but the
    // client can act differently (refresh vs re-login).
    const expired = err.name === "TokenExpiredError";
    return res.status(401).json({ error: expired ? "Token expired" : "Invalid token" });
  }
}

module.exports = { authenticateToken };
