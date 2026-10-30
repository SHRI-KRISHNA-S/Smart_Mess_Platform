const express = require('express');
const { z } = require('zod');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const pollService = require('../services/pollService');

const router = express.Router();

const mealIntentSchema = z.object({
  mealDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'mealDate must be in YYYY-MM-DD format'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner'], {
    errorMap: () => ({ message: "mealType must be 'breakfast', 'lunch', or 'dinner'" })
  }),
  willEat: z.boolean({
    required_error: 'willEat is required',
    invalid_type_error: 'willEat must be strictly a boolean (true or false)'
  })
});

// Helper: Determine the upcoming meal details and cutoff timestamp
async function getUpcomingMealInfo(dateOverride = null, timeOverride = null) {
  // Sync and fetch active poll first
  const activePoll = await pollService.getActivePoll(dateOverride);

  let targetDate;
  let targetType;
  let cutoffDate;
  let isClosed = false;

  if (activePoll) {
    targetDate = typeof activePoll.meal_date === 'string'
      ? activePoll.meal_date
      : pollService.getLocalDateString(new Date(activePoll.meal_date));
    targetType = activePoll.meal_type;

    isClosed = pollService.isMealPollClosed(targetDate, targetType, activePoll.closes_at, dateOverride, timeOverride);
    cutoffDate = activePoll.closes_at ? new Date(activePoll.closes_at) : new Date(pollService.getMealDeadline(targetDate, targetType));
  } else {
    // Fallback: tomorrow lunch
    const todayStr = dateOverride || pollService.getLocalDateString();
    targetDate = pollService.getTomorrowDateString(todayStr);
    targetType = 'lunch';

    isClosed = pollService.isMealPollClosed(targetDate, targetType, null, dateOverride, timeOverride);
    cutoffDate = new Date(pollService.getMealDeadline(targetDate, targetType));
  }

  const canChange = !isClosed;

  return {
    date: targetDate,
    type: targetType,
    cutoff: cutoffDate,
    canChange
  };
}

// GET /api/notifications/meal-intent
// Returns pending status, meal date/type, user answer, and canChange flag
router.get('/notifications/meal-intent', requireAuth, async (req, res, next) => {
  try {
    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const testTime = req.headers['x-test-time'] || (req.query.test_time && process.env.NODE_ENV !== 'production' ? req.query.test_time : null);
    const upcoming = await getUpcomingMealInfo(testDate, testTime);
    const userId = req.user.id;

    const [responses] = await db.query(
      `SELECT will_eat, responded_at, updated_at
       FROM meal_responses
       WHERE user_id = ? AND meal_date = ? AND meal_type = ?`,
      [userId, upcoming.date, upcoming.type]
    );

    const answered = responses.length > 0;
    const answer = answered ? Boolean(responses[0].will_eat) : null;

    // pending is true if student has NOT answered yet AND the cutoff has not passed
    const pending = !answered && upcoming.canChange;

    return res.json({
      pending,
      meal: {
        date: upcoming.date,
        type: upcoming.type
      },
      answer,
      canChange: upcoming.canChange,
      cutoff: upcoming.cutoff.toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/meal-intent
// Records or updates student intention with INSERT ... ON DUPLICATE KEY UPDATE
router.put('/meal-intent', requireAuth, validateBody(mealIntentSchema), async (req, res, next) => {
  try {
    const { mealDate, mealType, willEat } = req.body;
    const userId = req.user.id;

    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const testTime = req.headers['x-test-time'] || (req.query.test_time && process.env.NODE_ENV !== 'production' ? req.query.test_time : null);
    const upcoming = await getUpcomingMealInfo(testDate, testTime);

    // Verify this is for the upcoming meal
    if (mealDate !== upcoming.date || mealType !== upcoming.type) {
      return res.status(400).json({
        error: 'Invalid target meal',
        details: `Intention submissions are only permitted for the upcoming meal (${upcoming.type} on ${upcoming.date}).`
      });
    }

    // Check cutoff
    if (!upcoming.canChange) {
      return res.status(409).json({
        error: 'Response locked',
        details: 'The response cutoff time for this meal has passed. Answers can no longer be submitted or changed.'
      });
    }

    const willEatInt = willEat ? 1 : 0;
    const voteChoice = willEat ? 'YES' : 'NO';

    await db.execute(
      `INSERT INTO meal_responses (user_id, meal_date, meal_type, will_eat, vote_choice, responded_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         will_eat = VALUES(will_eat),
         vote_choice = VALUES(vote_choice),
         updated_at = NOW()`,
      [userId, mealDate, mealType, willEatInt, voteChoice]
    );

    const responsePayload = {
      message: 'Meal intention response recorded successfully',
      mealDate,
      mealType,
      willEat,
      voteChoice,
      canChange: upcoming.canChange
    };

    if (req.user.role === 'admin') {
      const counts = await pollService.getAuthoritativeMealCount(mealDate, mealType);
      responsePayload.mealCount = counts.mealCount;
      responsePayload.mealsToPrepare = counts.mealsToPrepare;
      responsePayload.expectedCount = counts.expectedCount;
      responsePayload.yesVotes = counts.yesVotes;
      responsePayload.noVotes = counts.noVotes;
      responsePayload.notVoted = counts.notVoted;
    }

    return res.json(responsePayload);
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
  getUpcomingMealInfo
};
