// Minimal in-memory rate limiter to avoid extra dependency overhead.
// Default: 120 requests / 60s per IP.
function createRateLimiter({
  windowMs = 60_000,
  max = 120,
  keyGenerator = (req) => String(req.ip || "unknown"),
  message = "Too many requests. Please try again shortly.",
} = {}) {
  const buckets = new Map();
  let lastSweepAt = Date.now();
  const sweepIntervalMs = Math.max(windowMs, 30_000);

  const sweepExpiredBuckets = (now) => {
    if (now - lastSweepAt < sweepIntervalMs) return;
    for (const [key, bucket] of buckets.entries()) {
      if (now > bucket.resetAt) {
        buckets.delete(key);
      }
    }
    lastSweepAt = now;
  };

  return function rateLimiter(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    sweepExpiredBuckets(now);
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        requestId: req.requestId || null,
      });
    }

    bucket.count += 1;
    return next();
  };
}

module.exports = { createRateLimiter };
