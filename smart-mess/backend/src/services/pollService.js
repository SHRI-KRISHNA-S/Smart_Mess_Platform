const db = require('../config/db');

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

// Meal Metadata & Default Menus for all three meals
const MEAL_METADATA = {
  breakfast: {
    key: 'breakfast',
    displayName: 'Morning Tiffin',
    servingTime: '7:00 AM – 8:30 AM',
    title: 'Morning Tiffin Menu Preference Poll',
    description: 'Vote for your morning tiffin dining plan. Responses ensure fresh, hot preparation and zero breakfast food wastage.',
    defaultExpected: 100,
    defaultMenu: [
      {
        name: 'Ghee Podi Idli & Medu Vada',
        description: 'Steamed button idlis tossed in fragrant gun powder ghee, served with crispy medu vada, fresh coconut & tomato chutneys, and hot drumstick sambar.',
        display_order: 1
      },
      {
        name: 'Crispy Masala Dosa Feast',
        description: 'Golden roasted fermented rice crepe stuffed with spiced potato onion masala, accompanied by tangy sambar and mint coconut chutney.',
        display_order: 2
      },
      {
        name: 'Traditional Ven Pongal & Vada',
        description: 'Steamed raw rice and yellow moong dal tempered with crushed black pepper, cumin seeds, roasted cashews, and ginger, served with traditional gosthu.',
        display_order: 3
      },
      {
        name: 'Rava Kichadi & Fluffy Poori',
        description: 'Semolina roasted with colorful garden vegetables, herbs and ghee, paired with piping hot whole wheat pooris and potato peas kurma.',
        display_order: 4
      }
    ]
  },
  lunch: {
    key: 'lunch',
    displayName: 'Evening Lunch',
    servingTime: '12:30 PM – 1:30 PM',
    title: 'Evening Lunch Menu Preference Poll',
    description: 'Vote for your afternoon lunch dining plan. Responses help the culinary team prepare balanced portions.',
    defaultExpected: 100,
    defaultMenu: [
      {
        name: 'South Indian Traditional Thali',
        description: 'Steamed ponni rice, authentic spiced sambar, tangy rasam, kootu, poriyal, crispy appalam, curd, and sweet payasam.',
        display_order: 1
      },
      {
        name: 'North Indian Deluxe Combo',
        description: 'Phulkas with homemade butter, paneer butter masala, dal makhani slow-cooked overnight, jeera rice, fresh salad, and gulab jamun.',
        display_order: 2
      },
      {
        name: 'Dum Vegetable Biryani Bowl',
        description: 'Fragrant basmati rice layered with garden vegetables, saffron and whole spices, served with fresh mint onion raita, salan gravy, and roasted papad.',
        display_order: 3
      },
      {
        name: 'High-Fiber Millet & Veg Pulao',
        description: 'Foxtail and barnyard millet tossed with seasonal vegetables, herbs and roasted cashews, paired with vegetable raita and sprout salad.',
        display_order: 4
      }
    ]
  },
  dinner: {
    key: 'dinner',
    displayName: 'Night Dinner',
    servingTime: '7:00 PM – 8:15 PM',
    title: 'Night Dinner Menu Preference Poll',
    description: 'Vote for your evening dinner dining plan. Responses ensure optimal food preparation and prevent food waste.',
    defaultExpected: 100,
    defaultMenu: [
      {
        name: 'Soft Phulkas & Paneer Butter Masala',
        description: 'Freshly roasted whole wheat phulkas served with cottage cheese simmered in rich tomato cashew gravy, jeera pulao, and fresh salad.',
        display_order: 1
      },
      {
        name: 'Kal Dosa & Mixed Vegetable Kurma',
        description: 'Spongy soft homestyle kal dosas served with fragrant vegetable coconut kurma, spicy red chili garlic chutney, and warm milk.',
        display_order: 2
      },
      {
        name: 'Steamed Idiyappam & Coconut Stew',
        description: 'Handmade steamed string hoppers served with Kerala-style aromatic vegetable stew made with fresh coconut milk, and banana.',
        display_order: 3
      },
      {
        name: 'Whole Wheat Parotta & Veg Salna',
        description: 'Layered whole wheat parottas with spicy street-style vegetable salna, cucumber onion raita, and seasonal fruit cut.',
        display_order: 4
      }
    ]
  }
};

/**
 * Normalizes user-supplied meal type string to 'breakfast' | 'lunch' | 'dinner'
 */
function normalizeMealType(typeStr) {
  if (!typeStr) return 'lunch';
  const lower = String(typeStr).trim().toLowerCase();
  if (lower.includes('tiffin') || lower.includes('breakfast')) return 'breakfast';
  if (lower.includes('lunch')) return 'lunch';
  if (lower.includes('dinner')) return 'dinner';
  return 'lunch';
}

/**
 * Returns formatted date string (YYYY-MM-DD) in configured timezone
 */
function getLocalDateString(date = new Date(), tz = APP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Returns current timestamp string in local timezone (YYYY-MM-DD HH:mm:ss)
 */
function getLocalTimestampString(date = new Date(), tz = APP_TIMEZONE) {
  const dateStr = getLocalDateString(date, tz);
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const timeStr = timeFormatter.format(date);
  return `${dateStr} ${timeStr}`;
}

/**
 * Calculate the next calendar day string (YYYY-MM-DD) given a date string
 */
function getTomorrowDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return nextDay.toISOString().split('T')[0];
}

/**
 * Calculate the previous calendar day string (YYYY-MM-DD) given a date string
 */
function getYesterdayDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const prevDay = new Date(Date.UTC(year, month - 1, day - 1));
  return prevDay.toISOString().split('T')[0];
}

/**
 * Calculates authoritative automatic poll closing deadline in Asia/Kolkata (IST):
 * - Morning Tiffin (breakfast): 8:00 PM (20:00:00) on previous calendar day
 * - Evening Lunch (lunch): 8:00 PM (20:00:00) on previous calendar day
 * - Night Dinner (dinner): 10:00 AM (10:00:00) on same calendar day
 *
 * @param {string} mealDate YYYY-MM-DD
 * @param {string} mealType 'breakfast' | 'lunch' | 'dinner'
 * @returns {string} Timestamp string "YYYY-MM-DD HH:mm:ss" in Asia/Kolkata
 */
function getMealDeadline(mealDate, mealType) {
  const normType = normalizeMealType(mealType);
  if (normType === 'breakfast' || normType === 'lunch') {
    const prevDay = getYesterdayDateString(mealDate);
    return `${prevDay} 20:00:00`;
  }
  if (normType === 'dinner') {
    return `${mealDate} 10:00:00`;
  }
  const prevDay = getYesterdayDateString(mealDate);
  return `${prevDay} 20:00:00`;
}

/**
 * Formats deadline into user-friendly display string
 * e.g. "Oct 22, 2026, 08:00 PM IST (Previous day)"
 */
function formatDeadlineDisplay(deadlineStr, mealType) {
  if (!deadlineStr) return '';
  const [dPart, tPart] = deadlineStr.split(' ');
  const [year, month, day] = (dPart || '').split('-').map(Number);
  const [hour = 0, minute = 0] = (tPart || '').split(':').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const dateFormatted = dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
  const timeFormatted = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
  const relativeNotice = normalizeMealType(mealType) === 'dinner' ? 'Same day' : 'Previous day';
  return `${dateFormatted}, ${timeFormatted} IST (${relativeNotice})`;
}

/**
 * Checks whether a meal poll has closed according to local IST timestamp
 *
 * @param {string} mealDate
 * @param {string} mealType
 * @param {string|null} closesAt
 * @param {string|null} dateOverride
 * @param {string|null} timeOverride
 * @returns {boolean}
 */
function isMealPollClosed(mealDate, mealType, closesAt = null, dateOverride = null, timeOverride = null) {
  const deadlineStr = closesAt || getMealDeadline(mealDate, mealType);
  const nowLocalStr = dateOverride
    ? `${dateOverride} ${timeOverride || '12:00:00'}`
    : getLocalTimestampString(new Date(), APP_TIMEZONE);
  return nowLocalStr >= deadlineStr;
}

/**
 * Authoritative Meal Count Processing Logic:
 * The default meal count represents the expected meal count (default 100 or configured in poll).
 * Formula:
 *   Meals to Prepare = Expected Meal Count - Explicit NO Votes
 *
 * - Default logical vote for every student is YES.
 * - An unvoted student does NOT reduce the expected count.
 * - An explicit YES vote does NOT reduce expected count.
 * - Only an explicit NO vote reduces the meal preparation count by 1.
 * - Changing from NO to YES restores 1 meal.
 * - Changing from YES to NO reduces by 1 meal.
 * - Not Voted = Eligible Student Count - (Explicit YES Votes + Explicit NO Votes)
 */
async function getAuthoritativeMealCount(mealDate, mealType) {
  const normType = normalizeMealType(mealType);

  // 1. Fetch expected_count from polls table
  const [pollRows] = await db.query(
    'SELECT expected_count FROM polls WHERE meal_date = ? AND meal_type = ? LIMIT 1',
    [mealDate, normType]
  );
  const expectedCount = (pollRows.length > 0 && pollRows[0].expected_count !== null)
    ? Number(pollRows[0].expected_count)
    : 100;

  // 2. Determine actual eligible-student count for the selected meal and date (do not assume 100)
  const [studentRows] = await db.query(
    "SELECT COUNT(*) AS total_students FROM users WHERE role = 'student'"
  );
  const totalRegisteredStudents = Number(studentRows[0]?.total_students || 0);
  const eligibleStudentCount = totalRegisteredStudents > 0 ? totalRegisteredStudents : expectedCount;

  // 3. Fetch explicit vote counts from meal_votes
  const [rows] = await db.query(
    `SELECT
       COUNT(CASE WHEN role = 'student' AND vote_choice = 'YES' THEN 1 END) AS yes_votes_student,
       COUNT(CASE WHEN role = 'student' AND vote_choice = 'NO' THEN 1 END) AS no_votes_student,
       COUNT(CASE WHEN vote_choice = 'YES' THEN 1 END) AS total_yes_votes,
       COUNT(CASE WHEN vote_choice = 'NO' THEN 1 END) AS total_no_votes
     FROM meal_votes
     WHERE meal_type = ?
       AND meal_date = ?`,
    [normType, mealDate]
  );

  const yesVotes = Number(rows[0]?.yes_votes_student || 0);
  const noVotes = Number(rows[0]?.no_votes_student || 0);

  // Formula: Meals to Prepare = Expected Meal Count - Explicit NO Votes
  const mealsToPrepare = Math.max(0, expectedCount - noVotes);

  // Formula: Not Voted = Eligible Student Count - (Explicit YES Votes + Explicit NO Votes)
  const notVoted = Math.max(0, eligibleStudentCount - (yesVotes + noVotes));

  return {
    expectedCount,
    eligibleStudentCount,
    yesVotes,
    noVotes,
    notVoted,
    mealsToPrepare,
    // Preserved for backward compatibility with legacy tests
    mealCount: yesVotes,
    studentMealCount: yesVotes,
    totalYesCount: Number(rows[0]?.total_yes_votes || 0),
    totalNoCount: Number(rows[0]?.total_no_votes || 0)
  };
}

// Concurrency mutex flag for synchronization
let isSyncing = false;

/**
 * Idempotently synchronize daily polls for all three meals:
 * 1. Morning Tiffin (breakfast)
 * 2. Evening Lunch (lunch)
 * 3. Night Dinner (dinner)
 *
 * Enforces automatic deadlines in Asia/Kolkata (IST):
 * - Morning Tiffin: 8:00 PM previous day
 * - Evening Lunch: 8:00 PM previous day
 * - Night Dinner: 10:00 AM same day
 */
async function syncDailyPolls(dateOverride = null, timeOverride = null) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const todayStr = dateOverride || getLocalDateString(new Date(), APP_TIMEZONE);
    const targetMealDate = getTomorrowDateString(todayStr);
    const nowLocalStr = dateOverride
      ? `${dateOverride} ${timeOverride || '12:00:00'}`
      : getLocalTimestampString(new Date(), APP_TIMEZONE);

    // 1. Deactivate outdated polls whose cutoff has passed or meal_date is in past
    if (!dateOverride) {
      await db.execute(
        `UPDATE polls
         SET is_active = 0
         WHERE is_active = 1
           AND (
             (closes_at IS NOT NULL AND closes_at <= ?)
             OR meal_date < ?
           )`,
        [nowLocalStr, todayStr]
      );
    }

    // 2. Ensure active polls exist for all three meals for targetMealDate (and today's dinner if applicable)
    const mealTypesToSync = ['breakfast', 'lunch', 'dinner'];

    for (const mType of mealTypesToSync) {
      const targetClosesAt = getMealDeadline(targetMealDate, mType);
      const isPastCutoff = nowLocalStr >= targetClosesAt;

      const [existing] = await db.query(
        `SELECT id, title, description, meal_date, meal_type, is_active, closes_at, expected_count
         FROM polls
         WHERE meal_date = ? AND meal_type = ?
         LIMIT 1`,
        [targetMealDate, mType]
      );

      if (existing.length > 0) {
        const currentPoll = existing[0];
        // Ensure closes_at is accurate
        if (!currentPoll.closes_at || currentPoll.closes_at !== targetClosesAt) {
          await db.execute('UPDATE polls SET closes_at = ? WHERE id = ?', [targetClosesAt, currentPoll.id]);
        }
        // If past cutoff, deactivate
        if (isPastCutoff && currentPoll.is_active === 1) {
          await db.execute('UPDATE polls SET is_active = 0 WHERE id = ?', [currentPoll.id]);
        }
      } else {
        // Create the poll for targetMealDate & mType
        const meta = MEAL_METADATA[mType];
        const [insertRes] = await db.execute(
          `INSERT INTO polls (title, description, meal_date, meal_type, is_active, closes_at, expected_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            meta.displayName,
            meta.description,
            targetMealDate,
            mType,
            isPastCutoff ? 0 : 1,
            targetClosesAt,
            meta.defaultExpected || 100
          ]
        );
        const newPollId = insertRes.insertId;

        // Insert configured menu items
        for (const item of meta.defaultMenu) {
          await db.execute(
            `INSERT INTO menu_items (poll_id, name, description, display_order)
             VALUES (?, ?, ?, ?)`,
            [newPollId, item.name, item.description, item.display_order]
          );
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') {
      console.error('[PollService] Error syncing daily polls:', err);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Retrieve the current active poll (maintains backward compatibility with lunch / tomorrow)
 */
async function getActivePoll(dateOverride = null) {
  await syncDailyPolls(dateOverride);

  const todayStr = dateOverride || getLocalDateString(new Date(), APP_TIMEZONE);
  const targetMealDate = getTomorrowDateString(todayStr);

  // 1. Scheduled lunch poll for tomorrow
  const [targetRows] = await db.query(
    `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, expected_count, created_at
     FROM polls
     WHERE meal_date = ? AND meal_type = 'lunch'
     LIMIT 1`,
    [targetMealDate]
  );

  if (targetRows.length > 0) {
    return targetRows[0];
  }

  // 2. Any active poll for tomorrow
  const [anyTargetRows] = await db.query(
    `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, expected_count, created_at
     FROM polls
     WHERE meal_date = ?
     ORDER BY id ASC
     LIMIT 1`,
    [targetMealDate]
  );

  if (anyTargetRows.length > 0) {
    return anyTargetRows[0];
  }

  // 3. Any active upcoming poll
  const [activeRows] = await db.query(
    `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, expected_count, created_at
     FROM polls
     WHERE is_active = 1
       AND meal_date >= ?
     ORDER BY meal_date ASC, id ASC
     LIMIT 1`,
    [todayStr]
  );

  if (activeRows.length > 0) {
    return activeRows[0];
  }

  return null;
}

/**
 * Retrieve complete data for all three meal polls:
 * 1. Morning Tiffin (breakfast)
 * 2. Evening Lunch (lunch)
 * 3. Night Dinner (dinner)
 *
 * For Student and Faculty:
 * - Hides total meal count, expected count, yes/no counts, and meals-to-prepare.
 * - Shows only meal name/date, status, deadline, question ("Whether you eat or not?"),
 *   user's own selection, and menu options.
 *
 * For Admin:
 * - Includes expectedCount, yesVotes, noVotes, notVoted, and mealsToPrepare.
 *
 * @param {string|null} dateOverride YYYY-MM-DD
 * @param {string|null} timeOverride HH:mm:ss
 * @param {number|null} userId
 * @param {string|null} userRole 'student' | 'faculty' | 'admin'
 */
async function getThreeMealPolls(dateOverride = null, timeOverride = null, userId = null, userRole = 'student') {
  await syncDailyPolls(dateOverride, timeOverride);

  const todayStr = dateOverride || getLocalDateString(new Date(), APP_TIMEZONE);
  const targetMealDate = getTomorrowDateString(todayStr);
  const nowLocalStr = dateOverride
    ? `${dateOverride} ${timeOverride || '12:00:00'}`
    : getLocalTimestampString(new Date(), APP_TIMEZONE);

  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const mealsData = {};

  const isAdmin = userRole === 'admin';

  for (const mType of mealTypes) {
    const meta = MEAL_METADATA[mType];

    // Find poll
    const [pollRows] = await db.query(
      `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, expected_count
       FROM polls
       WHERE meal_date = ? AND meal_type = ?
       LIMIT 1`,
      [targetMealDate, mType]
    );

    let poll = pollRows[0];
    if (!poll) {
      await syncDailyPolls(dateOverride, timeOverride);
      const [retryRows] = await db.query(
        `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, expected_count
         FROM polls
         WHERE meal_date = ? AND meal_type = ?
         LIMIT 1`,
        [targetMealDate, mType]
      );
      poll = retryRows[0];
    }

    const pollId = poll?.id || null;
    const deadlineStr = poll?.closes_at
      ? typeof poll.closes_at === 'string'
        ? poll.closes_at.slice(0, 19).replace('T', ' ')
        : getLocalTimestampString(new Date(poll.closes_at), APP_TIMEZONE)
      : getMealDeadline(targetMealDate, mType);

    const isPastCutoff = nowLocalStr >= deadlineStr;
    const isClosed = !poll?.is_active || isPastCutoff;
    const status = isClosed ? 'Closed' : 'Open';

    // Fetch menu items
    let menuItems = [];
    if (pollId) {
      const [items] = await db.query(
        `SELECT id, name, description, display_order
         FROM menu_items
         WHERE poll_id = ?
         ORDER BY display_order ASC`,
        [pollId]
      );
      menuItems = items;
    }
    if (menuItems.length === 0) {
      menuItems = meta.defaultMenu.map((m, idx) => ({ id: idx + 1, ...m }));
    }

    // User's own vote for this meal and date
    let userVote = 'Not voted';
    let hasVoted = false;
    let votedAt = null;

    if (userId) {
      const [voteRows] = await db.query(
        `SELECT will_eat, vote_choice, responded_at
         FROM meal_responses
         WHERE user_id = ? AND meal_date = ? AND meal_type = ?
         LIMIT 1`,
        [userId, targetMealDate, mType]
      );
      if (voteRows.length > 0) {
        hasVoted = true;
        userVote = voteRows[0].will_eat === 1 ? 'YES' : 'NO';
        votedAt = voteRows[0].responded_at;
      }
    }

    // Default logical vote: YES (assumed eating by default unless explicitly NO)
    const defaultVote = 'YES';
    const logicalVote = (hasVoted && userVote === 'NO') ? 'NO' : 'YES';

    // Helpful status message
    let statusMessage = '';
    if (isClosed) {
      statusMessage = 'This poll is closed. Voting is no longer available.';
    } else if (hasVoted && userVote === 'NO') {
      statusMessage = 'Your response is recorded: Skipping meal.';
    } else if (hasVoted && userVote === 'YES') {
      statusMessage = 'Your response is recorded: Attending meal.';
    } else {
      statusMessage = 'You have not voted yet.';
    }

    // Base object visible to all (Students & Faculty see only this)
    const mealObj = {
      pollId,
      mealType: mType,
      mealName: meta.displayName,
      mealDate: targetMealDate,
      closesAt: deadlineStr,
      deadlineFormatted: formatDeadlineDisplay(deadlineStr, mType),
      isClosed,
      status,
      userVote,
      hasVoted,
      defaultVote,
      logicalVote,
      votedAt,
      servingTime: meta.servingTime,
      servingFormatted: `Serving: ${meta.servingTime}`,
      question: 'Whether you eat or not?',
      statusMessage,
      menuItems
    };

    // Admin-only detailed meal intelligence
    if (isAdmin) {
      const counts = await getAuthoritativeMealCount(targetMealDate, mType);
      mealObj.expectedCount = counts.expectedCount;
      mealObj.eligibleStudentCount = counts.eligibleStudentCount;
      mealObj.yesVotes = counts.yesVotes;
      mealObj.noVotes = counts.noVotes;
      mealObj.notVoted = counts.notVoted;
      mealObj.mealsToPrepare = counts.mealsToPrepare;
      mealObj.mealCount = counts.mealCount;
      mealObj.studentMealCount = counts.studentMealCount;
      mealObj.totalYesCount = counts.totalYesCount;
      mealObj.totalNoCount = counts.totalNoCount;
    }

    mealsData[mType] = mealObj;
  }

  return {
    targetMealDate,
    today: todayStr,
    currentTimeIST: nowLocalStr,
    meals: mealsData
  };
}

// Background scheduler handle
let schedulerInterval = null;

function startDailyPollScheduler(intervalMs = 30000) {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    syncDailyPolls().catch(err => {
      console.error('[Poll Scheduler] Error in background poll sync:', err);
    });
  }, intervalMs);
}

function stopDailyPollScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = {
  APP_TIMEZONE,
  MEAL_METADATA,
  normalizeMealType,
  getLocalDateString,
  getLocalTimestampString,
  getTomorrowDateString,
  getYesterdayDateString,
  getMealDeadline,
  formatDeadlineDisplay,
  isMealPollClosed,
  getAuthoritativeMealCount,
  syncDailyPolls,
  getActivePoll,
  getThreeMealPolls,
  startDailyPollScheduler,
  stopDailyPollScheduler
};
