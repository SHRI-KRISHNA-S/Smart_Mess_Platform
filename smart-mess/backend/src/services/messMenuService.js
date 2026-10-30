const UPSTREAM_HOST = 'bitcentral-v2.onrender.com';
const UPSTREAM_PATH = '/mess';
const UPSTREAM_BASE = `https://${UPSTREAM_HOST}${UPSTREAM_PATH}`;
const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory cache: key -> { data, expiresAt }
const menuCache = new Map();

// In-flight request deduplication map: key -> Promise
const inFlightRequests = new Map();

/**
 * Validates hostel parameter
 */
function isValidHostel(hostel) {
  return hostel === 'boys' || hostel === 'girls';
}

/**
 * Validates date string in YYYY-MM-DD format and ensures it is a real calendar date
 */
function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  return (
    dateObj.getFullYear() === year &&
    dateObj.getMonth() === month - 1 &&
    dateObj.getDate() === day
  );
}

/**
 * Normalizes raw upstream payload into the application JSON contract
 */
function normalizeMenuData(raw, requestedHostel, requestedDate) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid or malformed menu payload received from upstream');
  }

  const currentMealRaw = raw.current_meal || {};
  const fullMenuRaw = raw.full_menu || {};

  return {
    date: typeof raw.date === 'string' ? raw.date : requestedDate,
    day: typeof raw.day === 'string' ? raw.day : '',
    hostel: typeof raw.hostel === 'string' ? raw.hostel.toLowerCase() : requestedHostel,
    currentTime: typeof raw.current_time === 'string' ? raw.current_time : '',
    currentMeal: {
      mealType: typeof currentMealRaw.meal_type === 'string' ? currentMealRaw.meal_type : '',
      startTime: typeof currentMealRaw.start_time === 'string' ? currentMealRaw.start_time : '',
      endTime: typeof currentMealRaw.end_time === 'string' ? currentMealRaw.end_time : '',
      items: Array.isArray(currentMealRaw.items) ? currentMealRaw.items.filter(i => typeof i === 'string') : []
    },
    fullMenu: {
      breakfast: Array.isArray(fullMenuRaw.breakfast) ? fullMenuRaw.breakfast.filter(i => typeof i === 'string') : [],
      lunch: Array.isArray(fullMenuRaw.lunch) ? fullMenuRaw.lunch.filter(i => typeof i === 'string') : [],
      dinner: Array.isArray(fullMenuRaw.dinner) ? fullMenuRaw.dinner.filter(i => typeof i === 'string') : []
    },
    isDefaultTemplate: Boolean(raw.default_menu || raw.data_found === false),
    source: 'bitcentral.bitsathy.in',
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Fetches menu from upstream official API with timeout and strict destination validation
 */
async function fetchFromUpstream(hostel, date) {
  // Enforce strictly approved destination (no dynamic user URL)
  const targetUrl = new URL(UPSTREAM_BASE);
  targetUrl.searchParams.set('hostel', hostel);
  targetUrl.searchParams.set('date', date);

  if (targetUrl.hostname !== UPSTREAM_HOST || targetUrl.pathname !== UPSTREAM_PATH) {
    throw new Error('Disallowed upstream request target');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SmartMess-Client/1.0'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const err = new Error(`Upstream returned status ${response.status}`);
      err.statusCode = response.status >= 500 ? 502 : 400;
      err.details = `BIT Central upstream service responded with HTTP ${response.status}. ${errorText ? errorText.slice(0, 100) : ''}`.trim();
      throw err;
    }

    let parsed;
    try {
      parsed = await response.json();
    } catch (parseErr) {
      const err = new Error('Malformed JSON received from upstream');
      err.statusCode = 502;
      err.details = 'Failed to parse JSON response from BIT Central mess service.';
      throw err;
    }

    return normalizeMenuData(parsed, hostel, date);
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Upstream mess menu request timed out');
      timeoutErr.statusCode = 504;
      timeoutErr.details = 'The BIT Central mess menu service did not respond within 10 seconds.';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retrieves mess menu with 10-minute cache, deduplication, and optional refresh bypass
 */
async function getMessMenu({ hostel = 'boys', date, refresh = false }) {
  const normalizedHostel = hostel ? hostel.toLowerCase() : 'boys';

  if (!isValidHostel(normalizedHostel)) {
    const err = new Error("Invalid 'hostel' parameter. Allowed values are 'boys' or 'girls'.");
    err.statusCode = 400;
    throw err;
  }

  if (!date || !isValidDate(date)) {
    const err = new Error("Invalid 'date' parameter. Must be a valid calendar date in YYYY-MM-DD format.");
    err.statusCode = 400;
    throw err;
  }

  const cacheKey = `${normalizedHostel}:${date}`;

  // If refresh requested, invalidate existing cache
  if (refresh) {
    menuCache.delete(cacheKey);
  } else {
    // Check cache
    const cached = menuCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.data,
        cached: true
      };
    }
  }

  // Check if an identical request is already in-flight
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  // Create in-flight promise and execute
  const fetchPromise = (async () => {
    try {
      const data = await fetchFromUpstream(normalizedHostel, date);
      // Cache successful response only
      menuCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS
      });
      return {
        ...data,
        cached: false
      };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Clear cache helper for testing
 */
function clearCache() {
  menuCache.clear();
  inFlightRequests.clear();
}

module.exports = {
  getMessMenu,
  isValidHostel,
  isValidDate,
  clearCache,
  CACHE_TTL_MS,
  UPSTREAM_BASE
};
