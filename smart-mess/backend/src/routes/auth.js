const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN, NODE_ENV, HOME_COLLEGE_NAME } = require('../config/env');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { isAllowedBitEmail, verifyGoogleIdToken } = require('../services/googleAuthService');
const { parseStudentEmail } = require('../services/studentEmailParser');

const router = express.Router();

// Constant-time dummy hash to protect against timing attacks for non-existent users
const DUMMY_HASH = '$2a$12$e8Y6lUqy/7w4JdYF2uBvse0lV5eH9p3bXF6ZfS7KqJ4sKzFq7A1Qy';

// Google Authentication input validation schema
const googleAuthSchema = z.object({
  idToken: z.string({ required_error: 'Google ID token is required' }).min(1, 'Google ID token cannot be empty'),
  role: z.enum(['student', 'faculty', 'admin']).optional(),
  college_name: z.string().trim().max(150).optional(),
  name: z.string().trim().max(100).optional(),
  student_type: z.string().optional()
});

// Registration input validation schema
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').max(191),
  college_name: z.string().trim().min(2, 'College name is required').max(150),
  role: z.enum(['student', 'faculty'], {
    errorMap: () => ({ message: "Role must be 'student' or 'faculty'" })
  }).default('student'),
  student_type: z.string().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

// Login input validation schema
const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
}

// POST /api/auth/register
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, college_name, role = 'student', student_type, password } = req.body;

    // Reject obsolete external student role
    if (student_type === 'external') {
      return res.status(400).json({
        error: 'Registration failed',
        details: 'External student role has been removed and is no longer supported.'
      });
    }

    // Check if user already exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({
        error: 'Registration failed',
        details: 'An account with this email address already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users (name, email, college_name, student_type, password_hash, role)
       VALUES (?, ?, ?, 'home', ?, ?)`,
      [name, email, college_name, passwordHash, role]
    );

    const userId = result.insertId;
    const token = jwt.sign({ userId, role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    setAuthCookie(res, token);

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: userId,
        name,
        email,
        college_name,
        role
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.query(
      'SELECT id, name, email, college_name, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    const user = users[0];
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const match = await bcrypt.compare(password, hashToCompare);

    if (!user || !match) {
      return res.status(401).json({
        error: 'Authentication failed',
        details: 'Invalid email or password'
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    setAuthCookie(res, token);

    return res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        college_name: user.college_name,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google
router.post('/google', validateBody(googleAuthSchema), async (req, res, next) => {
  try {
    const { idToken, role: requestedRole, college_name, name: requestedName, student_type } = req.body;

    // Reject obsolete external student role
    if (student_type === 'external') {
      return res.status(400).json({
        error: 'Registration failed',
        details: 'External student role has been removed and is no longer supported.'
      });
    }

    // Step 1: Verify Google ID token
    let verified;
    try {
      verified = await verifyGoogleIdToken(idToken);
    } catch (err) {
      return res.status(401).json({
        error: 'Authentication failed',
        details: 'Invalid or expired Google token'
      });
    }

    // Step 2: Ensure email is verified by Google
    if (verified.emailVerified !== true) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Google account email is unverified. Please verify your email with Google.',
        details: 'Unverified Google email'
      });
    }

    // Step 3: Strict @bitsathy.ac.in domain check
    if (!isAllowedBitEmail(verified.email)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Access is restricted to verified @bitsathy.ac.in accounts.',
        details: 'Email domain is not authorized. Only verified @bitsathy.ac.in accounts are permitted.'
      });
    }

    // Step 4: Strict role manipulation check (admin cannot be self-requested)
    if (requestedRole === 'admin') {
      return res.status(403).json({
        error: 'Unauthorized role',
        details: 'Admin role cannot be self-assigned.'
      });
    }

    const email = verified.email.toLowerCase().trim();

    // Step 5: Check if user exists in database
    const [users] = await db.query(
      'SELECT id, name, email, college_name, role, auth_provider, google_id, department, batch_start_year, batch_end_year, profile_completed FROM users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      const user = users[0];

      // Update google_id and auth_provider if missing
      if (!user.google_id || user.auth_provider !== 'google') {
        await db.execute(
          'UPDATE users SET google_id = ?, auth_provider = "google" WHERE id = ?',
          [verified.googleId, user.id]
        );
      }

      // If existing student has no department/batch recorded yet, attempt automatic backfill from email
      let currentDept = user.department;
      let currentBatchStart = user.batch_start_year;
      let currentBatchEnd = user.batch_end_year;
      let currentProfileCompleted = Boolean(user.profile_completed);

      if (user.role === 'student' && !currentDept) {
        const parsed = parseStudentEmail(email);
        if (parsed.isRecognizedStudentPattern) {
          currentDept = parsed.department;
          currentBatchStart = parsed.batchStartYear;
          currentBatchEnd = parsed.batchEndYear;
          currentProfileCompleted = parsed.profileCompleted;

          await db.execute(
            'UPDATE users SET department = ?, batch_start_year = ?, batch_end_year = ?, profile_completed = ? WHERE id = ?',
            [currentDept, currentBatchStart, currentBatchEnd, currentProfileCompleted ? 1 : 0, user.id]
          );
        }
      }

      // Existing user: sign token with their authorized database role (preserves admin, faculty, student)
      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
      });

      setAuthCookie(res, token);

      return res.json({
        message: 'Logged in successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          college_name: user.college_name,
          role: user.role,
          department: currentDept,
          batch_start_year: currentBatchStart,
          batch_end_year: currentBatchEnd,
          profile_completed: currentProfileCompleted
        }
      });
    }

    // Step 6: Automatic Student Account Creation for new @bitsathy.ac.in Google users
    const parsed = parseStudentEmail(email);
    const assignedRole = 'student'; // Always student for new automatic sign-ups
    const assignedName = verified.name || 'BIT Student';
    const assignedCollege = HOME_COLLEGE_NAME || 'Bannari Amman Institute of Technology';
    let userId;

    try {
      const [result] = await db.execute(
        `INSERT INTO users (name, email, college_name, student_type, password_hash, role, auth_provider, google_id, department, batch_start_year, batch_end_year, profile_completed)
         VALUES (?, ?, ?, 'home', NULL, 'student', 'google', ?, ?, ?, ?, ?)`,
        [
          assignedName,
          email,
          assignedCollege,
          verified.googleId,
          parsed.department,
          parsed.batchStartYear,
          parsed.batchEndYear,
          parsed.profileCompleted ? 1 : 0
        ]
      );
      userId = result.insertId;
    } catch (insertErr) {
      // Concurrency race condition: if duplicate entry occurs during simultaneous sign-ins, load existing record
      if (insertErr.code === 'ER_DUP_ENTRY') {
        const [raceUsers] = await db.query(
          'SELECT id, name, email, college_name, role, department, batch_start_year, batch_end_year, profile_completed FROM users WHERE email = ?',
          [email]
        );
        if (raceUsers.length > 0) {
          const raceUser = raceUsers[0];
          userId = raceUser.id;
          const token = jwt.sign({ userId, role: raceUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
          setAuthCookie(res, token);
          return res.json({
            message: 'Logged in successfully',
            user: {
              id: raceUser.id,
              name: raceUser.name,
              email: raceUser.email,
              college_name: raceUser.college_name,
              role: raceUser.role,
              department: raceUser.department,
              batch_start_year: raceUser.batch_start_year,
              batch_end_year: raceUser.batch_end_year,
              profile_completed: Boolean(raceUser.profile_completed)
            }
          });
        }
      }
      throw insertErr;
    }

    const token = jwt.sign({ userId, role: assignedRole }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    setAuthCookie(res, token);

    return res.status(201).json({
      message: 'Student account created and logged in successfully',
      user: {
        id: userId,
        name: assignedName,
        email,
        college_name: assignedCollege,
        role: assignedRole,
        department: parsed.department,
        batch_start_year: parsed.batchStartYear,
        batch_end_year: parsed.batchEndYear,
        profile_completed: parsed.profileCompleted
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user: req.user
  });
});

module.exports = router;
