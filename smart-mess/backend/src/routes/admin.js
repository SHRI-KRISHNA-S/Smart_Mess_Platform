const express = require('express');
const { z } = require('zod');
const db = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const pollService = require('../services/pollService');

const router = express.Router();

// Apply auth and admin check to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

const patchPollSchema = z.object({
  is_active: z.boolean({
    required_error: 'is_active is required',
    invalid_type_error: 'is_active must be a boolean'
  })
});

const mealIntentQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  type: z.enum(['breakfast', 'lunch', 'dinner'], {
    errorMap: () => ({ message: "type must be 'breakfast', 'lunch', or 'dinner'" })
  })
});

// GET /api/admin/polls - List all polls
router.get('/polls', async (req, res, next) => {
  try {
    const [polls] = await db.query(
      `SELECT p.id, p.title, p.description, p.meal_date, p.meal_type, p.is_active, p.closes_at, p.created_at,
              COUNT(DISTINCT v.id) AS total_votes
       FROM polls p
       LEFT JOIN votes v ON p.id = v.poll_id
       GROUP BY p.id
       ORDER BY p.id DESC`
    );

    return res.json({ polls });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/polls/:id/results - Comprehensive breakdown
router.get('/polls/:id/results', async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [polls] = await db.query('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'Poll not found' });
    }
    const poll = polls[0];

    // Total registered students and faculty count
    const [userCountRows] = await db.query(
      "SELECT role, COUNT(*) AS count FROM users WHERE role IN ('student', 'faculty') GROUP BY role"
    );
    let registeredStudentCount = 0;
    let registeredFacultyCount = 0;
    userCountRows.forEach(r => {
      if (r.role === 'student') registeredStudentCount = Number(r.count);
      if (r.role === 'faculty') registeredFacultyCount = Number(r.count);
    });
    const totalRegisteredUsers = registeredStudentCount + registeredFacultyCount;

    // Items breakdown
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
        ...item,
        vote_count: count,
        percentage
      };
    });

    // Student type breakdown (home vs external - preserved for historical votes)
    const [typeRows] = await db.query(
      `SELECT u.student_type, COUNT(v.id) AS count
       FROM votes v
       JOIN users u ON v.user_id = u.id
       WHERE v.poll_id = ?
       GROUP BY u.student_type`,
      [pollId]
    );

    const breakdownByType = {
      home: 0,
      external: 0
    };
    typeRows.forEach(r => {
      if (r.student_type === 'home') breakdownByType.home = Number(r.count);
      if (r.student_type === 'external') breakdownByType.external = Number(r.count);
    });

    // Detailed voters table
    const [voters] = await db.query(
      `SELECT v.id, u.name AS user_name, u.college_name, u.role, u.student_type, mi.name AS choice, v.created_at AS voted_at
       FROM votes v
       JOIN users u ON v.user_id = u.id
       JOIN menu_items mi ON v.menu_item_id = mi.id
       WHERE v.poll_id = ?
       ORDER BY v.created_at DESC`,
      [pollId]
    );

    return res.json({
      poll,
      totalVotes,
      registeredStudentCount,
      registeredFacultyCount,
      totalRegisteredUsers,
      options: itemsWithPercent,
      breakdownByType,
      voters
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/polls/:id - Open or close poll (Opening one closes all others)
router.patch('/polls/:id', validateBody(patchPollSchema), async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [existing] = await db.query('SELECT id, title FROM polls WHERE id = ?', [pollId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'Poll does not exist' });
    }

    if (is_active) {
      // Opening this poll: close other active polls of the same meal type
      const [targetPoll] = await db.query('SELECT meal_type FROM polls WHERE id = ?', [pollId]);
      const mType = targetPoll[0]?.meal_type;
      if (mType) {
        await db.execute('UPDATE polls SET is_active = 0 WHERE id != ? AND meal_type = ?', [pollId, mType]);
      } else {
        await db.execute('UPDATE polls SET is_active = 0 WHERE id != ?', [pollId]);
      }
      await db.execute('UPDATE polls SET is_active = 1 WHERE id = ?', [pollId]);
    } else {
      // Closing this poll
      await db.execute('UPDATE polls SET is_active = 0 WHERE id = ?', [pollId]);
    }

    const [updated] = await db.query('SELECT * FROM polls WHERE id = ?', [pollId]);

    return res.json({
      message: `Poll has been ${is_active ? 'opened' : 'closed'} successfully.`,
      poll: updated[0]
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/meal-intent?date=YYYY-MM-DD&type=lunch
router.get('/meal-intent', validateQuery(mealIntentQuerySchema), async (req, res, next) => {
  try {
    const { date, type } = req.query;

    // Total registered students and faculty
    const [userRows] = await db.query(
      `SELECT role, COUNT(*) AS count
       FROM users
       WHERE role IN ('student', 'faculty')
       GROUP BY role`
    );

    let totalUsers = 0;
    let studentTotal = 0;
    let facultyTotal = 0;

    userRows.forEach(r => {
      const c = Number(r.count);
      totalUsers += c;
      if (r.role === 'student') studentTotal = c;
      if (r.role === 'faculty') facultyTotal = c;
    });

    // Responses for this meal
    const [responses] = await db.query(
      `SELECT mr.will_eat, u.role, COUNT(*) AS count
       FROM meal_responses mr
       JOIN users u ON mr.user_id = u.id
       WHERE mr.meal_date = ? AND mr.meal_type = ?
       GROUP BY mr.will_eat, u.role`,
      [date, type]
    );

    let yesCount = 0;
    let noCount = 0;
    let yesStudent = 0;
    let yesFaculty = 0;
    let noStudent = 0;
    let noFaculty = 0;

    responses.forEach(r => {
      const cnt = Number(r.count);
      if (r.will_eat === 1) {
        yesCount += cnt;
        if (r.role === 'faculty') yesFaculty += cnt;
        else yesStudent += cnt;
      } else {
        noCount += cnt;
        if (r.role === 'faculty') noFaculty += cnt;
        else noStudent += cnt;
      }
    });

    const totalAnswered = yesCount + noCount;
    const noResponseCount = Math.max(0, totalUsers - totalAnswered);
    const yesPercent = totalUsers > 0 ? Math.round((yesCount / totalUsers) * 100) : 0;
    const noPercent = totalUsers > 0 ? Math.round((noCount / totalUsers) * 100) : 0;
    const noResponsePercent = totalUsers > 0 ? Math.round((noResponseCount / totalUsers) * 100) : 0;
    const responseRate = totalUsers > 0 ? Math.round((totalAnswered / totalUsers) * 100) : 0;

    // Fetch expected meals from polls
    const [pollRows] = await db.query(
      'SELECT expected_count FROM polls WHERE meal_date = ? AND meal_type = ? LIMIT 1',
      [date, type]
    );
    const expectedMeals = (pollRows.length > 0 && pollRows[0].expected_count !== null)
      ? Number(pollRows[0].expected_count)
      : 100;

    const mealsToPrepare = Math.max(0, expectedMeals - noStudent);
    const eligibleStudentCount = studentTotal > 0 ? studentTotal : expectedMeals;
    const notVotedCount = Math.max(0, eligibleStudentCount - (yesStudent + noStudent));

    return res.json({
      meal: { date, type },
      expectedMeals,
      expectedCount: expectedMeals,
      eligibleStudentCount,
      yesVotes: yesStudent,
      noVotes: noStudent,
      notVoted: notVotedCount,
      mealsToPrepare,
      totalRegisteredStudents: studentTotal, // Preserved for compatibility
      totalRegisteredUsers: totalUsers,
      summary: {
        yes: { count: yesCount, percentage: yesPercent },
        no: { count: noCount, percentage: noPercent },
        noResponse: { count: noResponseCount, percentage: noResponsePercent },
        responseRate
      },
      splitByRole: {
        yes: { student: yesStudent, faculty: yesFaculty },
        no: { student: noStudent, faculty: noFaculty },
        totalUsersByRole: { student: studentTotal, faculty: facultyTotal }
      },
      splitByStudentType: {
        yes: { home: yesStudent, external: yesFaculty },
        no: { home: noStudent, external: noFaculty },
        totalStudentsByType: { home: studentTotal, external: facultyTotal }
      },
      notice: "Meal intentions are self-reported plans from students and faculty who responded. They do not constitute an attendance record or complete demand forecast."
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/three-meals-stats?date=YYYY-MM-DD
// Returns detailed meal statistics for Morning Tiffin, Evening Lunch, Night Dinner
router.get('/three-meals-stats', async (req, res, next) => {
  try {
    const requestedDate = req.query.date || null;
    const data = await pollService.getThreeMealPolls(requestedDate, null, req.user.id, 'admin');
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/polls/:id/expected-count
// Updates expected meals count for a poll
const patchExpectedCountSchema = z.object({
  expected_count: z.number().int().min(0).optional(),
  expectedCount: z.number().int().min(0).optional()
}).refine(data => data.expected_count !== undefined || data.expectedCount !== undefined, {
  message: 'Valid expectedCount integer is required'
});

router.patch('/polls/:id/expected-count', validateBody(patchExpectedCountSchema), async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    const count = req.body.expected_count !== undefined ? req.body.expected_count : req.body.expectedCount;

    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID' });
    }

    await db.execute('UPDATE polls SET expected_count = ? WHERE id = ?', [count, pollId]);
    const [updated] = await db.query('SELECT * FROM polls WHERE id = ?', [pollId]);

    return res.json({
      message: 'Expected meal count updated successfully',
      poll: updated[0]
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
