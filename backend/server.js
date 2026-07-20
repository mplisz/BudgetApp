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
const recurringRoutes = require('./routes/recurring');
const plannedRoutes = require('./routes/planned');
const merchants = require('./routes/merchants');
const ocr = require('./routes/ocr');
const productsRoutes = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 5000;

const { applyRateLimiters } = require('./middleware/rateLimiter');
applyRateLimiters(app);
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



// ==========================================
// STANDARD MIDDLEWARE
// ==========================================
app.use('/api/ocr', express.json({ limit: '8mb' })); // max 8 mb per picture
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});


// Lightweight liveness probe — no auth, no DB hit.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok'});
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
app.use('/api/recurring', recurringRoutes);
app.use('/api/planned', plannedRoutes);
app.use('/api/ocr', ocr);
app.use('/api/merchants', merchants);
app.use('/api/products', productsRoutes);
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
