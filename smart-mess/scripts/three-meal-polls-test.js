/**
 * Automated Test Suite for Simplified Meal Poll UI, Meal Count Processing Logic & Admin Privacy
 *
 * Verifies all criteria:
 * 1. Student Poll displays question "Whether you eat or not?" with NO and YES options.
 * 2. Detailed count information is strictly hidden from Student & Faculty accounts.
 * 3. Meal Count Processing Logic:
 *    Formula: Meals to Prepare = Expected Meal Count - Number of Valid NO Votes
 *    - NO reduces Expected Meal Count by 1.
 *    - YES does NOT reduce Expected Meal Count.
 *    - Unvoted student does NOT reduce Expected Meal Count.
 *    - Student affects count only once per meal per date.
 *    - Changing NO -> YES restores 1 meal.
 *    - Changing YES -> NO reduces 1 meal.
 *    - Duplicate requests never reduce count twice.
 * 4. Admin detailed information displays:
 *    - Expected meals, YES votes, NO votes, Not voted, Meals to prepare, status, and deadline.
 *    - Non-admin accounts are forbidden from accessing admin statistics.
 * 5. Automatic deadlines in Asia/Kolkata (IST) are enforced.
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
try {
  require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch (e) {
  if (fs.existsSync(path.resolve(__dirname, '../backend/.env'))) {
    const lines = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';
const db = require('../backend/src/config/db');
const pollService = require('../backend/src/services/pollService');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  let data = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  const cookieHeader = res.headers.get('set-cookie');
  return { status: res.status, data, cookieHeader };
}

function extractTokenCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : '';
}

async function runThreeMealPollsTestSuite() {
  console.log(`\n=======================================================`);
  console.log(`  SIMPLIFIED MEAL POLL, COUNT PROCESSING & PRIVACY TESTS`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Timezone: ${pollService.APP_TIMEZONE}`);
  console.log(`=======================================================\n`);

  let localServer = null;
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error('Not running');
  } catch (err) {
    const http = require('http');
    process.env.NODE_ENV = 'test';
    const app = require('../backend/src/index');
    localServer = http.createServer(app);
    await new Promise(resolve => localServer.listen(5000, resolve));
  }

  try {
    const timestamp = Date.now();

    // 1. Setup Test Users
    console.log(`[SETUP] Registering test users for voting and privacy tests...`);
    
    // Student A (Will vote NO)
    const regA = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student A (Votes NO)',
        email: `student_a_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieA = extractTokenCookie(regA.cookieHeader);

    // Student B (Will vote YES)
    const regB = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student B (Votes YES)',
        email: `student_b_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieB = extractTokenCookie(regB.cookieHeader);

    // Student C (Unvoted)
    const regC = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student C (Unvoted)',
        email: `student_c_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieC = extractTokenCookie(regC.cookieHeader);

    // Faculty
    const regFac = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Faculty Resident',
        email: `faculty_res_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'faculty',
        password: 'Password123'
      })
    });
    const cookieFac = extractTokenCookie(regFac.cookieHeader);

    // Admin
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@mess.local',
        password: process.env.ADMIN_PASSWORD || 'athish123'
      })
    });
    const cookieAdmin = extractTokenCookie(adminLogin.cookieHeader);

    // -------------------------------------------------------------
    // TEST 1: Simple Student Poll UI & Question
    // -------------------------------------------------------------
    console.log(`\n[TEST 1] Simple Student Poll Question & Privacy`);
    const studentPollRes = await request('/api/polls/three-meals', {
      headers: { Cookie: cookieA }
    });
    assert(studentPollRes.status === 200, 'GET /api/polls/three-meals returns 200 OK');
    const { meals, targetMealDate } = studentPollRes.data;

    assert(Boolean(meals.breakfast && meals.lunch && meals.dinner), 'Three meal tabs exist (breakfast, lunch, dinner)');
    assert(meals.breakfast.mealName === 'Morning Tiffin', 'Tab 1: mealName is "Morning Tiffin"');
    assert(meals.lunch.mealName === 'Evening Lunch', 'Tab 2: mealName is "Evening Lunch"');
    assert(meals.dinner.mealName === 'Night Dinner', 'Tab 3: mealName is "Night Dinner"');

    // Section 1: Question must be "Whether you eat or not?"
    assert(meals.breakfast.question === 'Whether you eat or not?', 'Morning Tiffin displays simple question: "Whether you eat or not?"');
    assert(meals.lunch.question === 'Whether you eat or not?', 'Evening Lunch displays simple question: "Whether you eat or not?"');
    assert(meals.dinner.question === 'Whether you eat or not?', 'Night Dinner displays simple question: "Whether you eat or not?"');

    // Section 3: Hide Counts from Students
    assert(meals.lunch.expectedCount === undefined, 'Student response does NOT expose expectedCount');
    assert(meals.lunch.yesVotes === undefined, 'Student response does NOT expose yesVotes');
    assert(meals.lunch.noVotes === undefined, 'Student response does NOT expose noVotes');
    assert(meals.lunch.notVoted === undefined, 'Student response does NOT expose notVoted');
    assert(meals.lunch.mealsToPrepare === undefined, 'Student response does NOT expose mealsToPrepare');
    assert(meals.lunch.mealCount === undefined, 'Student response does NOT expose mealCount');

    // -------------------------------------------------------------
    // TEST 2: Admin Baseline Inspection
    // -------------------------------------------------------------
    console.log(`\n[TEST 2] Admin Detailed Meal Intelligence & Authorization`);
    const adminStatsPre = await request('/api/admin/three-meals-stats', {
      headers: { Cookie: cookieAdmin }
    });
    assert(adminStatsPre.status === 200, 'Admin can access /api/admin/three-meals-stats (200)');
    const adminLunchPre = adminStatsPre.data.meals.lunch;

    assert(typeof adminLunchPre.expectedCount === 'number', 'Admin receives expectedCount');
    assert(typeof adminLunchPre.yesVotes === 'number', 'Admin receives yesVotes count');
    assert(typeof adminLunchPre.noVotes === 'number', 'Admin receives noVotes count');
    assert(typeof adminLunchPre.mealsToPrepare === 'number', 'Admin receives mealsToPrepare count');
    assert(adminLunchPre.mealsToPrepare === adminLunchPre.expectedCount - adminLunchPre.noVotes,
      'Meals to Prepare formula verified: Expected Meal Count - Number of Valid NO Votes');

    // Non-admin cannot access admin stats
    const studentBlocked = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieA } });
    assert(studentBlocked.status === 403, 'Student is forbidden from /api/admin/three-meals-stats (403)');
    const facultyBlocked = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieFac } });
    assert(facultyBlocked.status === 403, 'Faculty is forbidden from /api/admin/three-meals-stats (403)');

    const initialExpected = adminLunchPre.expectedCount;
    const initialNo = adminLunchPre.noVotes;
    const initialMealsToPrepare = adminLunchPre.mealsToPrepare;

    // -------------------------------------------------------------
    // TEST 3: Meal Count Processing Logic
    // Formula: Meals to Prepare = Expected Meal Count - Number of Valid NO Votes
    // -------------------------------------------------------------
    console.log(`\n[TEST 3] Meal Count Processing Logic (NO reduces by 1, YES and Unvoted do NOT reduce)`);
    const testDate = targetMealDate;
    const testType = 'lunch';

    // 3a. Student A votes NO -> Reduces Meals to Prepare by 1
    const voteResA = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: JSON.stringify({
        mealDate: testDate,
        mealType: testType,
        voteChoice: 'NO'
      })
    });
    assert(voteResA.status === 200 && voteResA.data.voteChoice === 'NO', 'Student A votes NO successfully (200)');
    assert(voteResA.data.mealCount === undefined, 'Student vote response does NOT expose mealCount');

    // Check Admin stats after Student A votes NO
    const adminStatsAfterA = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const adminLunchAfterA = adminStatsAfterA.data.meals.lunch;
    assert(adminLunchAfterA.noVotes === initialNo + 1, 'Valid NO votes incremented by exactly 1');
    assert(adminLunchAfterA.mealsToPrepare === initialMealsToPrepare - 1, 'Selecting NO reduces expected meal count by 1 (Meals to Prepare - 1)');

    // 3b. Student B votes YES -> Does NOT reduce Expected Meal Count
    const voteResB = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: JSON.stringify({
        mealDate: testDate,
        mealType: testType,
        voteChoice: 'YES'
      })
    });
    assert(voteResB.status === 200 && voteResB.data.voteChoice === 'YES', 'Student B votes YES successfully (200)');

    const adminStatsAfterB = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const adminLunchAfterB = adminStatsAfterB.data.meals.lunch;
    assert(adminLunchAfterB.noVotes === initialNo + 1, 'YES vote does NOT increase NO count');
    assert(adminLunchAfterB.mealsToPrepare === initialMealsToPrepare - 1, 'Selecting YES does NOT reduce expected meal count (Meals to Prepare remains unchanged)');

    // 3c. Student C does NOT vote -> Does NOT reduce Expected Meal Count
    const checkC = await request('/api/polls/three-meals', { headers: { Cookie: cookieC } });
    assert(checkC.data.meals.lunch.userVote === 'Not voted', 'Student C has not voted');
    const adminStatsAfterC = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    assert(adminStatsAfterC.data.meals.lunch.mealsToPrepare === initialMealsToPrepare - 1, 'Unvoted student does NOT reduce expected meal count');

    // -------------------------------------------------------------
    // TEST 4: Vote Changes (NO -> YES restores 1; YES -> NO reduces 1)
    // -------------------------------------------------------------
    console.log(`\n[TEST 4] Vote Changes: NO -> YES restores 1, YES -> NO reduces 1`);
    // Student A changes from NO to YES
    const changeA = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: JSON.stringify({
        mealDate: testDate,
        mealType: testType,
        voteChoice: 'YES'
      })
    });
    assert(changeA.status === 200 && changeA.data.voteChoice === 'YES', 'Student A changes vote from NO to YES while poll is open');

    const adminStatsAfterChangeA = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const adminLunchAfterChangeA = adminStatsAfterChangeA.data.meals.lunch;
    assert(adminLunchAfterChangeA.noVotes === initialNo, 'NO votes count decremented by 1');
    assert(adminLunchAfterChangeA.mealsToPrepare === initialMealsToPrepare, 'Changing from NO to YES restores one meal to the count');

    // Student B changes from YES to NO
    const changeB = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: JSON.stringify({
        mealDate: testDate,
        mealType: testType,
        voteChoice: 'NO'
      })
    });
    assert(changeB.status === 200 && changeB.data.voteChoice === 'NO', 'Student B changes vote from YES to NO while poll is open');

    const adminStatsAfterChangeB = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const adminLunchAfterChangeB = adminStatsAfterChangeB.data.meals.lunch;
    assert(adminLunchAfterChangeB.noVotes === initialNo + 1, 'NO votes count incremented by 1');
    assert(adminLunchAfterChangeB.mealsToPrepare === initialMealsToPrepare - 1, 'Changing from YES to NO reduces the count by one');

    // -------------------------------------------------------------
    // TEST 5: Duplicate / Concurrent Requests Never Reduce Count More Than Once
    // -------------------------------------------------------------
    console.log(`\n[TEST 5] Duplicate & Concurrent Request Protection`);
    // Send identical NO vote again for Student B
    const duplicateVote = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: JSON.stringify({
        mealDate: testDate,
        mealType: testType,
        voteChoice: 'NO'
      })
    });
    assert(duplicateVote.status === 200, 'Duplicate request for Student B succeeds (200)');

    const adminStatsAfterDup = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    assert(adminStatsAfterDup.data.meals.lunch.noVotes === initialNo + 1, 'Duplicate NO vote does NOT reduce count a second time');
    assert(adminStatsAfterDup.data.meals.lunch.mealsToPrepare === initialMealsToPrepare - 1, 'Meals to prepare remains strictly consistent on duplicate request');

    // -------------------------------------------------------------
    // TEST 6: Deadlines & Rejecting Changes After Poll Closure
    // -------------------------------------------------------------
    console.log(`\n[TEST 6] Automatic Deadlines & Rejecting Vote Changes After Closure`);
    const mondayDate = '2026-10-26';
    const sundayDate = '2026-10-25';
    const afterDeadlineTime = '20:10:00';

    // Morning Tiffin deadline: 8:00 PM previous day
    assert(pollService.getMealDeadline(mondayDate, 'breakfast') === `${sundayDate} 20:00:00`, 'Morning Tiffin deadline is 8:00 PM on previous calendar day');
    // Evening Lunch deadline: 8:00 PM previous day
    assert(pollService.getMealDeadline(mondayDate, 'lunch') === `${sundayDate} 20:00:00`, 'Evening Lunch deadline is 8:00 PM on previous calendar day');
    // Night Dinner deadline: 10:00 AM same day
    assert(pollService.getMealDeadline(mondayDate, 'dinner') === `${mondayDate} 10:00:00`, 'Night Dinner deadline is 10:00 AM on same calendar day');

    // Vote attempt after deadline is rejected with 409 Conflict
    const lateVote = await request('/api/polls/vote', {
      method: 'POST',
      headers: {
        Cookie: cookieA,
        'x-test-date': sundayDate,
        'x-test-time': afterDeadlineTime
      },
      body: JSON.stringify({
        mealDate: mondayDate,
        mealType: 'lunch',
        voteChoice: 'NO'
      })
    });
    assert(lateVote.status === 409, 'Vote submission or modification after deadline is rejected with 409 Conflict');
    assert(lateVote.data.error === 'Poll closed', 'Error message indicates poll is closed');

    // -------------------------------------------------------------
    // TEST 7: Admin Expected Meals Configuration
    // -------------------------------------------------------------
    console.log(`\n[TEST 7] Admin Configurable Expected Count`);
    const lunchPollId = adminLunchAfterB.pollId;
    const updateExpectedRes = await request(`/api/admin/polls/${lunchPollId}/expected-count`, {
      method: 'PATCH',
      headers: { Cookie: cookieAdmin },
      body: JSON.stringify({ expectedCount: 150 })
    });
    assert(updateExpectedRes.status === 200, 'Admin successfully updates expected meals count to 150 (PATCH 200)');

    const statsAfterUpdate = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchUpdated = statsAfterUpdate.data.meals.lunch;
    assert(lunchUpdated.expectedCount === 150, 'Admin stats reflect updated expectedCount: 150');
    assert(lunchUpdated.mealsToPrepare === 150 - lunchUpdated.noVotes, 'Meals to prepare dynamically recalibrates to 150 - noVotes');

    // Restore expected count back to 100
    await request(`/api/admin/polls/${lunchPollId}/expected-count`, {
      method: 'PATCH',
      headers: { Cookie: cookieAdmin },
      body: JSON.stringify({ expectedCount: 100 })
    });

    // -------------------------------------------------------------
    // Clean up DB pool
    // -------------------------------------------------------------
    await db.getPool().end();

    console.log(`\n=======================================================`);
    console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`=======================================================\n`);

  } catch (error) {
    console.error('Fatal error during test run:', error);
    process.exit(1);
  } finally {
    if (localServer) {
      localServer.close();
    }
  }
}

if (require.main === module) {
  runThreeMealPollsTestSuite();
}

module.exports = runThreeMealPollsTestSuite;
