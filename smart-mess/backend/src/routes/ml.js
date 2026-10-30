/**
 * ML Prediction and Model Management Routes for Smart Mess.
 * Exposes secure endpoints for food wastage forecasting and model evaluation analytics.
 */

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const mlService = require('../services/mlService');

const router = express.Router();

// Strict Zod schema for prediction requests
const predictWastageSchema = z.object({
  total_students: z.number({
    required_error: 'total_students is required',
    invalid_type_error: 'total_students must be an integer'
  }).int('total_students must be an integer').positive('total_students must be greater than 0'),
  food_prepared: z.number({
    invalid_type_error: 'food_prepared must be a number'
  }).positive('food_prepared must be a positive number').optional(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner'], {
    errorMap: () => ({ message: "meal_type must be 'breakfast', 'lunch', or 'dinner'" })
  }).optional(),
  historical_wastage: z.number().nonnegative('historical_wastage cannot be negative').optional(),
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'meal_date must be YYYY-MM-DD').optional()
});

// Protect all ML routes: Only authenticated administrators can access predictions
router.use(requireAuth);
router.use(requireAdmin);

/**
 * POST /api/ml/predict-wastage
 * Predicts food wastage based on expected student headcount and planned food quantity.
 */
router.post('/predict-wastage', validateBody(predictWastageSchema), async (req, res, next) => {
  try {
    const { total_students, food_prepared, meal_type, historical_wastage, meal_date } = req.body;

    const prediction = await mlService.predictWastage({
      total_students,
      food_prepared,
      meal_type: meal_type || 'lunch',
      historical_wastage,
      meal_date
    });

    return res.json({
      success: true,
      predicted_wastage: prediction.predicted_wastage,
      unit: prediction.unit || 'kg',
      model_version: prediction.model_version || 'v1.0.0',
      message: 'Prediction generated successfully',
      inputs: prediction.inputs,
      estimated_useful_food_kg: prediction.estimated_useful_food_kg,
      waste_percentage: prediction.waste_percentage,
      confidence_interval: prediction.confidence_interval,
      evaluation_summary: prediction.evaluation_summary,
      timestamp: prediction.timestamp,
      source: prediction.source
    });
  } catch (err) {
    console.error('[MLRoute] Prediction generation error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate prediction',
      details: err.message
    });
  }
});

/**
 * GET /api/ml/stats
 * Returns model architecture metadata, evaluation metrics, and validation samples.
 */
router.get('/stats', (req, res) => {
  try {
    const stats = mlService.getModelStats();
    if (!stats.available) {
      return res.status(503).json({
        success: false,
        error: 'Model metadata not available. Please ensure model training has been completed.'
      });
    }

    return res.json({
      success: true,
      metadata: stats.metadata,
      samples: stats.samples
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve model stats',
      details: err.message
    });
  }
});

/**
 * GET /api/ml/health
 * Public-to-admin health check for the ML engine.
 */
router.get('/health', (req, res) => {
  const stats = mlService.getModelStats();
  res.json({
    status: stats.available ? 'ready' : 'not_trained',
    service: 'smart-mess-ml-integration',
    modelVersion: stats.metadata?.model_version || 'none'
  });
});

module.exports = router;
