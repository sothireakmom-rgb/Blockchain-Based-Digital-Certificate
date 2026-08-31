const express = require("express");
const cors = require("cors");

const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const certificateRoutes = require("./routes/certificates");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/certificates", certificateRoutes);

// Must stay last: unmatched routes, then the central error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
