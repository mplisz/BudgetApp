// ============================================================
// File: backend/middleware/rateLimiter.js
// Rate limiting configuration for all /api/* endpoints.
//
// Strategy:
//   - Dedicated limiters for auth (refresh, login) — strict
//   - Dedicated limiter for /api/limits — loose (batch upserts)
//   - Cross-cutting writeLimiter — POST/PATCH/PUT/DELETE
//   - Cross-cutting apiLimiter — global last-line-of-defense
//
// All limiters use a custom keyGenerator that strips Azure's
// proxy port from request.ip (express-rate-limit's default
// keyGenerator rejects "ip:port" format).
// ============================================================

const rateLimit = require('express-rate-limit');

// ── Helpers ─────────────────────────────────────────────────

// Extract client IP from req, handling Azure proxy "ip:port" format.
// Azure App Service load balancer adds source port to X-Forwarded-For —
// express-rate-limit's default keyGenerator rejects this. We strip the
// port for IPv4-with-port, leave IPv4 plain and IPv6 alone.
const ipKeyGenerator = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (ip.includes('.') && ip.split(':').length === 2) {
    return ip.split(':')[0];   // IPv4 with port
  }
  return ip;                   // IPv4 plain or IPv6
};

// Paths that have their own dedicated limiter — skip these in
// cross-cutting (write, global) limiters to avoid double-counting.
const hasDedicatedLimiter = (path) =>
  path.startsWith('/auth/') || path.startsWith('/limits');

// Factory — keeps limiters DRY
const createLimiter = (windowMs, maxRequests, baseMessage, extraOptions = {}) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: { error: `${baseMessage}, please try again later.` },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    ...extraOptions,
  });
};

// ── Limiter definitions ─────────────────────────────────────

const refreshLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_REFRESH_WINDOW_MS) || 60 * 1000,
  parseInt(process.env.RATE_LIMIT_REFRESH_MAX)        || 20,
  "Too many refresh attempts",
);

const loginLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_LOGIN_MAX)        || 5,
  "Too many login attempts",
);

const limitsLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS_LIMITS_CONTAINER) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX_LIMITS_CONTAINER)        || 600,
  "Too many requests to limits container",
);

// Tighter limit on POST/PATCH/PUT/DELETE so a spam loop on
// "Add transaction" can't drain the global pool. Read operations
// are unaffected — only mutations count toward this counter.
const writeLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WRITE_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_WRITE_MAX)        || 60,
  "Too many write operations",
  {
    skip: (req) => {
      const method = req.method.toUpperCase();
      return method === "GET" || method === "HEAD" || method === "OPTIONS";
    },
  },
);

const apiLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX)        || 200,
  "Too many requests from this IP",
);

// ── Public API — apply all limiters to an Express app ──────

function applyRateLimiters(app) {
  // 1. Path-specific limiters (no need for skip — Express only invokes
  //    them when the path matches).
  app.use('/api/auth/refresh', refreshLimiter);
  app.use('/api/auth/login',   loginLimiter);
  app.use('/api/limits',       limitsLimiter);

  // 2. Cross-cutting limiters — apply to /api/* but skip paths that
  //    already have a dedicated limiter (to avoid double-counting).
  app.use('/api/', (req, res, next) => {
    if (hasDedicatedLimiter(req.path)) return next();
    return writeLimiter(req, res, next);
  });

  app.use('/api/', (req, res, next) => {
    if (hasDedicatedLimiter(req.path)) return next();
    return apiLimiter(req, res, next);
  });
}

module.exports = { applyRateLimiters };