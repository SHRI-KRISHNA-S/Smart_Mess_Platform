# Dataset Analysis and Preprocessing Report

### 1. Data Source and Provenance
- **Name**: Food waste dataset: secondary school in Finland 2024-2025
- **Publisher**: Kuusisto, Latva, Wilén et al. (University of Vaasa & City of Lapua)
- **Persistent DOI**: [10.5281/zenodo.20825233](https://doi.org/10.5281/zenodo.20825233)
- **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0)
- **Total Records**: 155 school meal service days
- **Time Span**: August 8, 2024 to April 11, 2025

### 2. Feature Statistics

| Feature | Meaning | Unit | Min | Mean | Max | Std Dev |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DINERS` (`total_students`) | Attending students | Count | 251 | 397.8 | 546 | 46.2 |
| `food_prepared_kg` | Estimated meal mass | kg | 121.05 | 187.1 | 261.03 | 23.0 |
| `KSW kg` | Kitchen & serving surplus | kg | 0.51 | 8.1 | 45.03 | 7.0 |
| `PW kg` | Diner plate waste | kg | 3.088 | 9.1 | 22.478 | 3.3 |
| `total_wastage_kg` | Total wastage (Target) | kg | 6.061 | 17.2 | 58.529 | 8.2 |

### 3. Preprocessing Steps Executed
1. **Missing Value Imputation**: The 1 missing observation in Kitchen Surplus Waste (`KSW kg`) was interpolated linearly across the time series.
2. **Unit Harmonization**: All masses standardized to metric kilograms (`kg`). Student headcounts represented as positive integers.
3. **Lag Feature Engineering**: Added 1-day lag waste (`past_wastage_kg`) and 3-day rolling average waste to represent operational momentum.
4. **Leakage Protection**: No target or test information is used at inference time; models only consume inputs available prior to dining.
