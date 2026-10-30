const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const db = require('../config/db');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        details: 'Missing session token cookie. Please log in.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.query(
      'SELECT id, name, email, college_name, student_type, role, department, batch_start_year, batch_end_year, profile_completed FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid session',
        details: 'User account no longer exists.'
      });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Invalid or expired token',
        details: 'Please log in again.'
      });
    }
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      details: 'Administrator access required.'
    });
  }
  next();
}

function requireStudentOrFaculty(req, res, next) {
  if (!req.user || (req.user.role !== 'student' && req.user.role !== 'faculty')) {
    return res.status(403).json({
      error: 'Forbidden',
      details: 'Access restricted to students and faculty.'
    });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireStudentOrFaculty
};

