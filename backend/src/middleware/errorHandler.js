/** Wraps an async route handler so rejected promises reach the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Fallback for unmatched routes. */
function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

/** Central error handler. Never leaks internals to the client. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: err.expose ? err.message : "Internal server error" });
}

module.exports = { asyncHandler, notFound, errorHandler };
