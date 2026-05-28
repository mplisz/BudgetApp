// ============================================================
// File: backend/routes/auth.js
// Handles Google Login and Token Refreshing
// ============================================================

const ms = require('ms');
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const {isProduction,sameSitePolicy} = require("../utils/helpers")
const { refreshTokensContainer } = require('../cosmos');

const JWT_SECRET_EXPIRATION = process.env.JWT_SECRET_EXPIRATION || '15m';
const JWT_REFRESH_SECRET_EXPIRATION = process.env.JWT_REFRESH_SECRET_EXPIRATION || '30d';
const expirationMiliseconds = ms(JWT_REFRESH_SECRET_EXPIRATION);
const expirationSeconds = Math.floor(expirationMiliseconds / 1000);

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Zod Schemas ──────────────────────────────────────────────
const LoginSchema = z.object({
  token: z.string().min(1, "Missing authentication token"),
});

const RevokeSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
});

const SessionsQuerySchema = z.object({
  email: z.string().email("Invalid email format").optional(),
});

// ── Family Members ───────────────────────────────────────────
let FAMILY_MEMBERS;
try {
  const raw = process.env.FAMILY_MEMBERS;
  if (!raw) {
    throw new Error("env var is missing or empty");
  }
  FAMILY_MEMBERS = JSON.parse(raw);
  if (!Array.isArray(FAMILY_MEMBERS)) {
    throw new Error(`expected JSON array, got ${typeof FAMILY_MEMBERS}`);
  }
  if (FAMILY_MEMBERS.length === 0) {
    throw new Error("array is empty — nobody could log in");
  }
  // Validate each entry has the minimum required shape
  FAMILY_MEMBERS.forEach((m, i) => {
    if (!m || typeof m !== "object") {
      throw new Error(`entry [${i}] is not an object`);
    }
    if (typeof m.email !== "string" || !m.email.trim()) {
      throw new Error(`entry [${i}] missing or empty 'email' field`);
    }
    if (typeof m.name !== "string" || !m.name.trim()) {
      throw new Error(`entry [${i}] missing or empty 'name' field`);
    }
  });
} catch (err) {
  console.error("❌ [auth] CRITICAL: FAMILY_MEMBERS invalid —", err.message);
  console.error("    Expected format: '[{\"email\":\"x@y.com\",\"name\":\"X\"},...]'");
  console.error(`    Got: ${(process.env.FAMILY_MEMBERS || "<empty>").substring(0, 120)}${(process.env.FAMILY_MEMBERS || "").length > 120 ? "..." : ""}`);
  process.exit(1);
}

const allowedEmails    = FAMILY_MEMBERS.map(m => m.email.trim().toLowerCase());
const SHARED_FAMILY_ID = process.env.FAMILY_ID || 'MMs';

if (!isProduction) {
  console.log(`✅ [auth] Loaded ${FAMILY_MEMBERS.length} family member(s): ${allowedEmails.join(", ")}`);
} else {
  console.log(`✅ [auth] Loaded ${FAMILY_MEMBERS.length} family member(s)`);
}
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// 1. LOGIN ENDPOINT
router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const { token } = parsed.data;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const userEmail = payload.email.toLowerCase();

    if (!allowedEmails.includes(userEmail)) {
      console.warn(`Attempted login from unknown email: ${userEmail}`);
      return res.status(403).json({ error: "Access denied. Your email is not on the whitelist." });
    }

    const familyMember = FAMILY_MEMBERS.find(m => m.email.toLowerCase() === userEmail);

    const accessToken = jwt.sign(
      { id: payload.sub, email: userEmail, familyId: SHARED_FAMILY_ID, name: familyMember.name },
      process.env.JWT_SECRET,
      { expiresIn: JWT_SECRET_EXPIRATION }
    );

    const refreshToken = jwt.sign(
      { id: payload.sub, email: userEmail, familyId: SHARED_FAMILY_ID, name: familyMember.name },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_SECRET_EXPIRATION }
    );

    const tokenHash = hashToken(refreshToken);
    await refreshTokensContainer.items.upsert({
      id: tokenHash,
      userId: payload.sub,
      email: userEmail,
      familyId: SHARED_FAMILY_ID,
      expiresAt: new Date(Date.now() + expirationMiliseconds).toISOString(),
      ttl: expirationSeconds
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      maxAge: expirationMiliseconds,
      secure: isProduction,      // in prod (HTTPS) true for sameSite: 'none'
      sameSite: sameSitePolicy,  // Allows traffic between azurestaticapps.net and azurewebsites.net
      path: '/api/auth/refresh'
    });

    console.log(`Successfully logged in: ${userEmail}`);
    res.json({ accessToken, user: { email: userEmail, name: familyMember.name, picture: payload.picture } });

  } catch (error) {
    console.error("Error verifying Google token:", error);
    res.status(401).json({ error: "Invalid Google authentication token" });
  }
});

// 2. REFRESH ENDPOINT
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "Missing refresh token in cookies" });
  }

  let user;
  try {
    user = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return res.status(403).json({ error: "Refresh token is expired or invalid" });
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const { resource } = await refreshTokensContainer.item(tokenHash, user.email).read();
    if (!resource) {
      return res.status(403).json({ error: "Refresh token has been revoked" });
    }
  } catch (err) {
    return res.status(403).json({ error: "Refresh token has been revoked" });
  }

  const newAccessToken = jwt.sign(
    { id: user.id, email: user.email, familyId: user.familyId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: JWT_SECRET_EXPIRATION }
  );

  res.json({ accessToken: newAccessToken });
});

// 3. LOGOUT ENDPOINT
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    try {
      const decoded = jwt.decode(refreshToken);
      const tokenHash = hashToken(refreshToken);
      await refreshTokensContainer.item(tokenHash, decoded.email).delete();
    } catch (err) {
      console.warn("[LOGOUT] Token not found in DB.");
    }
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' ,secure: isProduction, sameSite: sameSitePolicy,httpOnly: true});
  res.json({ message: "Logged out successfully" });
});

// 4. REVOKE ALL TOKENS
router.delete('/revoke-all', requireAuth, async (req, res) => {
  const parsed = RevokeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const targetEmail = parsed.data.email || req.user.email;

    const { resources } = await refreshTokensContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: targetEmail }]
      })
      .fetchAll();

    await Promise.all(
      resources.map(token => refreshTokensContainer.item(token.id, token.email).delete())
    );

    console.log(`[REVOKE] Revoked ${resources.length} tokens for: ${targetEmail}`);
    res.json({ message: `Unieważniono ${resources.length} sesji dla ${targetEmail}.` });

  } catch (err) {
    console.error("[REVOKE] Error revoking tokens:", err);
    res.status(500).json({ error: "Failed to revoke tokens." });
  }
});

// 5. FAMILY MEMBERS ENDPOINT
router.get('/family-members', requireAuth, (req, res) => {
  const members = FAMILY_MEMBERS.map(m => ({
    email: m.email,
    name: m.name
  }));
  res.json(members);
});

// 6. SESSIONS ENDPOINT
router.get('/sessions', requireAuth, async (req, res) => {
  const parsed = SessionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  try {
    const targetEmail = parsed.data.email || req.user.email;

    const { resources } = await refreshTokensContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: targetEmail }]
      })
      .fetchAll();

    res.json({ count: resources.length, email: targetEmail });
  } catch (err) {
    console.error("[SESSIONS] Error:", err);
    res.status(500).json({ error: "Failed to fetch sessions." });
  }
});

module.exports = router;