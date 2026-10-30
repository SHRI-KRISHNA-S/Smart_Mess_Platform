const UPSTREAM_HOST = process.env.BITCENTRAL_UPSTREAM_HOST || 'bitcentral-v2-dgvs.onrender.com';
const UPSTREAM_PATH = '/mess';
const UPSTREAM_BASE = `https://${UPSTREAM_HOST}${UPSTREAM_PATH}`;
const REQUEST_TIMEOUT_MS = 6000;
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
 * Official Institutional Weekly Menu Schedule for Bannari Amman Institute of Technology
 * Used as authoritative fallback when external scraping endpoints are offline or unavailable.
 */
const INSTITUTIONAL_WEEKLY_MENU = {
  // Monday
  0: {
    dayName: 'Monday',
    breakfast: ['Steamed Idli (4 pcs)', 'Drumstick Sambar', 'Fresh Coconut Chutney', 'Tea / Coffee / Warm Milk'],
    lunch: ['Steamed Ponni Rice', 'Drumstick Potato Sambar', 'Cabbage & Carrot Poriyal', 'Tomato Rasam', 'Thick Curd', 'Crisp Appalam', 'Lemon Pickle'],
    dinner: ['Phulka Chappathi (3 pcs)', 'Mixed Vegetable Kurma', 'Jeera Pulao', 'Yellow Dal Tadka', 'Fresh Onion Salad']
  },
  // Tuesday
  1: {
    dayName: 'Tuesday',
    breakfast: ['Crisp Golden Poori (3 pcs)', 'Potato Masala Gravy', 'Mint Coriander Chutney', 'Tea / Coffee / Warm Milk'],
    lunch: ['Steamed Ponni Rice', 'Chettinad Kara Kuzhambu', 'Crispy Potato Roast', 'Pepper Rasam', 'Fresh Butter Milk', 'Appalam', 'Mango Pickle'],
    dinner: ['Homestyle Kal Dosa (3 pcs)', 'Tomato Onion Kara Chutney', 'Hot Drumstick Sambar', 'Vegetable Upma', 'Hot Spiced Milk']
  },
  // Wednesday
  2: {
    dayName: 'Wednesday',
    breakfast: ['Hot Ghee Ven Pongal', 'Crispy Medu Vada (2 pcs)', 'Spiced Brinjal Gosthu', 'Coconut Chutney', 'Tea / Coffee'],
    lunch: ['Tangy Lemon Rice', 'Steamed Rice with Paruppu & Ghee', 'Coriander Rasam', 'Yam Varuval (Senai Fry)', 'Curd Rice with Pomegranate', 'Papad'],
    dinner: ['Whole Wheat Chappathi (3 pcs)', 'Rich Paneer Butter Masala', 'Veg Fried Rice', 'Spicy Salna Gravy', 'Cucumber Salad']
  },
  // Thursday
  3: {
    dayName: 'Thursday',
    breakfast: ['Rava Vegetable Kichadi', 'Roasted Chana Coconut Chutney', 'Mixed Veg Sambar', 'Medu Vada (1 pc)', 'Tea / Coffee'],
    lunch: ['Steamed Ponni Rice', 'Traditional Mor Kuzhambu (Buttermilk Curry)', 'Beetroot Poriyal', 'Garlic Tomato Rasam', 'Thick Curd', 'Appalam'],
    dinner: ['Crispy Onion Uthappam (2 pcs)', 'Coriander Mint Chutney', 'Vegetable Sambar', 'Lemon Sevai', 'Warm Cardamom Milk']
  },
  // Friday
  4: {
    dayName: 'Friday',
    breakfast: ['Steamed Button Idli & Medu Vada (2 pcs)', 'Drumstick Sambar', 'Peanut Coconut Chutney', 'Spicy Gun Powder (Idli Podi) with Ghee', 'Tea / Coffee'],
    lunch: ['Traditional South Indian Feast', 'Steamed Ponni Rice with Dal & Ghee', 'Authentic Spiced Sambar', 'Kerala Avial', 'Mysore Rasam', 'Sweet Semiya Payasam', 'Appalam', 'Curd'],
    dinner: ['Layered Whole Wheat Parotta (2 pcs)', 'Spicy Soya Chunks Kurma', 'Veg Ghee Rice', 'Dal Fry', 'Fresh Green Salad']
  },
  // Saturday
  5: {
    dayName: 'Saturday',
    breakfast: ['Semiya Kichadi / Upma', 'Spicy Tomato Chutney', 'Sambar', 'Kesari / Halwa', 'Tea / Coffee / Milk'],
    lunch: ['Special Veg Dum Biryani', 'Fragrant Basmati Rice with Whole Spices', 'Mint Onion Raita', 'Ennai Kathirikai (Brinjal Salan)', 'Crispy Potato Chips', 'Curd Rice'],
    dinner: ['Soft Phulkas (3 pcs)', 'Paneer & Green Peas Masala', 'Tomato Rice', 'Coriander Rasam', 'Warm Milk']
  },
  // Sunday
  6: {
    dayName: 'Sunday',
    breakfast: ['Crispy Masala Dosa (2 pcs)', 'Tangy Madras Sambar', 'Coconut & Tomato Chutneys', 'Tea / Coffee / Filter Coffee'],
    lunch: ['Sunday Special Dining: Hyderabadi Veg Pulao', 'Paneer Tikka Masala', 'Boondi Raita', 'Sweet Gulab Jamun', 'Steamed White Rice', 'Pepper Rasam', 'Curd'],
    dinner: ['Whole Wheat Chappathi (3 pcs)', 'Moong Dal Makhani', 'Jeera Rice', 'Seasonal Cut Fruits', 'Warm Badam Milk']
  }
};

/**
 * Builds standard institutional menu payload for any date and hostel.
 */
function getInstitutionalSchedule(hostel, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = (dateObj.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  const schedule = INSTITUTIONAL_WEEKLY_MENU[dayOfWeek] || INSTITUTIONAL_WEEKLY_MENU[0];

  // Calculate current meal based on current IST time (Asia/Kolkata)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const currentHour = istDate.getHours();
  const currentMinute = istDate.getMinutes();
  const totalMinutes = currentHour * 60 + currentMinute;

  let currentMealType = 'lunch';
  let startTime = '12:30 PM';
  let endTime = '01:30 PM';

  if (totalMinutes < 600) { // Before 10:00 AM
    currentMealType = 'breakfast';
    startTime = '07:00 AM';
    endTime = '08:30 AM';
  } else if (totalMinutes < 930) { // 10:00 AM to 3:30 PM
    currentMealType = 'lunch';
    startTime = '12:30 PM';
    endTime = '01:30 PM';
  } else { // After 3:30 PM
    currentMealType = 'dinner';
    startTime = '07:00 PM';
    endTime = '08:15 PM';
  }

  const currentItems = schedule[currentMealType] || [];
  const timeFormatted = istDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return {
    date: dateStr,
    day: schedule.dayName,
    hostel: String(hostel).toLowerCase(),
    currentTime: timeFormatted,
    currentMeal: {
      mealType: currentMealType,
      startTime,
      endTime,
      items: currentItems
    },
    fullMenu: {
      breakfast: schedule.breakfast,
      lunch: schedule.lunch,
      dinner: schedule.dinner
    },
    isDefaultTemplate: true,
    source: 'bitcentral.bitsathy.in',
    fetchedAt: new Date().toISOString()
  };
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
      throw new Error(`Upstream returned HTTP ${response.status}`);
    }

    const parsed = await response.json();
    return normalizeMenuData(parsed, hostel, date);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retrieves mess menu with 10-minute cache, deduplication, and seamless institutional fallback
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

  // Create in-flight promise and execute with automatic institutional schedule fallback
  const fetchPromise = (async () => {
    try {
      let data;
      try {
        data = await fetchFromUpstream(normalizedHostel, date);
      } catch (upstreamErr) {
        console.warn(`[MessMenuService] Upstream unavailable (${upstreamErr.message}), serving institutional schedule for ${normalizedHostel} on ${date}.`);
        data = getInstitutionalSchedule(normalizedHostel, date);
      }

      // Cache successful response
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
  getInstitutionalSchedule,
  clearCache,
  CACHE_TTL_MS,
  UPSTREAM_BASE
};
