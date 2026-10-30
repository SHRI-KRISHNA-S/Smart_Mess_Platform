const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Validate critical environment configurations before proceeding
const { validateEnv, PORT, NODE_ENV, HOME_COLLEGE_NAME, CORS_ORIGIN, AUTH_RATE_LIMIT_MAX, GOOGLE_CLIENT_ID } = require('./config/env');
validateEnv();

const authRoutes = require('./routes/auth');
const pollRoutes = require('./routes/polls');
const { router: mealIntentRoutes } = require('./routes/mealIntent');
const adminRoutes = require('./routes/admin');
const messMenuRoutes = require('./routes/messMenu');
const mlRoutes = require('./routes/ml');
const { errorHandler, notFoundHandler } = require('./middleware/error');
const { syncDailyPolls, startDailyPollScheduler } = require('./services/pollService');

const app = express();

// Security HTTP headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false
  })
);

// CORS configuration (allow Vite frontend origin with credentials)
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' || process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    error: 'Too many attempts',
    details: 'Too many authentication attempts from this IP, please try again after 15 minutes.'
  }
});

// Request parsing with limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Public health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'smart-mess-api',
    uptime: Math.floor(process.uptime())
  });
});

// Public config endpoint (exposes HOME_COLLEGE_NAME and googleClientId)
app.get('/api/config', (req, res) => {
  res.json({
    homeCollegeName: HOME_COLLEGE_NAME,
    googleClientId: GOOGLE_CLIENT_ID || ''
  });
});

// Mount modular API routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api', mealIntentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/mess-menu', messMenuRoutes);

// In production, serve the built frontend assets
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// For non-API routes in production, return index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      // In dev mode when frontend/dist does not exist, return a descriptive message
      res.status(200).send('Smart Mess API is running. Access the frontend via Vite dev server at http://localhost:5173');
    }
  });
});

// Central 404 handler for unknown /api routes
app.use('/api', notFoundHandler);

// Central error handler
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`[Smart Mess Server] Running on http://localhost:${PORT} in ${NODE_ENV} mode`);
    try {
      await syncDailyPolls();
      startDailyPollScheduler();
      console.log('[Daily Poll Lifecycle] Initialized daily poll scheduler.');
    } catch (pollErr) {
      console.error('[Daily Poll Lifecycle] Startup poll sync failed:', pollErr);
    }
  });
}

module.exports = app;
