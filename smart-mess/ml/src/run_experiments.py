import os
import json
import datetime
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import TimeSeriesSplit, GridSearchCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COMBINED_CSV = os.path.join(SCRIPT_DIR, "..", "data", "processed", "combined_food_wastage.csv")
ORIGINAL_CSV = os.path.join(SCRIPT_DIR, "..", "data", "processed", "dataset_cleaned.csv")
REPORTS_DIR = os.path.join(SCRIPT_DIR, "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

feature_cols = [
    "total_students",
    "food_prepared_kg",
    "past_wastage_kg",
    "rolling_avg_wastage_3d",
    "day_of_week",
    "month"
]
target_col = "total_wastage_kg"

def run_experiments():
    print("=" * 75)
    print("  COMPREHENSIVE RANDOM FOREST EVALUATION ACROSS EXPERIMENTAL REGIMES")
    print("=" * 75)

    # 1. Load Combined Dataset (N=215)
    df_combined = pd.read_csv(COMBINED_CSV)
    df_combined["date"] = pd.to_datetime(df_combined["date"])
    df_combined = df_combined.sort_values("date").reset_index(drop=True)

    # 2. Load Original Dataset (N=155)
    df_orig = pd.read_csv(ORIGINAL_CSV)
    df_orig["DATE"] = pd.to_datetime(df_orig["DATE"])
    df_orig = df_orig.sort_values("DATE").reset_index(drop=True)

    print(f"[Dataset] Original dataset size: {len(df_orig)} records")
    print(f"[Dataset] Expanded dataset size: {len(df_combined)} records")

    # -------------------------------------------------------------
    # Experiment 1: Baseline v2.0.0 replication (Finland N=155)
    # -------------------------------------------------------------
    n_train_orig = int(len(df_orig) * 0.80)
    X_train_orig = df_orig[feature_cols].iloc[:n_train_orig]
    y_train_orig = df_orig[target_col].iloc[:n_train_orig]
    X_test_orig = df_orig[feature_cols].iloc[n_train_orig:]
    y_test_orig = df_orig[target_col].iloc[n_train_orig:]

    tscv_orig = TimeSeriesSplit(n_splits=5)
    rf_v2 = RandomForestRegressor(
        n_estimators=300,
        max_depth=10,
        min_samples_split=2,
        min_samples_leaf=2,
        max_features=1.0,
        random_state=42
    )
    rf_v2.fit(X_train_orig, y_train_orig)
    pred_train_v2 = rf_v2.predict(X_train_orig)
    pred_test_v2 = rf_v2.predict(X_test_orig)

    m_train_v2 = {
        "mae": round(float(mean_absolute_error(y_train_orig, pred_train_v2)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_train_orig, pred_train_v2))), 4),
        "r2": round(float(r2_score(y_train_orig, pred_train_v2)), 4)
    }
    m_test_v2 = {
        "mae": round(float(mean_absolute_error(y_test_orig, pred_test_v2)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test_orig, pred_test_v2))), 4),
        "r2": round(float(r2_score(y_test_orig, pred_test_v2)), 4)
    }
    from sklearn.model_selection import cross_val_score
    cv_mae_v2 = round(float(-cross_val_score(rf_v2, X_train_orig, y_train_orig, cv=tscv_orig, scoring="neg_mean_absolute_error").mean()), 4)
    gap_v2 = round(m_train_v2["r2"] - m_test_v2["r2"], 4)

    # -------------------------------------------------------------
    # Experiment 2: Chronological Retraining on Expanded Dataset (N=215)
    # -------------------------------------------------------------
    n_train_comb = int(len(df_combined) * 0.80)
    train_comb = df_combined.iloc[:n_train_comb].copy()
    test_comb = df_combined.iloc[n_train_comb:].copy()

    X_train_comb = train_comb[feature_cols]
    y_train_comb = train_comb[target_col]
    X_test_comb = test_comb[feature_cols]
    y_test_comb = test_comb[target_col]

    tscv_comb = TimeSeriesSplit(n_splits=5)

    # Hyperparameter Grid Search for Random Forest
    param_grid = {
        "n_estimators": [100, 200, 300, 500],
        "max_depth": [3, 5, 8, 10, None],
        "min_samples_split": [2, 5, 10],
        "min_samples_leaf": [1, 2, 4],
        "max_features": [1.0, "sqrt"]
    }

    from sklearn.model_selection import RandomizedSearchCV
    grid_search = RandomizedSearchCV(
        RandomForestRegressor(random_state=42),
        param_distributions=param_grid,
        n_iter=30,
        cv=tscv_comb,
        scoring="neg_mean_absolute_error",
        random_state=42,
        n_jobs=-1
    )
    grid_search.fit(X_train_comb, y_train_comb)
    best_rf_comb = grid_search.best_estimator_
    best_params_comb = grid_search.best_params_

    pred_train_comb = best_rf_comb.predict(X_train_comb)
    pred_test_comb = best_rf_comb.predict(X_test_comb)

    m_train_comb = {
        "mae": round(float(mean_absolute_error(y_train_comb, pred_train_comb)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_train_comb, pred_train_comb))), 4),
        "r2": round(float(r2_score(y_train_comb, pred_train_comb)), 4)
    }
    m_test_comb = {
        "mae": round(float(mean_absolute_error(y_test_comb, pred_test_comb)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test_comb, pred_test_comb))), 4),
        "r2": round(float(r2_score(y_test_comb, pred_test_comb)), 4)
    }
    cv_mae_comb = round(float(-grid_search.best_score_), 4)
    gap_comb = round(m_train_comb["r2"] - m_test_comb["r2"], 4)

    # Feature Importances for Expanded RF
    importances_comb = {
        feat: round(float(imp), 4)
        for feat, imp in sorted(zip(feature_cols, best_rf_comb.feature_importances_), key=lambda x: x[1], reverse=True)
    }

    # -------------------------------------------------------------
    # Experiment 3: Evaluate Expanded Model specifically on original Finland test holdout
    # (To see if learning from both institutions improves prediction on the Finland holdout)
    # -------------------------------------------------------------
    pred_orig_test_from_comb = best_rf_comb.predict(X_test_orig)
    m_orig_test_from_comb = {
        "mae": round(float(mean_absolute_error(y_test_orig, pred_orig_test_from_comb)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test_orig, pred_orig_test_from_comb))), 4),
        "r2": round(float(r2_score(y_test_orig, pred_orig_test_from_comb)), 4)
    }

    # -------------------------------------------------------------
    # Experiment 4: Cross-Institution Zero-Shot Transfer
    # -------------------------------------------------------------
    # Train on Finland (155), Test on all Latvian schools (60)
    latvia_mask = df_combined["country"] == "Latvia"
    finland_mask = df_combined["country"] == "Finland"

    rf_transfer_fin_to_lat = RandomForestRegressor(n_estimators=300, max_depth=8, min_samples_split=5, min_samples_leaf=2, random_state=42)
    rf_transfer_fin_to_lat.fit(df_combined[finland_mask][feature_cols], df_combined[finland_mask][target_col])
    pred_lat = rf_transfer_fin_to_lat.predict(df_combined[latvia_mask][feature_cols])

    transfer_fin_to_lat_metrics = {
        "mae": round(float(mean_absolute_error(df_combined[latvia_mask][target_col], pred_lat)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(df_combined[latvia_mask][target_col], pred_lat))), 4),
        "r2": round(float(r2_score(df_combined[latvia_mask][target_col], pred_lat)), 4)
    }

    # Train on Latvia (60), Test on Finland (155)
    rf_transfer_lat_to_fin = RandomForestRegressor(n_estimators=300, max_depth=8, min_samples_split=5, min_samples_leaf=2, random_state=42)
    rf_transfer_lat_to_fin.fit(df_combined[latvia_mask][feature_cols], df_combined[latvia_mask][target_col])
    pred_fin = rf_transfer_lat_to_fin.predict(df_combined[finland_mask][feature_cols])

    transfer_lat_to_fin_metrics = {
        "mae": round(float(mean_absolute_error(df_combined[finland_mask][target_col], pred_fin)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(df_combined[finland_mask][target_col], pred_fin))), 4),
        "r2": round(float(r2_score(df_combined[finland_mask][target_col], pred_fin)), 4)
    }

    # Print Comparison Table
    print("\n" + "=" * 80)
    print("  MEASURED EVALUATION COMPARISON: ORIGINAL (v2.0.0) vs. EXPANDED EXPERIMENT")
    print("=" * 80)
    print(f"{'Evaluation Metric':<30} | {'Original v2 (N=155)':<22} | {'Expanded RF (N=215)':<22}")
    print("-" * 80)
    print(f"{'Total Dataset Records':<30} | {155:<22} | {215:<22}")
    print(f"{'Training Samples':<30} | {len(X_train_orig):<22} | {len(X_train_comb):<22}")
    print(f"{'Holdout Test Samples':<30} | {len(X_test_orig):<22} | {len(X_test_comb):<22}")
    print(f"{'Training R² Score':<30} | {m_train_v2['r2']:<22} | {m_train_comb['r2']:<22}")
    print(f"{'Test MAE (kg)':<30} | {m_test_v2['mae']:<22} | {m_test_comb['mae']:<22}")
    print(f"{'Test RMSE (kg)':<30} | {m_test_v2['rmse']:<22} | {m_test_comb['rmse']:<22}")
    print(f"{'Test R² Score':<30} | {m_test_v2['r2']:<22} | {m_test_comb['r2']:<22}")
    print(f"{'TimeSeries CV MAE (kg)':<30} | {cv_mae_v2:<22} | {cv_mae_comb:<22}")
    print(f"{'Generalization Gap (R²)':<30} | {gap_v2:<22} | {gap_comb:<22}")
    print("-" * 80)
    print(f"Expanded Model evaluated on Original 31-sample Test Period:")
    print(f"  Test MAE: {m_orig_test_from_comb['mae']} kg | Test RMSE: {m_orig_test_from_comb['rmse']} kg | Test R²: {m_orig_test_from_comb['r2']}")
    print("-" * 80)
    print(f"Cross-Institution Transfer: Train on Finland (155) -> Test on Latvia (60):")
    print(f"  MAE: {transfer_fin_to_lat_metrics['mae']} kg | RMSE: {transfer_fin_to_lat_metrics['rmse']} kg | R²: {transfer_fin_to_lat_metrics['r2']}")
    print(f"Cross-Institution Transfer: Train on Latvia (60) -> Test on Finland (155):")
    print(f"  MAE: {transfer_lat_to_fin_metrics['mae']} kg | RMSE: {transfer_lat_to_fin_metrics['rmse']} kg | R²: {transfer_lat_to_fin_metrics['r2']}")
    print("=" * 80)

    print("\nFeature Importances (Expanded Random Forest):")
    for feat, imp in importances_comb.items():
        print(f"  • {feat:<25}: {imp * 100:.2f}%")

    results = {
        "original_baseline": {
            "model_version": "v2.0.0",
            "dataset_records": 155,
            "train_records": len(X_train_orig),
            "test_records": len(X_test_orig),
            "train_metrics": m_train_v2,
            "test_metrics": m_test_v2,
            "cv_mae": cv_mae_v2,
            "generalization_gap": gap_v2
        },
        "expanded_experiment": {
            "model_version": "v3.0.0-exp",
            "dataset_records": 215,
            "train_records": len(X_train_comb),
            "test_records": len(X_test_comb),
            "hyperparameters": best_params_comb,
            "train_metrics": m_train_comb,
            "test_metrics": m_test_comb,
            "cv_mae": cv_mae_comb,
            "generalization_gap": gap_comb,
            "evaluated_on_orig_test": m_orig_test_from_comb,
            "feature_importances": importances_comb
        },
        "cross_institution_transfer": {
            "finland_to_latvia": transfer_fin_to_lat_metrics,
            "latvia_to_finland": transfer_lat_to_fin_metrics
        }
    }

    out_json = os.path.join(REPORTS_DIR, "dataset_expansion_experiment_results.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved experimental results to {out_json}")

    return results

if __name__ == "__main__":
    run_experiments()
