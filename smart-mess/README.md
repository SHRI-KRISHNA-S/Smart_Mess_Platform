# AI-Powered Smart Mess Meal Pre-Booking and Food Waste Reduction Agent

A production-ready prototype built for college mess dining management. This system solves food wastage and preparation uncertainty in residential institutions by gathering **official mess menu access** and **self-reported meal intentions** from campus diners (both students and faculty) ahead of meal service.

---

## 📌 Project Overview
In typical educational institutions, mess kitchens either overproduce food (leading to massive wastage) or underproduce (causing shortages). This prototype introduces two non-invasive digital touchpoints:
1. **Official Mess Timetable & Nutrition Schedule**: Full daily dining timetable and monthly meal schedule available to students and faculty.
2. **Meal Intention Self-Reporting**: An in-app notice asking students and faculty whether they plan to eat the upcoming meal, with a strict cutoff lock before kitchen prep begins.
3. **Kitchen Admin Dashboard**: Real-time analytics breaking down meal attendance intentions, student and faculty counts, and historical audit logs.

---

## 🛠 Tech Stack
- **Frontend**: React 18, Vite, `react-router-dom`, Vanilla CSS design system with glassmorphism, responsive grid layouts, and live progress bars.
- **Backend**: Node.js, Express.js (CommonJS), `cookie-parser`, `helmet`, `cors`, `express-rate-limit`, `zod` schema validator, `bcryptjs` (cost factor 12), `jsonwebtoken`.
- **Database**: MySQL 8.0+ using `mysql2/promise` with connection pooling and atomic SQL transactions.

---

## 📁 Repository Structure
```
S5_mini_project/
└── smart-mess/
    ├── package.json               # Root scripts (start, build, test:api)
    ├── README.md                  # Complete documentation and review walkthrough
    ├── database/
    │   ├── schema.sql             # MySQL schema definitions with indexes & constraints
    │   └── seed.sql               # Seed data: 1 active poll with 4 Indian mess items
    ├── backend/
    │   ├── package.json           # Backend dependencies and scripts
    │   ├── .env.example           # Environment template (placeholders only)
    │   ├── scripts/
    │   │   └── setup-db.js        # Safe, idempotent database and admin setup script
    │   └── src/
    │       ├── index.js           # Express app entry point
    │       ├── config/
    │       │   ├── db.js          # mysql2 connection pool
    │       │   └── env.js         # Startup validation for JWT_SECRET and configs
    │       ├── middleware/
    │       │   ├── auth.js        # JWT cookie verification & admin role check
    │       │   ├── validate.js    # Zod schema validation middleware
    │       │   └── error.js       # Central error handler & 404 handler
    │       ├── routes/
    │       │   ├── auth.js        # Register, Login, Logout, /me
    │       │   ├── polls.js       # Active poll, atomic voting, results
    │       │   ├── mealIntent.js  # Meal intention notification & responses
    │       │   └── admin.js       # Dashboard stats, breakdown & poll controls
    │       └── utils/
    ├── frontend/
    │   ├── package.json           # Frontend dependencies (React, Vite, Router)
    │   ├── vite.config.js         # Vite configuration with /api proxy
    │   ├── index.html             # HTML5 template
    │   └── src/
    │       ├── App.jsx            # Routing and application entry
    │       ├── index.css          # Global styling and variables
    │       ├── context/
    │       │   └── AuthContext.jsx # Authentication state provider
    │       ├── components/
    │       │   ├── Navbar.jsx     # Navigation bar with role badges
    │       │   ├── ProtectedRoute.jsx # Route guard for students & admin
    │       │   └── MealIntentNotice.jsx # In-app meal attendance notification
    │       └── pages/
    │           ├── LoginPage.jsx  # Responsive login with timing attack protection
    │           ├── RegisterPage.jsx # Registration with home college pre-fill
    │           ├── PollPage.jsx   # Active poll with live 5s auto-refresh
    │           └── AdminPage.jsx  # Analytics dashboard and poll controls
    └── scripts/
        └── api-test.js            # Automated end-to-end integration test suite
```

---

## ⚙️ Prerequisites & Setup Instructions

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v25+ supported)
- **MySQL**: MySQL Server 8.0 or MariaDB 10.5+ running locally or remotely on port 3306

---

### 2. Database Initialization

#### Option A: Automated Setup Script (Recommended)
Run the idempotent setup script which creates the database, executes `schema.sql`, seeds the 4 menu options, and creates the admin account:
```bash
cd smart-mess/backend
npm run setup:db
```

#### Option B: Manual MySQL CLI
If preferred, you can initialize the database using the MySQL command line client:
```bash
# 1. Log in to MySQL
mysql -u root -p

# 2. Create the database
CREATE DATABASE smart_mess_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_mess_db;

# 3. Source schema and seed files
source E:/S5_mini_pro/smart-mess/database/schema.sql;
source E:/S5_mini_pro/smart-mess/database/seed.sql;

# 4. Exit
EXIT;
```
After manual sourcing, run `npm run setup:db` to securely hash and register the admin account.

---

## 🚀 How to Run the Application

### Mode 1: Development Mode (Vite Dev Server + Express API)
Run both backend and frontend concurrently for hot module replacement:

1. **Start Backend**:
   ```bash
   cd smart-mess/backend
   npm run dev
   # Server runs on http://localhost:5000
   ```

2. **Start Frontend** (in a second terminal):
   ```bash
   cd smart-mess/frontend
   npm run dev
   # Vite dev server runs on http://localhost:5173 (proxies /api to :5000)
   ```

3. Open **`http://localhost:5173`** in your browser.

---

### Mode 2: Single-Server Production Mode
In production mode, the Express backend serves the pre-compiled React frontend directly from `frontend/dist`:

```bash
cd smart-mess
npm run build
npm start
```
Open **`http://localhost:5000`** in your browser. The entire application runs from one single command.

---

## 🧪 Automated End-to-End Test Suite
Run the comprehensive automated test suite to verify all endpoints, database constraints, security guards, and error cases:

```bash
cd smart-mess
npm run test:api
```

### Tested Scenarios:
- `GET /api/health` and `GET /api/config` (home college prefill)
- Registration schema validation (rejection of short passwords, malformed emails)
- Duplicate email conflict handling (`409 Conflict`)
- Student and Faculty role registration (`201 Created`)
- Rejection of obsolete external student registration (`400 Bad Request`)
- Login failure with timing-safe dummy hash comparison (`401 Unauthorized`)
- Tokenless protected route rejection (`401 Unauthorized`)
- Non-admin access to `/api/admin/*` forbidden (`403 Forbidden` for Student & Faculty)
- Active poll inspection and menu options
- Preference poll voting decommissioned and rejected (`403 Forbidden`)
- Meal intention notification retrieval (`GET /api/notifications/meal-intent`)
- Answering meal intention ("Yes, I'll eat" vs "No, I won't") for Student and Faculty
- Changing meal intention response prior to cutoff (`PUT /api/meal-intent`)
- Rejection of invalid intention bodies (non-boolean values, incorrect date)
- Admin detailed poll results, voter records, and Student vs Faculty breakdown
- Admin meal intention metrics (Yes, No, No-response counts and response rate by role)
- Admin poll closing and reopening (`PATCH /api/admin/polls/:id`)
- Unknown API routes return standard JSON 404

---

## 📋 API Reference Table

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Server uptime and health check |
| `GET` | `/api/config` | Public | Exposes `HOME_COLLEGE_NAME` for registration auto-fill |
| `POST` | `/api/auth/register` | Public | Registers a new user (`student` or `faculty` role) |
| `POST` | `/api/auth/login` | Public | Authenticates user and issues `httpOnly` JWT cookie |
| `POST` | `/api/auth/logout` | Public | Clears session cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieves current authenticated user profile |
| `GET` | `/api/polls/active` | Authenticated | Retrieves active poll and menu options |
| `POST` | `/api/polls/:id/vote` | Authenticated | Decommissioned; returns 403 Forbidden |
| `GET` | `/api/polls/:id/results` | Authenticated | Fetches live voting percentages and counts |
| `GET` | `/api/notifications/meal-intent` | Authenticated | Returns pending intention status, upcoming meal date/type, and answer |
| `PUT` | `/api/meal-intent` | Authenticated | Records or updates self-reported meal intention |
| `GET` | `/api/admin/polls` | Admin Only | Lists all polls with summary counts |
| `GET` | `/api/admin/polls/:id/results`| Admin Only | Detailed breakdown, voter audit table, and student/faculty counts |
| `PATCH`| `/api/admin/polls/:id` | Admin Only | Opens or closes a poll (opening closes all others) |
| `GET` | `/api/admin/meal-intent` | Admin Only | Yes/No/No-response counts, response rate, and role split (student & faculty) |

---

## 🔒 Security Design
1. **Password Hashing**: Passwords hashed using `bcryptjs` with cost factor 12. Password policies enforced: 8-72 characters, at least 1 letter and 1 digit.
2. **Timing Attack Defense**: Non-existent user login attempts are compared against a pre-computed dummy hash in constant time.
3. **JWT in httpOnly Cookie**: Tokens are stored strictly in `httpOnly`, `SameSite=Lax` cookies (with `Secure` enabled in production). Tokens are never exposed to `localStorage` or JavaScript, preventing XSS-based session hijacking.
4. **Startup Secret Validation**: Server halts execution immediately on startup if `JWT_SECRET` is missing, shorter than 32 characters, or uses known placeholder words.
5. **Role Escalation Protection**: The `/api/auth/register` endpoint strictly assigns the `student` role. Admin accounts can only be provisioned via the secure server-side setup script.
6. **Rate Limiting**: `express-rate-limit` throttles brute-force login and registration attempts to a configurable maximum (default 20 requests per 15 minutes).
7. **HTTP Protection**: Configured with `helmet` for defense headers and explicit CORS origin whitelisting.
8. **SQL Injection Prevention**: Built entirely with `mysql2/promise` using parameterized statements (`?`) and connection pooling. Database names and admin credentials in setup scripts undergo strict regex validation.

---

## ⚖️ Known Limitations & Honesty Rules
1. **Self-Declared Student Type**: The distinction between "home" hostellers and "external" visitors is currently self-reported at registration. In a university production deployment, this could be validated against official institutional email domains (`@college.edu`) or campus single-sign-on (SSO).
2. **Preference vs. Demand**: Menu votes represent preference distribution among students who participated in the poll. They do **not** forecast total meal quantities.
3. **Intentions vs. Actual Attendance**: Meal intention responses are self-declared plans, not biometric check-ins or attendance scans. The kitchen admin dashboard labels counts as "self-reported intentions" and explicitly displays the response rate alongside counts.

---

---

## 🤖 Integrated AI/ML Food Waste Prediction Subsystem

The Smart Mess platform features a production-ready Machine Learning model integrated into the Kitchen Administration Dashboard to forecast food waste, calculate consumed portion efficiency, and optimize batch preparation quantities ahead of meal service.

### 1. Empirical Dataset & Provenance
* **Dataset**: *Food waste dataset: secondary school in Finland 2024-2025*
* **Publisher**: Arja Kuusisto, Jenni Latva, Ella Wilén, et al. (University of Vaasa & City of Lapua)
* **Persistent DOI**: [10.5281/zenodo.20825233](https://doi.org/10.5281/zenodo.20825233)
* **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0)
* **Dataset Characteristics**: 155 longitudinal dining service cycles tracking daily student headcounts (251–546 diners) alongside exact kitchen surplus waste (`KSW kg`) and plate leftovers (`PW kg`) in metric kilograms.

### 2. Architecture & Pipeline
```
[React Admin Dashboard]
        │
        ▼ (POST /api/ml/predict-wastage - JWT Admin Protected)
[Node.js / Express Backend]
        │
        ├──► [Python FastAPI Microservice (http://127.0.0.1:5001)]
        │       OR
        └──► [Python Direct CLI Subprocess Fallback (ml/.venv)]
                │
                ▼
      [Trained Scikit-Learn Pipeline]
        - Random Forest Regressor (300 estimators, max_depth=10, min_samples_leaf=2)
        - Target: total_wastage_kg (kg)
        - Model Artifact: wastage_model_rf_v2.joblib
```

### 3. Chronological Holdout Benchmark: Random Forest vs. Ridge Baseline
Evaluated on the exact same chronological 80/20 train/test split (124 train, 31 test) with 5-fold `TimeSeriesSplit` cross-validation:

| Metric | Random Forest Regressor (v2.0.0) | Ridge Regression Baseline (v1.0.0) |
| :--- | :--- | :--- |
| **Test MAE (kg)** | 3.88 kg | **2.33 kg** |
| **Test RMSE (kg)** | 4.65 kg | **2.73 kg** |
| **Test R² Score** | -0.04 | **0.64** |
| **TimeSeries CV MAE (kg)** | 5.73 kg | **3.50 kg** |
| **Train R² Score** | 0.86 | 0.86 |
| **Generalization Gap (R²)** | 0.8959 | **0.2176** |

#### Feature Importance Analysis (Random Forest)
1. **Planned Food Batch** (`food_prepared_kg`): **43.32%**
2. **Expected Diners** (`total_students`): **30.19%**
3. **Previous Day Waste Baseline** (`past_wastage_kg`): **8.83%**
4. **Day of Week** (`day_of_week`): **7.93%**
5. **3-Day Rolling Average** (`rolling_avg_wastage_3d`): **4.99%**
6. **Calendar Month** (`month`): **4.73%**

### 4. Machine Learning API Endpoints
* `POST /api/ml/predict-wastage`: (Admin Only) Generates wastage forecasts using the active Random Forest model.
* `GET /api/ml/stats`: (Admin Only) Returns model metadata, feature importances, training metrics, and holdout validation samples for dashboard charts.
* `GET /api/ml/health`: Returns ML engine operational readiness status.

### 5. Quick ML Commands
```bash
# 1. Run complete ML integration test suite (6 tests)
npm run test:ml

# 2. Retrain Random Forest model and refresh artifacts
npm run ml:train

# 3. Optional: Start persistent FastAPI prediction microservice
npm run ml:service
```

## ⏱ 5-Minute Project Review Demo Script

| Time | Stage | Action & Talking Points |
|---|---|---|
| **0:00 - 0:45** | **Introduction & Problem Statement** | Open the browser at `http://localhost:5173`. Explain: *"Hostel mess facilities face severe food waste due to unpredictable attendance. Our prototype introduces a smart mess dining platform with two distinct user roles alongside administrators: Students and Faculty."* |
| **0:45 - 1:45** | **User Registration (Student vs. Faculty)** | Click **Register**. Explain: *"Our system supports both Students and Faculty members."* Select **Student** or **Faculty** from the Role dropdown; point out that the institution name is pre-filled. Complete registration and show immediate dashboard navigation. |
| **1:45 - 2:45** | **In-App Meal Intention Notification** | Point out the notification banner at the top: *"Will you eat mess food for upcoming service?"* Explain: *"This is our streamlined in-app notice with cutoff enforcement."* Click **"Yes, I'll eat"**. Notice updates to show the confirmed choice. Demonstrate the **"Change answer"** button. |
| **2:45 - 3:30** | **Official Mess Timetable & Nutrition Roster** | View the embedded official monthly mess schedule and service hours (Breakfast, Lunch, Evening Tea, Dinner). |
| **3:30 - 4:30** | **Admin Dashboard & Analytics** | Sign out and log in with admin credentials (`admin@mess.local`). Navigate to the **Admin Dashboard**. Highlight: (1) Total registered students and faculty counts, (2) Historical poll vote records, (3) Real-time meal intention responses split by Student and Faculty roles, and (4) The individual audit log. |
| **4:30 - 5:00** | **Security & Access Enforcement** | Demonstrate that Students and Faculty cannot access the `/admin` URL, and that decommissioned external-student voting is blocked on the API. |
