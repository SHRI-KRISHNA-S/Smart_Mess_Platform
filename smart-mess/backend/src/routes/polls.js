const express = require('express');
const { z } = require('zod');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const pollService = require('../services/pollService');

const router = express.Router();

const voteVoteChoiceSchema = z.object({
  mealDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'mealDate must be in YYYY-MM-DD format'),
  mealType: z.string().min(1, 'mealType is required'),
  voteChoice: z.enum(['YES', 'NO', 'yes', 'no']).optional(),
  willEat: z.boolean().optional()
}).refine(data => data.voteChoice !== undefined || data.willEat !== undefined, {
  message: "Either voteChoice ('YES' or 'NO') or willEat (boolean) is required"
});

// Helper to calculate results for a poll
async function getPollResultsData(pollId) {
  const [items] = await db.query(
    `SELECT mi.id, mi.name, mi.description, mi.display_order,
            COUNT(v.id) AS vote_count
     FROM menu_items mi
     LEFT JOIN votes v ON mi.id = v.menu_item_id AND v.poll_id = ?
     WHERE mi.poll_id = ?
     GROUP BY mi.id, mi.name, mi.description, mi.display_order
     ORDER BY mi.display_order ASC`,
    [pollId, pollId]
  );

  const totalVotes = items.reduce((sum, item) => sum + Number(item.vote_count), 0);

  const itemsWithPercent = items.map(item => {
    const count = Number(item.vote_count);
    const percentage = totalVotes > 0 ? Number(((count / totalVotes) * 100).toFixed(1)) : 0;
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      display_order: item.display_order,
      vote_count: count,
      percentage
    };
  });

  return {
    totalVotes,
    items: itemsWithPercent
  };
}

// GET /api/polls/three-meals
// Returns data for Morning Tiffin, Evening Lunch, and Night Dinner
// For student/faculty, detailed count intelligence is strictly omitted
router.get('/three-meals', requireAuth, async (req, res, next) => {
  try {
    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const testTime = req.headers['x-test-time'] || (req.query.test_time && process.env.NODE_ENV !== 'production' ? req.query.test_time : null);
    const userRole = req.user?.role || 'student';
    const data = await pollService.getThreeMealPolls(testDate, testTime, req.user.id, userRole);
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/polls/active
// Returns active poll + threeMeals data (counts hidden from non-admin)
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const testTime = req.headers['x-test-time'] || (req.query.test_time && process.env.NODE_ENV !== 'production' ? req.query.test_time : null);
    const userRole = req.user?.role || 'student';
    const poll = await pollService.getActivePoll(testDate);

    if (!poll) {
      return res.json({
        poll: null,
        message: 'No active poll currently available.'
      });
    }

    const pollId = poll.id;

    // Check user's own vote for historical poll
    const [myVotes] = await db.query(
      `SELECT v.id, v.menu_item_id, v.created_at, mi.name AS menu_item_name
       FROM votes v
       JOIN menu_items mi ON v.menu_item_id = mi.id
       WHERE v.poll_id = ? AND v.user_id = ?`,
      [pollId, req.user.id]
    );

    const userVote = myVotes.length > 0 ? {
      voted: true,
      menu_item_id: myVotes[0].menu_item_id,
      menu_item_name: myVotes[0].menu_item_name,
      voted_at: myVotes[0].created_at
    } : { voted: false, menu_item_id: null, menu_item_name: null };

    // Get items and results
    const results = await getPollResultsData(pollId);

    // Check cutoff
    const isClosed = pollService.isMealPollClosed(poll.meal_date, poll.meal_type, poll.closes_at, testDate, testTime);

    // Fetch three meals payload with role-based count filtering
    const threeMealsData = await pollService.getThreeMealPolls(testDate, testTime, req.user.id, userRole);

    return res.json({
      poll: {
        ...poll,
        is_closed: !poll.is_active || isClosed
      },
      userVote,
      results,
      threeMeals: threeMealsData.meals,
      meals: threeMealsData.meals
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/polls/:id/results
router.get('/:id/results', requireAuth, async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [polls] = await db.query('SELECT id, title, is_active, closes_at FROM polls WHERE id = ?', [pollId]);
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'No poll with this ID exists' });
    }

    const results = await getPollResultsData(pollId);

    return res.json({
      pollId,
      ...results
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/polls/vote
// Submit or update a YES / NO vote for a meal poll with strict deadline enforcement
router.post('/vote', requireAuth, validateBody(voteVoteChoiceSchema), async (req, res, next) => {
  try {
    const { mealDate } = req.body;
    const mealType = pollService.normalizeMealType(req.body.mealType);
    const willEat = req.body.voteChoice !== undefined
      ? req.body.voteChoice.toUpperCase() === 'YES'
      : Boolean(req.body.willEat);
    const voteChoice = willEat ? 'YES' : 'NO';

    // Validate role permissions: only students and faculty (residents) vote
    if (!['student', 'faculty'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        details: 'Only eligible students and residents are permitted to vote. Kitchen admin cannot vote in meal polls.'
      });
    }

    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const testTime = req.headers['x-test-time'] || (req.query.test_time && process.env.NODE_ENV !== 'production' ? req.query.test_time : null);

    // 1. Check if poll exists in database and if it was closed
    const [pollRows] = await db.query(
      'SELECT id, is_active, closes_at FROM polls WHERE meal_date = ? AND meal_type = ?',
      [mealDate, mealType]
    );

    const isCutoffPassed = pollService.isMealPollClosed(
      mealDate,
      mealType,
      pollRows[0]?.closes_at || null,
      testDate,
      testTime
    );

    const isPollClosed = (pollRows.length > 0 && pollRows[0].is_active === 0) || isCutoffPassed;

    if (isPollClosed) {
      return res.status(409).json({
        error: 'Poll closed',
        details: 'This poll is closed. Voting is no longer available.',
        isClosed: true
      });
    }

    // 2. Insert or update vote (One vote per student per meal per date)
    const willEatInt = willEat ? 1 : 0;
    await db.execute(
      `INSERT INTO meal_responses (user_id, meal_date, meal_type, will_eat, vote_choice, responded_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         will_eat = VALUES(will_eat),
         vote_choice = VALUES(vote_choice),
         updated_at = NOW()`,
      [req.user.id, mealDate, mealType, willEatInt, voteChoice]
    );

    // 3. Status message based on vote
    const statusMessage = willEat
      ? 'Your response is recorded: Attending meal.'
      : 'Your response is recorded: Skipping meal.';

    const responsePayload = {
      message: 'Vote recorded successfully',
      mealDate,
      mealType,
      voteChoice,
      willEat,
      hasVoted: true,
      userVote: voteChoice,
      logicalVote: voteChoice,
      defaultVote: 'YES',
      isClosed: false,
      statusMessage
    };

    // Detailed counts are exposed ONLY to authorized Admin accounts
    if (req.user.role === 'admin') {
      const counts = await pollService.getAuthoritativeMealCount(mealDate, mealType);
      responsePayload.expectedCount = counts.expectedCount;
      responsePayload.eligibleStudentCount = counts.eligibleStudentCount;
      responsePayload.yesVotes = counts.yesVotes;
      responsePayload.noVotes = counts.noVotes;
      responsePayload.notVoted = counts.notVoted;
      responsePayload.mealsToPrepare = counts.mealsToPrepare;
      responsePayload.mealCount = counts.mealCount;
      responsePayload.studentMealCount = counts.studentMealCount;
      responsePayload.totalYesCount = counts.totalYesCount;
      responsePayload.totalNoCount = counts.totalNoCount;
    }

    return res.json(responsePayload);
  } catch (err) {
    next(err);
  }
});

// POST /api/polls/:id/vote
// Preference poll voting has been decommissioned. External student voting permissions are rejected.
router.post('/:id/vote', requireAuth, async (req, res) => {
  return res.status(403).json({
    error: 'Forbidden',
    details: 'Preference poll voting has been decommissioned. External student voting is no longer supported.'
  });
});

module.exports = router;
