// ============================================================
// File: backend/server.js
// Main entry point - Server Configuration
// ============================================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const categoriesRoutes = require('./routes/categories');
const authRoutes = require('./routes/auth');
const tagsRoutes = require('./routes/tags');
const settingsRoutes = require('./routes/settings');
const transactionsRoutes = require ('./routes/transactions')
const monthsRoutes       = require('./routes/months');
const vouchersRoutes = require('./routes/vouchers');
const limitsRoutes = require('./routes/limits');
const recurringRoutes = require("./routes/recurring");
const plannedRoutes = require("./routes/planned");


const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// 1. Helmet — with explicit CSP.
//
// Why this matters: helmet()'s default CSP allows only `default-src 'self'`,
// which BLOCKS direct browser fetches to api.nbp.pl and Google OAuth pop-ups.
// The PanelSafetyNet (and TransactionForm, PlannedForm, RecurringForm)
// rely on NBP rates being fetched from the browser, so we must whitelist:
//
//   - api.nbp.pl                 → currency rate lookups (useCurrencyConverter)
//   - accounts.google.com        → @react-oauth/google sign-in pop-up
//   - lh3.googleusercontent.com  → user profile pictures returned by Google
//
// connect-src covers fetch/XHR, frame-src covers iframes (OAuth popup),
// img-src covers <img> tags (profile pics).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": [
        "'self'",
        "https://api.nbp.pl",
        "https://accounts.google.com",
      ],
      "frame-src": [
        "'self'",
        "https://accounts.google.com",
      ],
      "img-src": [
        "'self'",
        "data:",
        "https://lh3.googleusercontent.com",
      ],
      // Inline styles are extensively used across the app (style={{...}}).
      // We keep 'unsafe-inline' for style-src; without it the entire UI breaks.
      "style-src":  ["'self'", "'unsafe-inline'"],
      "script-src": ["'self'", "https://accounts.google.com"],
    },
  },
}));

// 2. CORS
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

/*
 TRUST PROXY (CRITICAL FOR AZURE) Required because Azure App Service / Container Apps sit behind a reverse proxy.
 Without this, rate-limiter sees the load balancer's IP instead of the actual user IP.
*/
app.set('trust proxy', 1);

// ------------------------------------------------------------
//  RATE LIMITING 
// ------------------------------------------------------------

// Helper factory function to keep rate limiters DRY and format the time message automatically
const createLimiter = (windowMs, maxRequests, baseMessage) => {
    return rateLimit({
        windowMs: windowMs,
        max: maxRequests,
        message: { error: `${baseMessage}, please try again later.` },
        standardHeaders: true,
        legacyHeaders: false,
    });
};

// Specific limiter for token refresh
const refreshLimiter = createLimiter(
    parseInt(process.env.RATE_LIMIT_REFRESH_WINDOW_MS) || 60 * 1000,
    parseInt(process.env.RATE_LIMIT_REFRESH_MAX) || 20,
    "Too many refresh attempts"
);
app.use('/api/auth/refresh', refreshLimiter); 

// Specific limiter for login to prevent brute-force attacks
const loginLimiter = createLimiter(
    parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
    "Too many login attempts"
);
app.use('/api/auth/login', loginLimiter);

// Specific limiter for limits container due to batch upserts
const limitsLimiter = createLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS_LIMITS_CONTAINER) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX_LIMITS_CONTAINER) || 600,
    "Too many requests to limits container"
);
app.use('/api/limits', limitsLimiter);

// ── Write operations limiter ────────────────────────────────
// Tighter limit on POST/PATCH/PUT/DELETE so a spam loop on
// "Add transaction" can't drain the global pool. Read operations
// are unaffected — only mutations count toward this counter.
//
// Skipped for /api/auth/* since those endpoints have their own
// dedicated limiters (refresh, login) with different semantics.
const writeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WRITE_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_WRITE_MAX)        || 60,
  message:  { error: "Too many write operations, please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
  // Only count mutating methods. GET/HEAD/OPTIONS bypass this limiter.
  skip: (req) => {
    const method = req.method.toUpperCase();
    return method === "GET" || method === "HEAD" || method === "OPTIONS";
  },
});

// Apply to all /api/* except /api/auth/* (auth has its own limiters).
// We pass the limiter to app.use with a path filter via middleware so
// auth routes don't double-count.
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  return writeLimiter(req, res, next);
});
// Global API limiter
const apiLimiter = createLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX) || 200,
    "Too many requests from this IP"
);
app.use('/api/', apiLimiter);

// ==========================================
// STANDARD MIDDLEWARE
// ==========================================

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});


// Lightweight liveness probe — no auth, no DB hit.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});


// ==========================================
// ROUTES
// ==========================================

app.use('/api/categories', categoriesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/transactions', transactionsRoutes)
app.use('/api/months', monthsRoutes)
app.use('/api/vouchers', vouchersRoutes);
app.use('/api/limits', limitsRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/planned", plannedRoutes);


// ------------------------------------------------------------
// GLOBAL ERROR HANDLER
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("Uncaught Server Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});


let aiClient = null;

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  try {
    const appInsights = require('applicationinsights');
    appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
      .setAutoCollectRequests(true)        // ← HTTP incoming
      .setAutoCollectDependencies(true)    // ← HTTP outgoing (Cosmos, NBP API)
      .setAutoCollectExceptions(true)      // ← exceptions
      .setAutoCollectPerformance(true)     // ← CPU, RAM
      .setAutoCollectConsole(true, true)   // ← console.log + console.error
      .setSendLiveMetrics(true)            // ← Live Metrics tab
      .start();
    aiClient = appInsights.defaultClient;
    console.log("📊 Application Insights initialized (full auto-collect)");
  } catch (err) {
    console.error("📊 Application Insights initialization failed:", err.message);
  }
} else {
  console.log("📊 Application Insights disabled (no connection string)");
}
// Catch unhandled promise rejections — prevent silent crashes
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  aiClient?.trackException({ exception: reason });
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  aiClient?.trackException({ exception: err });
  aiClient?.flush();
  process.exit(1);// Force restart via process manager (PM2, Azure App Service)
});
app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
  console.log(`🔒 Security active: Helmet (CSP), Rate Limiter, Strict CORS`);
});
