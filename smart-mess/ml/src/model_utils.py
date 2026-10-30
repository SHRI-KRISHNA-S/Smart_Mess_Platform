"""
Model Utilities Module for Smart Mess ML Pipeline.
Provides pipeline builders, metric calculations, and serialization utilities for
Random Forest Regressor and Ridge Regression models.
"""

import os
import json
import joblib
import numpy as np
from typing import Dict, Any, Tuple
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge, LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor

DEFAULT_MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))
MODEL_VERSION = "v2.0.0"
PRIMARY_MODEL_FILENAME = "wastage_model_rf_v2.joblib"
FALLBACK_MODEL_FILENAME = "wastage_model_v1.joblib"


def compute_metrics(y_true, y_pred) -> Dict[str, float]:
    """
    Computes standard regression evaluation metrics.
    """
    mae = float(mean_absolute_error(y_true, y_pred))
    mse = float(mean_squared_error(y_true, y_pred))
    rmse = float(np.sqrt(mse))
    r2 = float(r2_score(y_true, y_pred))

    return {
        "mae": round(mae, 4),
        "mse": round(mse, 4),
        "rmse": round(rmse, 4),
        "r2": round(r2, 4)
    }


def create_pipeline(algorithm: str = "random_forest", **kwargs) -> Pipeline:
    """
    Constructs a scikit-learn Pipeline ensuring preprocessing
    and model inference stay strictly coupled without training leakage.
    """
    if algorithm == "random_forest":
        return Pipeline([
            ("regressor", RandomForestRegressor(
                n_estimators=kwargs.get("n_estimators", 300),
                max_depth=kwargs.get("max_depth", 10),
                min_samples_split=kwargs.get("min_samples_split", 2),
                min_samples_leaf=kwargs.get("min_samples_leaf", 2),
                max_features=kwargs.get("max_features", 1.0),
                random_state=42
            ))
        ])
    elif algorithm == "ridge":
        alpha = kwargs.get("alpha", 1.0)
        return Pipeline([
            ("scaler", StandardScaler()),
            ("regressor", Ridge(alpha=alpha, random_state=42))
        ])
    elif algorithm == "linear":
        return Pipeline([
            ("scaler", StandardScaler()),
            ("regressor", LinearRegression())
        ])
    elif algorithm == "gradient_boosting":
        return Pipeline([
            ("regressor", GradientBoostingRegressor(
                n_estimators=kwargs.get("n_estimators", 100),
                max_depth=kwargs.get("max_depth", 3),
                learning_rate=kwargs.get("learning_rate", 0.05),
                random_state=42
            ))
        ])
    else:
        raise ValueError(f"Unsupported algorithm: {algorithm}")


def save_model(
    model: Pipeline,
    metadata: Dict[str, Any],
    models_dir: str = DEFAULT_MODELS_DIR,
    model_name: str = PRIMARY_MODEL_FILENAME
) -> Tuple[str, str]:
    """
    Saves trained pipeline artifact and its accompanying JSON metadata.
    """
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, model_name)
    metadata_path = os.path.join(models_dir, "model_metadata.json")

    joblib.dump(model, model_path)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[ModelUtils] Saved trained model to {model_path}")
    print(f"[ModelUtils] Saved model metadata to {metadata_path}")
    return model_path, metadata_path


def load_model(
    models_dir: str = DEFAULT_MODELS_DIR,
    model_name: str = PRIMARY_MODEL_FILENAME
) -> Tuple[Pipeline, Dict[str, Any]]:
    """
    Loads saved model pipeline and its metadata with automatic fallback.
    """
    model_path = os.path.join(models_dir, model_name)
    metadata_path = os.path.join(models_dir, "model_metadata.json")

    if not os.path.exists(model_path):
        fallback_path = os.path.join(models_dir, FALLBACK_MODEL_FILENAME)
        if os.path.exists(fallback_path):
            model_path = fallback_path
        else:
            raise FileNotFoundError(f"Model file not found at {model_path}. Please run train.py first.")

    model = joblib.load(model_path)
    metadata = {}
    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

    return model, metadata
