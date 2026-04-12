/**
 * Admin Auth API
 * POST /api/auth/login  — admin.html uses this endpoint
 * GET  /api/auth/me     — verify current admin token
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../lib/supabase");
const { signToken, json, error } = require("../lib/auth");

const DUMMY_BCRYPT_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, "Username and password required", 400, req);
  }

  try {
    const { data: admin } = await supabase
      .from("admins")
      .select("*")
      .eq("username", username)
      .single();

    const hashToCheck = admin?.password_hash || DUMMY_BCRYPT_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!admin || !valid) {
      return error(res, "Invalid credentials", 401, req);
    }

    const token = signToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
      type: "admin",
    });

    json(res, { token, admin: { id: admin.id, username: admin.username, role: admin.role } });
  } catch (err) {
    console.error("Admin login error:", err.message);
    error(res, "Login failed", 500, req);
  }
});

/**
 * GET /api/auth/me
 */
router.get("/me", async (req, res) => {
  // Reuse the same JWT verification as other routes
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return error(res, "Not authenticated", 401, req);
  }

  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.type !== "admin") {
      return error(res, "Not an admin token", 403, req);
    }
    json(res, { admin: { id: decoded.id, username: decoded.username, role: decoded.role } });
  } catch {
    error(res, "Invalid token", 401, req);
  }
});

module.exports = router;
