// ─── JWT UTILITY HELPERS ──────────────────────────────
// Functions for generating and verifying JSON Web Tokens
// A JWT is a secure string given to users after login
// They send it with every request to prove who they are

const jwt = require('jsonwebtoken');

// ─── GENERATE TOKEN ───────────────────────────────────
// Creates a signed JWT containing the user's basic info
// payload = the data we want to store inside the token
// Example payload: { userId: 'abc-123', role: 'employee', companyId: 'xyz-456' }
const generateToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,      // Secret key — only our server knows this
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d', // Token expires in 7 days
    }
  );
};

// ─── VERIFY TOKEN ─────────────────────────────────────
// Checks that a token is valid and not expired
// Returns the decoded payload if valid
// Throws an error if the token is invalid or expired
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateToken, verifyToken };