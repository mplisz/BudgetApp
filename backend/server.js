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

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// 1. Helmet
app.use(helmet());

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

// 3. Rate Limiting
const refreshLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_REFRESH_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_REFRESH_MAX) || 20,
  message: { error: "Too many refresh attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/refresh', refreshLimiter); // strict limit - before a global one

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
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

// ==========================================
// ROUTES
// ==========================================

app.use('/api/categories', categoriesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/transactions', transactionsRoutes)
app.use('/api/months', monthsRoutes)

app.use((err, req, res, next) => {
  console.error("Uncaught Server Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
  console.log(`🔒 Security active: Helmet, Rate Limiter, Strict CORS`);
});