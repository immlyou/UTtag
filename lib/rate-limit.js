/**
 * Minimal in-memory rate limiter for Express.
 *
 * Zero external deps. Sliding-window is not attempted — we use a fixed window
 * keyed by (ip, route) that resets on TTL expiry. Good enough to blunt brute
 * force on login endpoints; NOT a replacement for an edge / reverse-proxy
 * limiter when running multiple Node instances.
 *
 * Usage:
 *   const { rateLimit } = require("../lib/rate-limit");
 *   router.post("/login", rateLimit({ windowMs: 15*60*1000, max: 10 }), handler);
 *
 * On exceed: responds 429 with { error, retry_after_seconds } and does NOT
 * call next(). When skipSuccess is true (default), successful requests
 * (status < 400) don't consume quota — so legitimate users aren't penalised
 * by someone else brute-forcing from the same NAT.
 */

const { getClientIP } = require("./auth-middleware");

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, skipSuccess = true, keyPrefix = "" } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  // Opportunistic GC so a long-running process doesn't grow unbounded.
  let lastGc = Date.now();
  function gc(now) {
    if (now - lastGc < windowMs) return;
    lastGc = now;
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    gc(now);

    const ip = getClientIP(req) || "unknown";
    const key = `${keyPrefix}|${ip}|${req.path}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many requests",
        retry_after_seconds: retryAfter,
      });
    }

    bucket.count += 1;

    if (skipSuccess) {
      // If the handler eventually writes a 2xx/3xx, refund the quota. This
      // keeps legit users behind shared IPs from being penalised by a noisy
      // neighbour — only failed attempts burn budget.
      const origStatus = res.status.bind(res);
      res.status = function(code) {
        if (code < 400 && bucket.count > 0) bucket.count -= 1;
        return origStatus(code);
      };
    }

    next();
  };
}

module.exports = { rateLimit };
