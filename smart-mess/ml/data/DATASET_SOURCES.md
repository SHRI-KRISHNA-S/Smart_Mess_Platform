# Smart Mess ML Pipeline — Dataset Sources and Provenance Documentation

This document records the origin, schema, provenance, licensing, and compatibility evaluation of all real-world online food wastage datasets evaluated for the Smart Mess Food Wastage Prediction system.

---

## 1. Summary of Datasets Evaluated

| Dataset Name | Source Repository | DOI / URL | Records | Period | Context & Country | Compatibility Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Secondary School Food Waste (Finland)** | Zenodo | [10.5281/zenodo.20825233](https://doi.org/10.5281/zenodo.20825233) | 155 | Aug 2024 – Apr 2025 | Secondary School Canteen (Western Finland) | **Primary Baseline** (Integrated) |
| **Plate Waste in Latvian Schools: Sept 2023** | Zenodo | [10.5281/zenodo.21458353](https://doi.org/10.5281/zenodo.21458353) | 20 | Sept 25 – 29, 2023 | 4 Public School Canteens (Rezekne, Latvia) | **Compatible** (Integrated) |
| **Plate Waste in Latvian Schools: Dec 2023** | Zenodo | [10.5281/zenodo.18441715](https://doi.org/10.5281/zenodo.18441715) | 20 | Dec 11 – 15, 2023 | 4 Public School Canteens (Rezekne, Latvia) | **Compatible** (Integrated) |
| **Plate Waste in Latvian Schools: Apr 2024** | Zenodo | [10.5281/zenodo.18441756](https://doi.org/10.5281/zenodo.18441756) | 20 | Apr 15 – 19, 2024 | 4 Public School Canteens (Rezekne, Latvia) | **Compatible** (Integrated) |
| **University Canteen Food Waste (datadisply)** | Kaggle | [Kaggle Dataset](https://www.kaggle.com/datasets/datadisply/food-waste-dataset-from-a-university-canteen) | ~2,600 | 1 Academic Year | University Canteen (China) | **Incompatible** (No diner count / prep mass) |
| **Museum of Food Waste (MOFWaste)** | Zenodo | [10.5281/zenodo.14999782](https://doi.org/10.5281/zenodo.14999782) | 6 schools | 2024 Campaign | 6 School Canteens (Portugal) | **Incompatible** (Aggregated totals only, no daily time-series) |
| **School Food Waste Behavioral Study (Italy)** | Zenodo | [10.5281/zenodo.7101523](https://doi.org/10.5281/zenodo.7101523) | 1,260 survey rows | 2019–2020 | Primary Schools (Emilia-Romagna, Italy) | **Incompatible** (Psychometric survey Likert scale, not physical kg) |

---

## 2. Integrated Compatible Datasets

### A. Secondary School Food Waste Dataset (Finland 2024–2025)
- **Title**: Food waste dataset: secondary school in Finland 2024–2025
- **Persistent Identifier**: Zenodo DOI: `10.5281/zenodo.20825233`
- **Authors**: Arja Kuusisto, Jenni Latva, Ella Wilén
- **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0)
- **Records Count**: 155 service days
- **Collection Period**: August 8, 2024 – April 11, 2025
- **Setting**: Single secondary school canteen in Western Finland serving ~350–500 students daily.
- **Raw Measurements**:
  - `DATE`: Service date (YYYY-MM-DD)
  - `DINERS`: Actual attending diner count (students/staff)
  - `KSW kg`: Kitchen surplus waste (over-prepared batch food left unserved in warmers/trays)
  - `PW kg`: Plate leftovers returned by diners
- **Standardized Features**:
  - `total_students` = `DINERS`
  - `food_prepared_kg` = `(DINERS * 0.45) + KSW kg` (based on institutional portion baseline + kitchen surplus buffer)
  - `total_wastage_kg` = `KSW kg + PW kg`
- **Data Quality**: High. 1 missing cell in KSW kg (0.65%), linearly interpolated. No duplicate dates.

### B. Filtered Plate Waste Measurement Data from Latvian Schools (Rezekne, Grades 1–7)
- **Title**: Filtered Plate Waste Measurement Data from Latvian Schools (September 2023 V2, December 2023, April 2024)
- **Persistent Identifiers**:
  - September 2023: Zenodo DOI: `10.5281/zenodo.21458353`
  - December 2023: Zenodo DOI: `10.5281/zenodo.18441715`
  - April 2024: Zenodo DOI: `10.5281/zenodo.18441756`
- **Peer-Reviewed Reference**: Lonska, J., et al. (2025). *"Reducing Plate Waste in Latvian Schools: Evaluating Interventions to Promote Sustainable Food Consumption Practices"*, *Foods*, 14(1), 126. https://doi.org/10.3390/foods14010126
- **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0)
- **Records Count**: 60 daily records (4 public schools × 5 lunch service days × 3 observation periods)
- **Collection Periods**:
  - Period 1: September 25 – September 29, 2023 (20 school-day records)
  - Period 2: December 11 – December 15, 2023 (20 school-day records)
  - Period 3: April 15 – April 19, 2024 (20 school-day records)
- **Setting**: 4 municipal school canteens in Rezekne, Latvia (School 1, School 2, School 3, School 4), partially pre-served institutional lunch catering model.
- **Raw Measurements**:
  - Day / Date: Monday through Friday for each period
  - `Actual number of students who participated in lunch`: Daily counted diners
  - `Food served (total, g)`: Exact food weighed and served across menu items
  - `Plate Waste (total, g)`: Directly weighed aggregate plate waste returned by students
- **Standardized Features**:
  - `total_students` = Count of participating lunch students (mean: 285.7, range: 231 – 345)
  - `food_prepared_kg` = `Food served (g) / 1000.0` (mean: 85.31 kg, range: 46.25 – 128.82 kg)
  - `total_wastage_kg` = `Plate Waste (g) / 1000.0` (mean: 13.62 kg, range: 5.49 – 32.13 kg)
- **Data Quality**: 100% complete across all 60 service days. Zero missing values, measured via calibrated digital scales by researchers on-site.

---

## 3. Discovered Incompatible Datasets (Exclusion Rationale)

### A. Food Waste Dataset from a University Canteen (Kaggle: datadisply)
- **Source**: Kaggle (`datadisply/food-waste-dataset-from-a-university-canteen`)
- **Records**: ~2,600 entries
- **Reported Variables**: Date, Meal Period, Canteen Section, Food Category, Waste Weight (kg), Unit Price, Estimated Cost Loss
- **Exclusion Rationale**:
  1. **Missing Student / Diner Count (`total_students`)**: The dataset records the food item waste without logging the number of students or patrons who attended the meal.
  2. **Missing Food Prepared Quantity (`food_prepared_kg`)**: Only the discarded weight is logged; the initial batch preparation mass is omitted.
  3. **Scientific Integrity Constraint**: Fabricating artificial student headcounts or guessing batch preparation amounts is strictly prohibited under rigorous empirical ML standards. Because two mandatory predictor variables are missing, this dataset cannot be merged into the feature matrix without inventing synthetic data.

### B. Museum of Food Waste (MOFWaste) (Zenodo: 10.5281/zenodo.14999782)
- **Source**: Zenodo DOI `10.5281/zenodo.14999782`
- **Context**: 6 school canteens in Esposende and Viana do Castelo, Portugal.
- **Exclusion Rationale**:
  - Data is compiled as aggregate multi-week campaign summary totals (e.g. Total Biorresíduos per school over the entire term) and per-meal average estimates (e.g. 95.5 g/meal average), rather than continuous daily time-series records. It does not provide the daily observations necessary for time-series cross-validation or lag feature computation.

### C. Primary School Behavioral Food Waste Study (Zenodo: 10.5281/zenodo.7101523 & 14849735)
- **Source**: Zenodo DOIs `10.5281/zenodo.7101523` and `10.5281/zenodo.14849735`
- **Context**: Emilia-Romagna, Italy
- **Exclusion Rationale**:
  - Contains student and parental psychometric questionnaire responses (`FREQ_FW_CANT`, `SELF_FW_CANT` Likert scales 1–5), assessing self-reported awareness rather than physically weighed mass in kilograms. Target variable definition is fundamentally incompatible with quantitative regression.

---

## 4. Combined Dataset Specifications

- **Target Storage Path**: `ml/data/processed/combined_food_wastage.csv`
- **Original Dataset Path**: `ml/data/processed/dataset_cleaned.csv` (Preserved without modification)
- **Total Combined Observations**: **215 service days**
  - Finland Secondary School: 155 records (72.1%)
  - Latvian Public Schools: 60 records (27.9%)
- **Feature Schema**:
  1. `total_students` (int): Number of dining students
  2. `food_prepared_kg` (float): Mass of food prepared/served in kg
  3. `past_wastage_kg` (float): Known prior day wastage baseline in kg
  4. `rolling_avg_wastage_3d` (float): 3-day backward rolling mean wastage in kg
  5. `day_of_week` (int, 0=Monday, 4=Friday)
  6. `month` (int, 1–12)
- **Target Variable**:
  - `total_wastage_kg` (float): Measured food wastage in kg
- **Zero Lookahead Guarantee**:
  - Lag features are computed chronologically within each institutional partition before concatenation, preventing information leakage across distinct schools and service periods.
