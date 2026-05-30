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
// ============================================================

const rateLimit = require('express-rate-limit');

// ── Helpers ─────────────────────────────────────────────────

/*express-rate-limit 8.x exports an `ipKeyGenerator` helper that handles
 IPv4-with-port (Azure proxy format), plain IPv4, and IPv6 (with /64
 masking to prevent abuse). Use it directly — safer than custom logic.
*/
const { ipKeyGenerator } = require('express-rate-limit');

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