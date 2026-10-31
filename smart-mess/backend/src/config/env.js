const fs = require('fs');
const path = require('path');

// Search and load .env from standard locations (backend dir, smart-mess root, cwd)
const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env')
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}

function cleanGoogleClientId(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().replace(/^['"]|['"]$/g, '');
}

const PLACEHOLDER_SECRETS = [
  'your_jwt_secret_min_32_chars_long_random_string_here',
  'secret',
  '12345678901234567890123456789012',
  'changeme',
  'placeholder'
];

function validateEnv() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret.length < 32 || PLACEHOLDER_SECRETS.includes(secret.toLowerCase())) {
    const crypto = require('crypto');
    const generated = crypto.randomBytes(32).toString('hex');
    console.warn('[SECURITY NOTICE] JWT_SECRET was missing or insecure. Auto-generated a secure 256-bit secret for this runtime session.');
    process.env.JWT_SECRET = generated;
  }

  const clientId = cleanGoogleClientId(process.env.GOOGLE_CLIENT_ID);
  if (clientId) {
    const preview = clientId.length > 20 ? `${clientId.slice(0, 14)}...${clientId.slice(-12)}` : clientId;
    console.log(`[Google OAuth Diagnostic] GOOGLE_CLIENT_ID detected and active: ${preview}`);
  } else {
    console.warn('[Google OAuth Diagnostic] GOOGLE_CLIENT_ID is not configured in environment variables. Google Sign-In will be disabled until GOOGLE_CLIENT_ID is set in Render Dashboard or backend/.env.');
  }
}

module.exports = {
  validateEnv,
  cleanGoogleClientId,
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  HOME_COLLEGE_NAME: process.env.HOME_COLLEGE_NAME || 'National Institute of Technology',
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  GOOGLE_CLIENT_ID: cleanGoogleClientId(process.env.GOOGLE_CLIENT_ID)
};

