const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

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
}

module.exports = {
  validateEnv,
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  HOME_COLLEGE_NAME: process.env.HOME_COLLEGE_NAME || 'National Institute of Technology',
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || ''
};
