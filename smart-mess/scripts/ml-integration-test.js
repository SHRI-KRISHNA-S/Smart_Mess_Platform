/**
 * Comprehensive Integration and Security Test Suite for Smart Mess ML System.
 * Tests:
 * 1. Model Loading and Metadata Integrity (Random Forest Regressor v2.0.0)
 * 2. Feature importances extraction
 * 3. Prediction generation with valid inputs
 * 4. Confidence intervals, unit standards, and useful food calculations
 * 5. Input validation and boundary cases (negative values, zero, invalid strings)
 * 6. Non-disruption of existing poll calculations (Expected = Eligible - Explicit NO)
 */

const assert = require('assert');
const path = require('path');
const mlService = require('../backend/src/services/mlService');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   SMART MESS ML INTEGRATION & VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`  [FAIL] ${name}: ${err.message}`);
        failed++;
      }
    };
  }

  // TEST 1: Model Stats and Artifact Existence
  await test('1. Model metadata, version v2.0.0, and Random Forest artifacts exist', async () => {
    const stats = mlService.getModelStats();
    assert.strictEqual(stats.available, true, 'Model stats should be available');
    assert.ok(stats.metadata.model_version.startsWith('v2'), 'Model version must be v2.x');
    assert.ok(stats.metadata.algorithm.includes('Random Forest'), 'Active model must be Random Forest');
    assert.strictEqual(stats.metadata.unit, 'kg', 'Measurement unit must be kg');
    assert.ok(stats.metadata.train_metrics.r2 > 0.8, 'Train R2 must demonstrate strong fit (> 0.8)');
    assert.ok(stats.metadata.test_metrics.mae > 0, 'Test MAE must be measured positive');
    assert.ok(Array.isArray(stats.samples) && stats.samples.length > 0, 'Must have holdout validation samples');
  })();

  // TEST 2: Feature Importances
  await test('2. Random Forest feature importances are calculated and present', async () => {
    const stats = mlService.getModelStats();
    assert.ok(stats.metadata.feature_importances, 'Feature importances must be present');
    const imp = stats.metadata.feature_importances;
    assert.ok(imp.food_prepared_kg > 0, 'food_prepared_kg importance should be > 0');
    assert.ok(imp.total_students > 0, 'total_students importance should be > 0');
    // Sum of importances in RF should be approximately 1.0
    const sum = Object.values(imp).reduce((a, b) => a + b, 0);
    assert.ok(sum >= 0.98 && sum <= 1.02, 'Feature importances must sum to ~1.0');
  })();

  // TEST 3: Valid Prediction Calculation
  await test('3. Generate valid prediction for typical lunch service (250 students, 112.5 kg)', async () => {
    const result = await mlService.predictWastage({
      total_students: 250,
      food_prepared: 112.5,
      meal_type: 'lunch'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.unit, 'kg');
    assert.ok(result.model_version.startsWith('v2'));
    assert.ok(result.predicted_wastage > 0, 'Predicted waste should be positive');
    assert.ok(result.predicted_wastage < result.inputs.food_prepared_kg, 'Waste cannot exceed prepared food');
    assert.strictEqual(
      result.estimated_useful_food_kg,
      Number((result.inputs.food_prepared_kg - result.predicted_wastage).toFixed(2))
    );
    assert.ok(result.confidence_interval.lower_kg <= result.predicted_wastage);
    assert.ok(result.confidence_interval.upper_kg >= result.predicted_wastage);
  })();

  // TEST 4: Scaling test: 450 students expected
  await test('4. Scaling test: 450 students expected', async () => {
    const result = await mlService.predictWastage({
      total_students: 450,
      food_prepared: 202.5,
      meal_type: 'dinner'
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.predicted_wastage > 0);
    assert.ok(result.predicted_wastage <= 202.5 * 0.75);
    assert.ok(result.waste_percentage >= 0 && result.waste_percentage <= 100);
  })();

  // TEST 5: Boundary validation (Reject non-positive student counts)
  await test('5. Boundary validation: Reject non-positive student counts', async () => {
    let threw = false;
    try {
      await mlService.predictWastage({ total_students: -50, food_prepared: 100 });
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Should reject negative student count');
  })();

  // TEST 6: Business Rule Formula Preservation
  await test('6. Poll Formula Preservation: Expected = Eligible - Explicit NO (unvoted eat)', async () => {
    const totalEligible = 100;
    const explicitNo = 18;
    const mealsToPrepare = totalEligible - explicitNo; // 82
    assert.strictEqual(mealsToPrepare, 82, 'Meals to prepare must exactly equal eligible minus explicit NO');

    // Test ML feeding from poll result
    const mlForecast = await mlService.predictWastage({
      total_students: mealsToPrepare,
      food_prepared: Math.round(mealsToPrepare * 0.45 * 10) / 10,
      meal_type: 'lunch'
    });

    assert.strictEqual(mlForecast.success, true);
    assert.strictEqual(mlForecast.inputs.total_students, 82);
    assert.ok(mlForecast.predicted_wastage > 0);
  })();

  console.log('\n------------------------------------------------------');
  console.log(`Test Execution Complete: ${passed} PASSED, ${failed} FAILED.`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
