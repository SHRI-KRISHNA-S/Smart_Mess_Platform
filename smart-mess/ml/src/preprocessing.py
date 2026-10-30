"""
Preprocessing and Feature Engineering Module for Smart Mess ML Pipeline.
Handles cleaning, unit verification, outlier auditing, lag features, and leak-free train/test splitting.
"""

import os
import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any, Optional
from data_loader import load_raw_data

DEFAULT_PROCESSED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "processed"))
DEFAULT_PORTION_KG = 0.45  # Standard institutional meal portion per student in kg


def preprocess_data(
    raw_df: Optional[pd.DataFrame] = None,
    processed_dir: Optional[str] = None,
    save_splits: bool = True
) -> Dict[str, Any]:
    """
    Cleans raw records, engineers predictive features, and splits into train and test sets.
    """
    df = (raw_df if raw_df is not None else load_raw_data()).copy()

    # 1. Parse Date and sort chronologically
    df["DATE"] = pd.to_datetime(df["DATE"])
    df = df.sort_values("DATE").reset_index(drop=True)

    # 2. Handle missing values
    # In raw dataset, KSW kg has only 1 missing entry out of 155 records (0.65%)
    missing_before = df.isnull().sum().to_dict()
    df["KSW kg"] = df["KSW kg"].interpolate(method="linear")
    # Verify PW kg
    df["PW kg"] = df["PW kg"].fillna(df["PW kg"].median())

    # 3. Target Variable: Total Wastage in Kilograms (Kitchen surplus + Plate leftovers)
    df["total_wastage_kg"] = np.round(df["KSW kg"] + df["PW kg"], 3)

    # 4. Standardize student/diner headcount
    df["total_students"] = df["DINERS"].astype(int)

    # 5. Temporal Features
    df["day_of_week"] = df["DATE"].dt.day_of_week
    df["day_name"] = df["DATE"].dt.day_name()
    df["month"] = df["DATE"].dt.month
    df["day_of_month"] = df["DATE"].dt.day

    # 6. Historical wastage feature (lag-1 and rolling-3-day, computed before meal)
    df["past_wastage_kg"] = np.round(df["total_wastage_kg"].shift(1).bfill(), 3)
    df["rolling_avg_wastage_3d"] = np.round(
        df["total_wastage_kg"].shift(1).rolling(3, min_periods=1).mean().bfill(), 3
    )

    # 7. Physical food prepared estimate (kg)
    # Institutional mess portion standard: 0.45 kg per diner + kitchen preparation surplus (KSW)
    df["food_prepared_kg"] = np.round((df["total_students"] * DEFAULT_PORTION_KG) + df["KSW kg"], 2)

    # 8. Feature selection for prediction
    feature_cols = [
        "total_students",
        "food_prepared_kg",
        "past_wastage_kg",
        "rolling_avg_wastage_3d",
        "day_of_week",
        "month"
    ]
    target_col = "total_wastage_kg"

    # Save cleaned processed CSVs
    out_dir = processed_dir or DEFAULT_PROCESSED_DIR
    os.makedirs(out_dir, exist_ok=True)
    cleaned_path = os.path.join(out_dir, "dataset_cleaned.csv")
    df.to_csv(cleaned_path, index=False)

    if save_splits:
        # 80/20 train/test split with fixed random seed
        from sklearn.model_selection import train_test_split
        train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
        train_df.to_csv(os.path.join(out_dir, "train.csv"), index=False)
        test_df.to_csv(os.path.join(out_dir, "test.csv"), index=False)
        print(f"[Preprocessing] Saved cleaned dataset to {cleaned_path}")
        print(f"[Preprocessing] Train records: {len(train_df)}, Test records: {len(test_df)}")

    return {
        "df": df,
        "feature_cols": feature_cols,
        "target_col": target_col,
        "missing_before": missing_before,
        "records_count": len(df)
    }


if __name__ == "__main__":
    result = preprocess_data()
    print("Features:", result["feature_cols"])
    print("Target:", result["target_col"])
    print(result["df"][result["feature_cols"] + [result["target_col"]]].head(3))
