const { Router } = require("express");

const router = Router();

// GET /api/health - liveness probe. Deliberately does not touch the database,
// so it still answers while the DB is unreachable.
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

module.exports = router;
