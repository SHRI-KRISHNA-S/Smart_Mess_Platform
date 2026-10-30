/**
 * ML Service Client for Smart Mess Backend.
 * Connects Express backend with Python ML prediction engine with seamless fallback
 * to local Python script execution if the HTTP microservice is offline.
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';

// Determine python path (prefer local ml virtual environment if present)
const ML_VENV_PYTHON = path.resolve(__dirname, '../../../ml/.venv/Scripts/python.exe');
const SYSTEM_PYTHON = 'python';
const PYTHON_EXEC = fs.existsSync(ML_VENV_PYTHON) ? ML_VENV_PYTHON : SYSTEM_PYTHON;

const PREDICT_SCRIPT = path.resolve(__dirname, '../../../ml/src/predict.py');
const METADATA_FILE = path.resolve(__dirname, '../../../ml/models/model_metadata.json');
const SAMPLES_FILE = path.resolve(__dirname, '../../../ml/reports/actual_vs_predicted_samples.json');

/**
 * Executes inference by calling the FastAPI service or falling back to local python CLI.
 */
async function predictWastage(params) {
  const { total_students, food_prepared, meal_type, historical_wastage, meal_date } = params;

  // 1. Attempt HTTP microservice request
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_students: Number(total_students),
        food_prepared: food_prepared !== undefined ? Number(food_prepared) : undefined,
        meal_type: meal_type || 'lunch',
        historical_wastage: historical_wastage !== undefined ? Number(historical_wastage) : undefined,
        meal_date: meal_date || undefined
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        ...data,
        source: 'fastapi_microservice'
      };
    }
  } catch (err) {
    // Microservice offline or timed out; fall back to python script execution
  }

  // 2. Fallback to direct Python subprocess execution
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PREDICT_SCRIPT)) {
      return reject(new Error('ML prediction script not found at ' + PREDICT_SCRIPT));
    }

    const payload = JSON.stringify({
      total_students: Number(total_students),
      food_prepared: food_prepared !== undefined ? Number(food_prepared) : undefined,
      meal_type: meal_type || 'lunch',
      historical_wastage: historical_wastage !== undefined ? Number(historical_wastage) : undefined,
      meal_date: meal_date || undefined
    });

    execFile(PYTHON_EXEC, [PREDICT_SCRIPT, payload], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[MLService] Subprocess execution failed:', stderr || error.message);
        return reject(new Error('ML engine failed to execute prediction: ' + (stderr || error.message)));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (!result.success && result.error) {
          return reject(new Error(result.error));
        }
        resolve({
          ...result,
          source: 'python_subprocess'
        });
      } catch (parseErr) {
        reject(new Error('Invalid response from ML prediction engine: ' + stdout));
      }
    });
  });
}

/**
 * Loads current model metadata and training evaluation summary.
 */
function getModelStats() {
  let metadata = null;
  let samples = [];

  if (fs.existsSync(METADATA_FILE)) {
    try {
      metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    } catch (e) {
      console.error('[MLService] Failed to read metadata:', e.message);
    }
  }

  if (fs.existsSync(SAMPLES_FILE)) {
    try {
      samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
    } catch (e) {
      console.error('[MLService] Failed to read samples:', e.message);
    }
  }

  return {
    available: metadata !== null,
    metadata,
    samples
  };
}

module.exports = {
  predictWastage,
  getModelStats
};
