"""
Inference Module for Smart Mess Food Waste Prediction.
Provides standalone CLI and programmatic prediction functions with robust input validation.
"""

import os
import sys
import json
import datetime
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.dirname(__file__))
from model_utils import load_model

DEFAULT_PORTION_KG = 0.45  # Standard kg per student meal portion
DEFAULT_HISTORICAL_WASTAGE = 14.68  # Empirical median baseline wastage in kg


def predict_wastage(
    total_students: int,
    food_prepared: Optional[float] = None,
    meal_type: str = "lunch",
    historical_wastage: Optional[float] = None,
    meal_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generates food wastage prediction given dining parameters.
    """
    # 1. Input Validation
    if not isinstance(total_students, (int, float)) or total_students <= 0:
        raise ValueError(f"total_students must be a positive number, got: {total_students}")
    total_students = int(total_students)

    # 2. Determine food prepared in kg
    # If food_prepared is passed as portions or count, or if not provided:
    if food_prepared is None or food_prepared <= 0:
        food_prepared_kg = round(total_students * DEFAULT_PORTION_KG, 2)
    else:
        # If food_prepared is large (> 1000), it might be grams -> convert to kg
        # If food_prepared is given as meal count (e.g. 250 meals), standard weight is meals * 0.45 kg
        # Otherwise treat as kg
        food_prepared_val = float(food_prepared)
        if food_prepared_val > total_students * 1.5:
            # Entered as grams
            if food_prepared_val > 1000:
                food_prepared_kg = round(food_prepared_val / 1000.0, 2)
            else:
                food_prepared_kg = food_prepared_val
        else:
            food_prepared_kg = food_prepared_val

    # 3. Determine date features
    if meal_date:
        try:
            dt = datetime.datetime.strptime(meal_date[:10], "%Y-%m-%d")
        except Exception:
            dt = datetime.datetime.now()
    else:
        dt = datetime.datetime.now()

    day_of_week = dt.weekday()
    month = dt.month

    # 4. Determine historical baseline
    past_waste = float(historical_wastage) if historical_wastage is not None and historical_wastage >= 0 else DEFAULT_HISTORICAL_WASTAGE
    rolling_waste = past_waste

    # 5. Load model and metadata
    model, metadata = load_model()

    input_df = pd.DataFrame([{
        "total_students": total_students,
        "food_prepared_kg": food_prepared_kg,
        "past_wastage_kg": past_waste,
        "rolling_avg_wastage_3d": rolling_waste,
        "day_of_week": day_of_week,
        "month": month
    }])

    # 6. Generate raw prediction
    raw_pred = float(model.predict(input_df)[0])
    # Waste cannot be negative and cannot exceed total food prepared
    predicted_wastage = round(max(0.5, min(raw_pred, food_prepared_kg * 0.75)), 2)

    # Useful food quantity
    estimated_useful_food_kg = round(max(0.0, food_prepared_kg - predicted_wastage), 2)

    # Confidence interval using test RMSE
    rmse = metadata.get("test_metrics", {}).get("rmse", 3.27)
    confidence_lower = round(max(0.0, predicted_wastage - rmse), 2)
    confidence_upper = round(predicted_wastage + rmse, 2)

    # Waste percentage
    waste_percentage = round((predicted_wastage / food_prepared_kg) * 100, 1) if food_prepared_kg > 0 else 0.0

    return {
        "success": True,
        "predicted_wastage": predicted_wastage,
        "unit": "kg",
        "model_version": metadata.get("model_version", "v1.0.0"),
        "algorithm": metadata.get("algorithm", "Ridge Regression Pipeline"),
        "inputs": {
            "total_students": total_students,
            "food_prepared_kg": food_prepared_kg,
            "meal_type": meal_type.lower(),
            "meal_date": dt.strftime("%Y-%m-%d"),
            "day_name": dt.strftime("%A")
        },
        "estimated_useful_food_kg": estimated_useful_food_kg,
        "waste_percentage": waste_percentage,
        "confidence_interval": {
            "lower_kg": confidence_lower,
            "upper_kg": confidence_upper,
            "margin_error_kg": round(rmse, 2)
        },
        "evaluation_summary": {
            "test_mae_kg": metadata.get("test_metrics", {}).get("mae", 2.47),
            "test_rmse_kg": metadata.get("test_metrics", {}).get("rmse", 3.27),
            "test_r2": metadata.get("test_metrics", {}).get("r2", 0.78),
            "cv_mae_kg": metadata.get("cv_mae", 2.64)
        },
        "timestamp": datetime.datetime.now().isoformat(),
        "message": "Prediction generated successfully using trained empirical model"
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            arg = sys.argv[1]
            params = json.loads(arg) if arg.startswith("{") else {"total_students": int(arg)}
            res = predict_wastage(**params)
            print(json.dumps(res, indent=2))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
            sys.exit(1)
    else:
        # Default test run
        res = predict_wastage(total_students=350, food_prepared=160.0, meal_type="lunch")
        print(json.dumps(res, indent=2))
