import os
import re
import datetime
import pandas as pd
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data", "raw"))
PROCESSED_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data", "processed"))

MONTHS = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
}

def parse_date_str(text):
    m = re.search(r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', text)
    if m:
        month_name = m.group(1).lower()
        day = int(m.group(2))
        year = int(m.group(3))
        if month_name in MONTHS:
            return datetime.date(year, MONTHS[month_name], day)
    return None

def load_finland_data():
    path = os.path.join(RAW_DIR, "food_waste_school_finland_2024_2025.xlsx")
    df_raw = pd.read_excel(path, sheet_name=0)
    df_raw["DATE"] = pd.to_datetime(df_raw["DATE"])
    df_raw = df_raw.sort_values("DATE").reset_index(drop=True)
    
    # Clean nulls
    df_raw["KSW kg"] = df_raw["KSW kg"].interpolate(method="linear")
    df_raw["PW kg"] = df_raw["PW kg"].fillna(df_raw["PW kg"].median())
    
    DEFAULT_PORTION_KG = 0.45
    records = []
    for _, row in df_raw.iterrows():
        students = int(row["DINERS"])
        ksw = float(row["KSW kg"])
        pw = float(row["PW kg"])
        prep = round((students * DEFAULT_PORTION_KG) + ksw, 2)
        waste = round(ksw + pw, 3)
        records.append({
            "date": row["DATE"].date(),
            "total_students": students,
            "food_prepared_kg": prep,
            "total_wastage_kg": waste,
            "institution": "Finland Secondary School",
            "source_dataset": "Zenodo 20825233 (Finland Secondary School 2024-2025)",
            "country": "Finland",
            "meal_type": "lunch"
        })
    return pd.DataFrame(records)

def load_latvia_file(filename, period_label, doi):
    path = os.path.join(RAW_DIR, filename)
    xl = pd.ExcelFile(path)
    records = []
    
    for sheet in xl.sheet_names:
        if 'meta' in sheet.lower(): continue
        df = xl.parse(sheet, header=None)
        school_id = sheet.strip()
        curr_date = None
        curr_students = None
        
        for idx, row in df.iterrows():
            c0 = str(row[0]).strip() if pd.notna(row[0]) else ""
            c1 = str(row[1]).strip() if pd.notna(row[1]) else ""
            
            day_matches = [d for d in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] if d in c0.lower()]
            if day_matches and "total" not in c0.lower():
                d_obj = parse_date_str(c0)
                if d_obj:
                    curr_date = d_obj
                if pd.notna(row[1]):
                    try:
                        curr_students = int(float(row[1]))
                    except:
                        pass
            
            if "total" in c1.lower() and any(d in c1.lower() for d in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']):
                served_g = float(row[2]) if pd.notna(row[2]) else None
                waste_g = float(row[3]) if pd.notna(row[3]) else None
                
                records.append({
                    "date": curr_date,
                    "total_students": curr_students,
                    "food_prepared_kg": round(served_g / 1000.0, 3) if served_g is not None else None,
                    "total_wastage_kg": round(waste_g / 1000.0, 3) if waste_g is not None else None,
                    "institution": f"Latvia Rezekne ({school_id})",
                    "source_dataset": f"Zenodo {doi} (Latvian Schools {period_label})",
                    "country": "Latvia",
                    "meal_type": "lunch"
                })
    return pd.DataFrame(records)

def build_combined_dataset():
    finland_df = load_finland_data()
    print(f"Loaded Finland records: {len(finland_df)}")
    
    latvia_1 = load_latvia_file("plate_waste_latvia_september_2023.xlsx", "Sept 2023", "21458353")
    latvia_2 = load_latvia_file("plate_waste_latvia_december_2023.xlsx", "Dec 2023", "18441715")
    latvia_3 = load_latvia_file("plate_waste_latvia_april_2024.xlsx", "April 2024", "18441756")
    latvia_all = pd.concat([latvia_1, latvia_2, latvia_3], ignore_index=True)
    print(f"Loaded Latvia records: {len(latvia_all)}")
    
    combined = pd.concat([latvia_all, finland_df], ignore_index=True)
    combined["date"] = pd.to_datetime(combined["date"])
    combined = combined.sort_values(["date", "institution"]).reset_index(drop=True)
    
    # Feature engineering
    combined["day_of_week"] = combined["date"].dt.day_of_week
    combined["day_name"] = combined["date"].dt.day_name()
    combined["month"] = combined["date"].dt.month
    
    # Calculate leak-free temporal lag features per institution
    combined = combined.sort_values(["institution", "date"]).reset_index(drop=True)
    combined["past_wastage_kg"] = combined.groupby("institution")["total_wastage_kg"].shift(1).bfill().round(3)
    combined["rolling_avg_wastage_3d"] = combined.groupby("institution")["total_wastage_kg"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean().bfill()
    ).round(3)
    combined = combined.sort_values("date").reset_index(drop=True)
    
    # Ensure correct column ordering
    out_cols = [
        "date",
        "institution",
        "country",
        "meal_type",
        "total_students",
        "food_prepared_kg",
        "past_wastage_kg",
        "rolling_avg_wastage_3d",
        "day_of_week",
        "day_name",
        "month",
        "total_wastage_kg",
        "source_dataset"
    ]
    combined = combined[out_cols]
    
    # Save combined dataset
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    out_path = os.path.join(PROCESSED_DIR, "combined_food_wastage.csv")
    combined.to_csv(out_path, index=False)
    print(f"Saved combined dataset to {out_path} ({len(combined)} rows, {len(combined.columns)} cols)")
    return combined

if __name__ == "__main__":
    df = build_combined_dataset()
    print("\nSummary Info:")
    print(df.info())
    print("\nInstitutions:")
    print(df["institution"].value_counts())
    print("\nDate range:", df["date"].min(), "to", df["date"].max())
    print("\nMissing values:\n", df.isnull().sum())
    print("\nNumeric describe:\n", df[["total_students", "food_prepared_kg", "total_wastage_kg"]].describe())
