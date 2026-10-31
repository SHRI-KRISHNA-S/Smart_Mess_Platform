const { OAuth2Client } = require('google-auth-library');
const { GOOGLE_CLIENT_ID, NODE_ENV, cleanGoogleClientId } = require('../config/env');

const ALLOWED_DOMAIN = 'bitsathy.ac.in';

let oauthClientInstance = null;
let cachedClientId = null;

function getResolvedClientId() {
  const raw = typeof process.env.GOOGLE_CLIENT_ID === 'string'
    ? process.env.GOOGLE_CLIENT_ID
    : (GOOGLE_CLIENT_ID || '');
  return cleanGoogleClientId ? cleanGoogleClientId(raw) : raw.trim().replace(/^['"]|['"]$/g, '');
}

function getOAuthClient() {
  const currentClientId = getResolvedClientId();
  if (!oauthClientInstance || cachedClientId !== currentClientId) {
    oauthClientInstance = new OAuth2Client(currentClientId || undefined);
    cachedClientId = currentClientId;
  }
  return oauthClientInstance;
}

/**
 * Validates that an email address belongs exactly to the @bitsathy.ac.in domain.
 * - Case-insensitive
 * - Exact domain match (rejects subdomains, prefix matches, and suffix extensions)
 * - Must have exactly one @ and non-empty local part
 *
 * @param {string} email
 * @returns {boolean}
 */
function isAllowedBitEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.indexOf('@')) {
    return false;
  }
  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);
  if (!localPart || localPart.length === 0) {
    return false;
  }
  return domainPart === ALLOWED_DOMAIN;
}

/**
 * Parses and verifies a mock token for automated test suites and local CI tests.
 * Only allowed when running in non-production environments or when token is explicitly prefixed.
 */
function parseMockGoogleToken(idToken) {
  if (NODE_ENV === 'production') {
    throw new Error('Mock tokens are strictly disallowed in production environment.');
  }
  try {
    const raw = idToken.replace(/^mock-google-token:/, '');
    let payload;
    if (raw.startsWith('{')) {
      payload = JSON.parse(raw);
    } else {
      payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }

    if (payload.expired === true) {
      const err = new Error('Token used too late, expired token');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }

    if (payload.invalidSignature === true) {
      const err = new Error('Invalid token signature');
      err.code = 'INVALID_SIGNATURE';
      throw err;
    }

    return {
      googleId: payload.sub || `google_sub_${Date.now()}`,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name || 'BIT Member',
      picture: payload.picture || '',
      hostedDomain: payload.hd || (payload.email ? payload.email.split('@')[1] : '')
    };
  } catch (err) {
    if (err.code) throw err;
    throw new Error(`Invalid mock Google token payload: ${err.message}`);
  }
}

/**
 * Verifies a Google ID token and returns the verified user information.
 *
 * @param {string} idToken Google ID token (JWT)
 * @returns {Promise<{googleId: string, email: string, emailVerified: boolean, name: string, picture: string, hostedDomain: string}>}
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Google ID token is required.');
    err.code = 'MISSING_TOKEN';
    throw err;
  }

  // Handle mock tokens for test suites and offline verification
  if (idToken.startsWith('mock-google-token:')) {
    return parseMockGoogleToken(idToken);
  }

  const clientId = getResolvedClientId();

  if (!clientId) {
    const err = new Error('GOOGLE_CLIENT_ID is not configured on the server. Please check your environment variables.');
    err.code = 'CLIENT_ID_UNCONFIGURED';
    throw err;
  }

  const client = getOAuthClient();

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId
    });

    const payload = ticket.getPayload();
    if (!payload) {
      const err = new Error('Failed to retrieve token payload from Google.');
      err.code = 'EMPTY_PAYLOAD';
      throw err;
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name || '',
      picture: payload.picture || '',
      hostedDomain: payload.hd || ''
    };
  } catch (err) {
    const error = new Error(`Google ID token verification failed: ${err.message}`);
    error.code = 'TOKEN_VERIFICATION_FAILED';
    error.originalError = err;
    throw error;
  }
}

module.exports = {
  ALLOWED_DOMAIN,
  isAllowedBitEmail,
  verifyGoogleIdToken
};
