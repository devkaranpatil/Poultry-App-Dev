const crypto = require("crypto");

function requestMeta(req, res, next) {
  // Only trust a caller-supplied id if it is short and log-safe.
  const incomingId = String(req.headers["x-request-id"] || "");
  const requestId = /^[A-Za-z0-9._-]{1,128}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const start = process.hrtime.bigint();

  req.requestId = String(requestId);
  req.requestStart = start;
  res.setHeader("x-request-id", req.requestId);

  const originalEnd = res.end;
  res.end = function patchedEnd(...args) {
    try {
      const durationMs = Number((process.hrtime.bigint() - start) / BigInt(1e6));
      res.setHeader("x-response-time-ms", String(durationMs));
    } catch {
      // Ignore header timing errors.
    }
    return originalEnd.apply(this, args);
  };

  res.on("finish", () => {
    try {
      const durationMs = Number((process.hrtime.bigint() - start) / BigInt(1e6));
      const method = req.method;
      const path = req.originalUrl;
      const status = res.statusCode;
      if (process.env.NODE_ENV !== "test") {
        // Lightweight structured log without external logger dependency.
        console.log(
          JSON.stringify({
            level: "info",
            type: "http",
            requestId: req.requestId,
            method,
            path,
            status,
            durationMs,
            timestamp: new Date().toISOString(),
          })
        );
      }
    } catch {
      // Ignore logging errors.
    }
  });

  next();
}

module.exports = { requestMeta };
