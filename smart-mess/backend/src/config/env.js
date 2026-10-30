require('dotenv').config();

const PLACEHOLDER_SECRETS = [
  'your_jwt_secret_min_32_chars_long_random_string_here',
  'secret',
  '12345678901234567890123456789012',
  'changeme',
  'placeholder'
];

function validateEnv() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('CRITICAL STARTUP ERROR: JWT_SECRET environment variable is missing.');
    process.exit(1);
  }

  if (secret.length < 32) {
    console.error(`CRITICAL STARTUP ERROR: JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
    process.exit(1);
  }

  if (PLACEHOLDER_SECRETS.includes(secret.toLowerCase().trim())) {
    console.error('CRITICAL STARTUP ERROR: JWT_SECRET is still set to an insecure default placeholder value.');
    process.exit(1);
  }
}

module.exports = {
  validateEnv,
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  HOME_COLLEGE_NAME: process.env.HOME_COLLEGE_NAME || 'National Institute of Technology',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || ''
};
