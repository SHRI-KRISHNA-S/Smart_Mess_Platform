# Smart Mess Machine Learning Subsystem

This directory contains the reproducible Machine Learning training pipeline, model serialization, evaluation benchmarking, and inference service for the **AI-Powered Smart Mess Meal Pre-Booking and Food Waste Reduction Agent**.

---

## 1. Dataset Provenance & Empirical Grounding
* **Title**: Food waste dataset: secondary school in Finland 2024-2025
* **Authors/Publishers**: Arja Kuusisto, Jenni Latva, Ella Wilén, et al. (University of Vaasa, Uniarts Helsinki, City of Lapua)
* **Persistent DOI**: [10.5281/zenodo.20825233](https://doi.org/10.5281/zenodo.20825233)
* **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0)
* **Scale**: 155 longitudinal dining service cycles tracking daily student headcounts (251–546 diners) alongside exact kitchen surplus waste (`KSW kg`) and plate leftovers (`PW kg`) measured in metric kilograms.

---

## 2. Directory Structure
```
ml/
├── data/
│   ├── raw/
│   │   └── food_waste_school_finland_2024_2025.xlsx  # Downloaded raw dataset from Zenodo
│   └── processed/
│       ├── dataset_cleaned.csv                       # Cleaned, standardized dataset
│       ├── train.csv                                 # 80% chronological train split
│       └── test.csv                                  # 20% chronological test holdout
├── models/
│   ├── wastage_model_rf_v2.joblib                    # Active Random Forest Regressor (v2.0.0)
│   ├── wastage_model_v1.joblib                       # Baseline Ridge Pipeline (v1.0.0)
│   └── model_metadata.json                           # Model versioning, hyperparams & metrics
├── notebooks/                                        # Exploratory notebooks / scripts
├── reports/
│   ├── dataset_analysis.md                           # Dataset feature distributions & preprocessing log
│   ├── model_comparison.md                           # Benchmark across regression algorithms
│   ├── evaluation_results.json                       # Measured metrics & hyperparams
│   └── actual_vs_predicted_samples.json              # Holdout validation samples
├── src/
│   ├── data_loader.py                                # Automated Zenodo downloader & data loader
│   ├── preprocessing.py                              # Cleaning, interpolation & feature engineering
│   ├── model_utils.py                                # Pipeline constructors & metric utilities
│   ├── train.py                                      # Random Forest tuning (RandomizedSearchCV) & benchmark
│   ├── evaluate.py                                   # Comparative evaluation & markdown report generation
│   ├── predict.py                                    # Standalone CLI & programmatic inference
│   └── service.py                                    # FastAPI prediction microservice
├── requirements.txt                                  # Python dependencies
└── README.md                                         # Subsystem documentation
```

---

## 3. Random Forest Regressor Implementation (v2.0.0)

### Hyperparameter Search Space
We conducted randomized search optimization (`RandomizedSearchCV`, 30 iterations) using 5-fold time-aware cross-validation (`TimeSeriesSplit`) over the following parameter distribution:
* `n_estimators`: `[100, 200, 300, 500]`
* `max_depth`: `[None, 3, 5, 8, 10]`
* `min_samples_split`: `[2, 5, 10]`
* `min_samples_leaf`: `[1, 2, 4]`
* `max_features`: `[1.0, 'sqrt']`

### Optimal Hyperparameters Found
* `n_estimators`: 300
* `max_depth`: 10
* `min_samples_split`: 2
* `min_samples_leaf`: 2
* `max_features`: 1.0

### Feature Importance Breakdown
Random Forest calculates feature importance via Mean Decrease in Impurity (MDI):
1. **Planned Food Batch** (`food_prepared_kg`): **43.32%**
2. **Expected Diners** (`total_students`): **30.19%**
3. **Previous Day Waste Baseline** (`past_wastage_kg`): **8.83%**
4. **Day of Week** (`day_of_week`): **7.93%**
5. **3-Day Rolling Average** (`rolling_avg_wastage_3d`): **4.99%**
6. **Calendar Month** (`month`): **4.73%**

---

## 4. Chronological Holdout Benchmark: Random Forest vs. Ridge Baseline

Both models were evaluated on the exact same chronological 80/20 split:
* **Training Set**: 124 records (August 8, 2024 to February 20, 2025)
* **Holdout Testing Set**: 31 records (February 21, 2025 to April 11, 2025)
* **Cross-Validation**: 5-Fold `TimeSeriesSplit` (chronologically ordered, strictly zero lookahead)

| Metric | Random Forest Regressor (v2.0.0) | Ridge Regression Baseline (v1.0.0) |
| :--- | :--- | :--- |
| **Test MAE** | 3.88 kg | **2.33 kg** |
| **Test RMSE** | 4.65 kg | **2.73 kg** |
| **Test R² Score** | -0.04 | **0.64** |
| **TimeSeries CV MAE** | 5.73 kg | **3.50 kg** |
| **Train R² Score** | 0.86 | 0.86 |
| **Generalization Gap (R²)** | 0.8959 | **0.2176** |

### Comparative Decision Rationale
* **Mass Conservation Physics**: Batch food preparation in institutional dining obeys continuous mass conservation ($\text{Wastage} \approx \text{Batch Prepared} - \text{Diners} \times \text{Portion}$). Continuous $L_2$-regularized linear models capture this physical property smoothly without overfitting.
* **Extrapolation Limitations**: Decision trees cannot extrapolate beyond the min/max values observed in training leaves. When test period conditions shifted during the final spring semester period, Random Forest predicted step-wise leaf averages rather than scaling down continuously with diner headcounts.
* **Production Status**: In accordance with the project guidelines, Random Forest Regressor is fully trained, hyperparameter-tuned, serialized as `wastage_model_rf_v2.joblib`, and integrated into the Admin Dashboard alongside its feature importances and side-by-side benchmark comparison.

---

## 5. How to Run & Retrain

### A. Retrain Random Forest Model
```bash
ml/.venv/Scripts/python.exe ml/src/train.py
```

### B. Generate Model Comparison Reports
```bash
ml/.venv/Scripts/python.exe ml/src/evaluate.py
```

### C. Test Standalone Inference
```bash
ml/.venv/Scripts/python.exe ml/src/predict.py '{"total_students": 280, "food_prepared": 126.0, "meal_type": "lunch"}'
```

### D. Run End-to-End Test Suite
```bash
npm run test:ml
```
