const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');
const { getMessMenu, isValidDate } = require('../services/messMenuService');

const router = express.Router();

// Apply auth to require valid session (Student, Faculty, Admin)
router.use(requireAuth);

const messMenuQuerySchema = z.object({
  hostel: z
    .enum(['boys', 'girls'], {
      errorMap: () => ({ message: "hostel must be either 'boys' or 'girls'" })
    })
    .default('boys'),
  date: z
    .string({ required_error: 'date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in 'YYYY-MM-DD' format")
    .refine((d) => isValidDate(d), {
      message: 'date must be a valid calendar date'
    }),
  refresh: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((val) => val === 'true' || val === '1')
});

// GET /api/mess-menu
router.get('/', validateQuery(messMenuQuerySchema), async (req, res, next) => {
  try {
    const { hostel, date, refresh } = req.query;

    const menu = await getMessMenu({
      hostel,
      date,
      refresh: Boolean(refresh)
    });

    return res.json(menu);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
