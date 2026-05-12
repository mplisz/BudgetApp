// ============================================================
// File: backend/middleware/auth.js
// Handles JWT authentication checking
// ============================================================

const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
  // Check the Authorization header (Format: "Bearer yourjwthere")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn("⚠️ Request rejected - missing Access Token.");
    return res.status(401).json({ error: "Unauthorized access" });
  }

  // Verify secret
  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) {
      console.warn("⚠️ Request rejected - invalid or expired Access Token.");
      // Standard HTTP convention: 401 for invalid/expired token
      return res.status(401).json({ error: "Access Token is invalid or expired" });
    }

    // Set verified user to the request
    req.user = { 
      id: decodedUser.id, 
      email: decodedUser.email ,
      familyId: decodedUser.familyId,
      name: decodedUser.name
    };
    
    next();
  });
};

module.exports = { requireAuth };