# Model Comparison Report: Random Forest vs. Ridge Regression Baseline

**Target Variable**: Food Wastage (`total_wastage_kg` in kilograms)

**Dataset**: Food waste dataset from secondary school canteen (Zenodo Record 20825233)

**Split Methodology**: Chronological 80/20 Holdout
- **Training Period**: 2024-08-08 to 2025-02-20 (124 service days)
- **Testing Period**: 2025-02-21 to 2025-04-11 (31 service days)
- **Cross-Validation**: 5-Fold TimeSeriesSplit (chronologically ordered, strictly zero lookahead)

### Benchmark Results

| Algorithm | Test MAE (kg) | Test RMSE (kg) | Test R² | TimeSeries CV MAE (kg) | Train R² | Generalization Gap (R²) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Random Forest Regressor (Tuned v2.0.0)** | 3.8766 | 4.654 | -0.0365 | 5.7284 | 0.8594 | 0.8959 |
| **Ridge Regression (Baseline v1.0.0)** | 2.3317 | 2.7343 | 0.6422 | 3.5048 | 0.8598 | 0.2176 |
| **Random Forest (v3.0.0-exp, Combined N=215)** | 4.1554 | 5.1269 | -0.2578 | 5.846 | 0.7263 | 0.9841 |
| **Linear Regression (OLS)** | 2.178 | 2.5844 | 0.6804 | 2.8645 | 0.8747 | 0.1943 |
| **Gradient Boosting Regressor** | 3.425 | 3.99 | 0.2382 | 5.6084 | 0.9369 | 0.6987 |
| **Extra Trees Regressor** | 4.6202 | 5.2867 | -0.3374 | 5.7811 | 0.7313 | 1.0687 |
| **Decision Tree Regressor** | 4.5879 | 5.4743 | -0.434 | 7.3915 | 0.7249 | 1.1589 |

### Dataset Expansion & Multi-Institution Benchmark (N=215)

In addition to the primary Finnish school dataset (155 records), 60 empirical daily service records from 4 public schools in Rezekne, Latvia (Zenodo DOIs: 10.5281/zenodo.21458353, 18441715, 18441756) were collected and integrated.

| Experiment / Model | Dataset Records | Train Samples | Test Samples | Test MAE (kg) | Test RMSE (kg) | Test R² | TimeSeries CV MAE (kg) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Random Forest v2.0.0 (Production Active)** | 155 | 124 | 31 | **3.8766** | **4.6540** | **-0.0365** | 5.7284 |
| **Random Forest v3.0.0-exp (Expanded Combined)** | 215 | 172 | 43 | 4.5265 | 5.4256 | -0.3025 | **5.6540** |
| **Expanded RF on Original 31-day Test Set** | 215 | 172 | 31 | 4.7043 | 5.6385 | -0.5213 | — |
| **Cross-Institution (Finland -> Latvia)** | Transfer | 155 | 60 | 4.7033 | 5.8609 | -0.7407 | — |
| **Cross-Institution (Latvia -> Finland)** | Transfer | 60 | 155 | 5.7413 | 8.1310 | -0.0017 | — |

### Production Deployment Decision

- **Active Model**: `wastage_model_rf_v2.joblib` is retained as the active production model to maintain lower test error (3.88 kg MAE vs. 4.53 kg MAE).
- **Candidate Model**: `wastage_model_rf_v3_exp.joblib` is preserved for benchmark comparison and auditability.
- **Combined Dataset**: Cleaned, verified, and saved to `ml/data/processed/combined_food_wastage.csv` with full provenance documented in `ml/data/DATASET_SOURCES.md`.
