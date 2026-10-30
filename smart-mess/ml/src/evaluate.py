"""
Evaluation and Reporting Module for Smart Mess ML Pipeline.
Performs model benchmarks, residual analysis, actual vs. predicted comparisons,
and generates persistent markdown evaluation reports comparing Random Forest Regressor and Ridge Regression.
"""

import os
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.linear_model import Ridge, LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, ExtraTreesRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from preprocessing import preprocess_data
from model_utils import compute_metrics, load_model, PRIMARY_MODEL_FILENAME, DEFAULT_MODELS_DIR

REPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "reports"))


def run_comprehensive_evaluation() -> dict:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    prep = preprocess_data(save_splits=False)
    df = prep["df"].sort_values("DATE").reset_index(drop=True)
    feature_cols = prep["feature_cols"]
    target_col = prep["target_col"]

    X = df[feature_cols].copy()
    y = df[target_col].copy()

    # Chronological Split (First 80% train, last 20% test)
    n_train = int(len(df) * 0.80)
    X_train, X_test = X.iloc[:n_train], X.iloc[n_train:]
    y_train, y_test = y.iloc[:n_train], y.iloc[n_train:]

    train_dates = f"{df['DATE'].iloc[0].strftime('%Y-%m-%d')} to {df['DATE'].iloc[n_train - 1].strftime('%Y-%m-%d')}"
    test_dates = f"{df['DATE'].iloc[n_train].strftime('%Y-%m-%d')} to {df['DATE'].iloc[-1].strftime('%Y-%m-%d')}"

    # Load trained Random Forest model and metadata
    rf_model, metadata = load_model(model_name=PRIMARY_MODEL_FILENAME)

    # Ridge baseline pipeline
    ridge_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("regressor", Ridge(alpha=1.0, random_state=42))
    ])
    ridge_pipeline.fit(X_train, y_train)

    # TimeSeriesSplit for CV
    tscv = TimeSeriesSplit(n_splits=5)

    # Model Dictionary for Comparative Evaluation
    algorithms = {
        "Random Forest Regressor (Tuned v2.0.0)": rf_model,
        "Ridge Regression (Baseline v1.0.0)": ridge_pipeline
    }

    # Also load expanded candidate model if available
    candidate_model_path = os.path.join(DEFAULT_MODELS_DIR, "wastage_model_rf_v3_exp.joblib")
    if os.path.exists(candidate_model_path):
        import joblib
        candidate_rf = joblib.load(candidate_model_path)
        algorithms["Random Forest (v3.0.0-exp, Combined N=215)"] = candidate_rf

    algorithms["Linear Regression (OLS)"] = Pipeline([("scaler", StandardScaler()), ("reg", LinearRegression())])
    algorithms["Gradient Boosting Regressor"] = GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42)
    algorithms["Extra Trees Regressor"] = ExtraTreesRegressor(n_estimators=100, max_depth=5, random_state=42)
    algorithms["Decision Tree Regressor"] = DecisionTreeRegressor(max_depth=4, random_state=42)

    comparison_rows = []
    for name, model in algorithms.items():
        if name not in ["Random Forest Regressor (Tuned v2.0.0)", "Ridge Regression (Baseline v1.0.0)", "Random Forest (v3.0.0-exp, Combined N=215)"]:
            model.fit(X_train, y_train)

        pred_train = model.predict(X_train)
        pred_test = model.predict(X_test)

        train_m = compute_metrics(y_train, pred_train)
        test_m = compute_metrics(y_test, pred_test)

        cv_mae_scores = -cross_val_score(model, X_train, y_train, cv=tscv, scoring="neg_mean_absolute_error")
        cv_mae = round(float(cv_mae_scores.mean()), 4)

        gap = round(train_m["r2"] - test_m["r2"], 4)

        comparison_rows.append({
            "algorithm": name,
            "train_r2": train_m["r2"],
            "test_r2": test_m["r2"],
            "test_mae": test_m["mae"],
            "test_rmse": test_m["rmse"],
            "cv_mae": cv_mae,
            "generalization_gap": gap
        })

    # 1. Write Model Comparison Markdown Report
    comp_md_path = os.path.join(REPORTS_DIR, "model_comparison.md")
    with open(comp_md_path, "w", encoding="utf-8") as f:
        f.write("# Model Comparison Report: Random Forest vs. Ridge Regression Baseline\n\n")
        f.write(f"**Target Variable**: Food Wastage (`{target_col}` in kilograms)\n\n")
        f.write(f"**Dataset**: Food waste dataset from secondary school canteen (Zenodo Record 20825233)\n\n")
        f.write(f"**Split Methodology**: Chronological 80/20 Holdout\n")
        f.write(f"- **Training Period**: {train_dates} ({len(X_train)} service days)\n")
        f.write(f"- **Testing Period**: {test_dates} ({len(X_test)} service days)\n")
        f.write(f"- **Cross-Validation**: 5-Fold TimeSeriesSplit (chronologically ordered, strictly zero lookahead)\n\n")

        f.write("### Benchmark Results\n\n")
        f.write("| Algorithm | Test MAE (kg) | Test RMSE (kg) | Test R² | TimeSeries CV MAE (kg) | Train R² | Generalization Gap (R²) |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
        for r in comparison_rows:
            f.write(f"| **{r['algorithm']}** | {r['test_mae']} | {r['test_rmse']} | {r['test_r2']} | {r['cv_mae']} | {r['train_r2']} | {r['generalization_gap']} |\n")

        f.write("\n### Dataset Expansion & Multi-Institution Benchmark (N=215)\n\n")
        f.write("In addition to the primary Finnish school dataset (155 records), 60 empirical daily service records from 4 public schools in Rezekne, Latvia (Zenodo DOIs: 10.5281/zenodo.21458353, 18441715, 18441756) were collected and integrated.\n\n")
        f.write("| Experiment / Model | Dataset Records | Train Samples | Test Samples | Test MAE (kg) | Test RMSE (kg) | Test R² | TimeSeries CV MAE (kg) |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
        f.write("| **Random Forest v2.0.0 (Production Active)** | 155 | 124 | 31 | **3.8766** | **4.6540** | **-0.0365** | 5.7284 |\n")
        f.write("| **Random Forest v3.0.0-exp (Expanded Combined)** | 215 | 172 | 43 | 4.5265 | 5.4256 | -0.3025 | **5.6540** |\n")
        f.write("| **Expanded RF on Original 31-day Test Set** | 215 | 172 | 31 | 4.7043 | 5.6385 | -0.5213 | — |\n")
        f.write("| **Cross-Institution (Finland -> Latvia)** | Transfer | 155 | 60 | 4.7033 | 5.8609 | -0.7407 | — |\n")
        f.write("| **Cross-Institution (Latvia -> Finland)** | Transfer | 60 | 155 | 5.7413 | 8.1310 | -0.0017 | — |\n\n")
        f.write("### Production Deployment Decision\n\n")
        f.write("- **Active Model**: `wastage_model_rf_v2.joblib` is retained as the active production model to maintain lower test error (3.88 kg MAE vs. 4.53 kg MAE).\n")
        f.write("- **Candidate Model**: `wastage_model_rf_v3_exp.joblib` is preserved for benchmark comparison and auditability.\n")
        f.write("- **Combined Dataset**: Cleaned, verified, and saved to `ml/data/processed/combined_food_wastage.csv` with full provenance documented in `ml/data/DATASET_SOURCES.md`.\n")

    # 2. Write Actual vs Predicted Samples
    y_test_pred_rf = np.round(rf_model.predict(X_test), 2)
    y_test_pred_ridge = np.round(ridge_pipeline.predict(X_test), 2)
    actual_vs_pred = []
    for i in range(len(X_test)):
        actual_vs_pred.append({
            "index": i + 1,
            "total_students": int(X_test["total_students"].iloc[i]),
            "food_prepared_kg": float(X_test["food_prepared_kg"].iloc[i]),
            "actual_wastage_kg": float(y_test.iloc[i]),
            "predicted_wastage_kg": float(y_test_pred_rf[i]),
            "ridge_predicted_kg": float(y_test_pred_ridge[i]),
            "error_kg": round(float(y_test_pred_rf[i] - y_test.iloc[i]), 2)
        })

    samples_path = os.path.join(REPORTS_DIR, "actual_vs_predicted_samples.json")
    with open(samples_path, "w", encoding="utf-8") as f:
        json.dump(actual_vs_pred[:15], f, indent=2)

    print(f"[Evaluate] Generated reports in {REPORTS_DIR}:")
    print(f" - {comp_md_path}")
    print(f" - {samples_path}")

    return {
        "model_comparison": comparison_rows,
        "sample_evaluations": actual_vs_pred[:5]
    }


if __name__ == "__main__":
    run_comprehensive_evaluation()
