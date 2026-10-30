/**
 * Automated Verification Suite for Smart Mess: Default YES Voting Logic
 *
 * Verifies all 9 required scenarios:
 * Scenario 1: No database response: logical default is YES, hasVoted: false, status message displayed
 * Scenario 2: Explicit YES: stored as YES, hasVoted: true, and NO reduction to meals to prepare
 * Scenario 3: Explicit NO: stored as NO, hasVoted: true, and preparation count decreases by one
 * Scenario 4: Repeated NO requests: count decreases only once (idempotent / ON DUPLICATE KEY UPDATE)
 * Scenario 5: NO changed to YES: count increases by one (meal preparation restored)
 * Scenario 6: YES changed to NO: count decreases by one (meal preparation reduced)
 * Scenario 7: Admin statistics are accurate:
 *             - Expected meal count
 *             - Explicit YES votes
 *             - Explicit NO votes
 *             - Students who have not voted (Eligible Student Count - Explicit Votes)
 *             - Meals to prepare (Expected Meal Count - Explicit NO Votes)
 * Scenario 8: Students and Faculty cannot access admin-only counts
 * Scenario 9: Closed polls reject new votes and changes with 409 Conflict
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

// Load environment configuration
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

// Force test mode to manage server lifecycle cleanly
process.env.NODE_ENV = 'test';

const db = require('../backend/src/config/db');
const app = require('../backend/src/index');
const pollService = require('../backend/src/services/pollService');

let server;
let TEST_PORT = 5005;
let BASE_URL = `http://localhost:${TEST_PORT}`;

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
    'x-test-time': '12:00:00',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    data,
    cookieHeader: response.headers.get('set-cookie') || ''
  };
}

function extractTokenCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : '';
}

async function runTestSuite() {
  console.log(`\n=======================================================`);
  console.log(`  SMART MESS – DEFAULT YES VOTING LOGIC VERIFICATION`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`=======================================================\n`);

  // Start HTTP server for tests
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  try {
    const timestamp = Date.now();

    // SETUP: Register test users
    console.log(`[SETUP] Registering test users for verification...`);

    // Student 1
    const regS1 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student One',
        email: `student1_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieS1 = extractTokenCookie(regS1.cookieHeader);
    const userS1 = regS1.data.user;

    // Student 2
    const regS2 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student Two',
        email: `student2_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieS2 = extractTokenCookie(regS2.cookieHeader);
    const userS2 = regS2.data.user;

    // Student 3 (Unvoted)
    const regS3 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student Three (Unvoted)',
        email: `student3_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    const cookieS3 = extractTokenCookie(regS3.cookieHeader);
    const userS3 = regS3.data.user;

    // Faculty
    const regFac = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Faculty Member',
        email: `faculty_${timestamp}@college.edu`,
        college_name: 'Bannari Amman Institute of Technology',
        role: 'faculty',
        password: 'Password123'
      })
    });
    const cookieFac = extractTokenCookie(regFac.cookieHeader);

    // Admin login
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@mess.local',
        password: process.env.ADMIN_PASSWORD || 'athish123'
      })
    });
    const cookieAdmin = extractTokenCookie(adminLogin.cookieHeader);

    // Ensure daily polls synced for daytime testing
    const todayStr = pollService.getLocalDateString();
    await pollService.syncDailyPolls(todayStr, '12:00:00');
    const targetMealDate = pollService.getTomorrowDateString(todayStr);
    const targetMealType = 'lunch';
    await db.execute('UPDATE polls SET is_active = 1 WHERE meal_date = ? AND meal_type = ?', [targetMealDate, targetMealType]);

    // -------------------------------------------------------------
    // SCENARIO 1: No database response: logical default is YES, hasVoted: false
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 1] Unvoted student: absent DB record, logical default YES, hasVoted: false`);
    
    // Verify DB record is absent for Student 3
    const [dbRowsPre] = await db.query(
      'SELECT * FROM meal_responses WHERE user_id = ? AND meal_date = ? AND meal_type = ?',
      [userS3.id, targetMealDate, targetMealType]
    );
    assert(dbRowsPre.length === 0, 'No record exists in meal_responses table for unvoted student');

    // Fetch three-meals API for Student 3
    const resS3 = await request('/api/polls/three-meals', { headers: { Cookie: cookieS3 } });
    assert(resS3.status === 200, 'Student 3 fetches three-meals poll data (200 OK)');
    const lunchS3 = resS3.data.meals[targetMealType];

    assert(lunchS3.hasVoted === false, 'hasVoted is strictly false for unvoted student');
    assert(lunchS3.userVote === 'Not voted', 'userVote is "Not voted"');
    assert(lunchS3.logicalVote === 'YES', 'logicalVote is "YES" by default');
    assert(lunchS3.defaultVote === 'YES', 'defaultVote is "YES"');
    assert(lunchS3.statusMessage === 'You have not voted yet.', 'statusMessage displays "You have not voted yet."');

    // Inspect baseline admin stats before voting
    const adminPre = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const baselineLunch = adminPre.data.meals[targetMealType];
    const baseExpected = baselineLunch.expectedCount;
    const baseNo = baselineLunch.noVotes;
    const baseYes = baselineLunch.yesVotes;
    const basePrepare = baselineLunch.mealsToPrepare;
    const baseNotVoted = baselineLunch.notVoted;

    // -------------------------------------------------------------
    // SCENARIO 2: Explicit YES: stored as YES and no reduction
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 2] Explicit YES: stored as YES in DB, no reduction in meals to prepare`);
    const voteYesRes = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieS2 },
      body: JSON.stringify({
        mealDate: targetMealDate,
        mealType: targetMealType,
        voteChoice: 'YES'
      })
    });
    assert(voteYesRes.status === 200, 'Student 2 votes YES successfully (200 OK)');
    assert(voteYesRes.data.hasVoted === true, 'Response payload has hasVoted: true');
    assert(voteYesRes.data.voteChoice === 'YES', 'Response payload voteChoice is YES');
    assert(voteYesRes.data.statusMessage === 'Your response is recorded: Attending meal.', 'Status message confirms attending meal');

    // Verify in database
    const [dbYesRows] = await db.query(
      'SELECT will_eat, vote_choice FROM meal_responses WHERE user_id = ? AND meal_date = ? AND meal_type = ?',
      [userS2.id, targetMealDate, targetMealType]
    );
    assert(dbYesRows.length === 1 && dbYesRows[0].vote_choice === 'YES' && dbYesRows[0].will_eat === 1,
      'Database meal_responses row stored with vote_choice="YES" and will_eat=1');

    // Verify Admin stats: YES does NOT reduce meals to prepare
    const adminAfterYes = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchAfterYes = adminAfterYes.data.meals[targetMealType];
    assert(lunchAfterYes.yesVotes === baseYes + 1, 'Admin yesVotes incremented by 1');
    assert(lunchAfterYes.noVotes === baseNo, 'Admin noVotes unchanged by YES vote');
    assert(lunchAfterYes.mealsToPrepare === basePrepare, 'Explicit YES does NOT reduce meals to prepare');

    // -------------------------------------------------------------
    // SCENARIO 3: Explicit NO: stored as NO and preparation count decreases by one
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 3] Explicit NO: stored as NO in DB, preparation count decreases by 1`);
    const voteNoRes = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieS1 },
      body: JSON.stringify({
        mealDate: targetMealDate,
        mealType: targetMealType,
        voteChoice: 'NO'
      })
    });
    assert(voteNoRes.status === 200, 'Student 1 votes NO successfully (200 OK)');
    assert(voteNoRes.data.hasVoted === true, 'Response payload has hasVoted: true');
    assert(voteNoRes.data.voteChoice === 'NO', 'Response payload voteChoice is NO');
    assert(voteNoRes.data.statusMessage === 'Your response is recorded: Skipping meal.', 'Status message confirms skipping meal');

    // Verify in database
    const [dbNoRows] = await db.query(
      'SELECT will_eat, vote_choice FROM meal_responses WHERE user_id = ? AND meal_date = ? AND meal_type = ?',
      [userS1.id, targetMealDate, targetMealType]
    );
    assert(dbNoRows.length === 1 && dbNoRows[0].vote_choice === 'NO' && dbNoRows[0].will_eat === 0,
      'Database meal_responses row stored with vote_choice="NO" and will_eat=0');

    // Verify Admin stats: NO decreases meals to prepare by 1
    const adminAfterNo = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchAfterNo = adminAfterNo.data.meals[targetMealType];
    assert(lunchAfterNo.noVotes === baseNo + 1, 'Admin noVotes incremented by 1');
    assert(lunchAfterNo.mealsToPrepare === basePrepare - 1, 'Explicit NO reduces preparation count by exactly 1');

    // -------------------------------------------------------------
    // SCENARIO 4: Repeated NO requests: count decreases only once
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 4] Repeated NO requests: count decreases only once (idempotent)`);
    const repeatNoRes = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieS1 },
      body: JSON.stringify({
        mealDate: targetMealDate,
        mealType: targetMealType,
        voteChoice: 'NO'
      })
    });
    assert(repeatNoRes.status === 200, 'Repeated NO request from Student 1 succeeds (200 OK)');

    const [dbRepeatRows] = await db.query(
      'SELECT COUNT(*) AS cnt FROM meal_responses WHERE user_id = ? AND meal_date = ? AND meal_type = ?',
      [userS1.id, targetMealDate, targetMealType]
    );
    assert(dbRepeatRows[0].cnt === 1, 'Exactly 1 database row exists for student (no duplicates created)');

    const adminAfterRepeat = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchAfterRepeat = adminAfterRepeat.data.meals[targetMealType];
    assert(lunchAfterRepeat.noVotes === baseNo + 1, 'NO count remains unchanged on repeated request');
    assert(lunchAfterRepeat.mealsToPrepare === basePrepare - 1, 'Meals to prepare count is not reduced a second time');

    // -------------------------------------------------------------
    // SCENARIO 5: NO changed to YES: count increases by one
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 5] NO changed to YES: count increases by 1 (restores meal)`);
    const changeToYesRes = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieS1 },
      body: JSON.stringify({
        mealDate: targetMealDate,
        mealType: targetMealType,
        voteChoice: 'YES'
      })
    });
    assert(changeToYesRes.status === 200 && changeToYesRes.data.voteChoice === 'YES',
      'Student 1 changes vote from NO to YES successfully');

    const adminAfterChangeToYes = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchAfterChangeToYes = adminAfterChangeToYes.data.meals[targetMealType];
    assert(lunchAfterChangeToYes.noVotes === baseNo, 'NO votes count decremented back to baseline');
    assert(lunchAfterChangeToYes.mealsToPrepare === basePrepare, 'Preparation count restored by 1 meal');

    // -------------------------------------------------------------
    // SCENARIO 6: YES changed to NO: count decreases by one
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 6] YES changed to NO: count decreases by 1`);
    const changeToNoRes = await request('/api/polls/vote', {
      method: 'POST',
      headers: { Cookie: cookieS2 },
      body: JSON.stringify({
        mealDate: targetMealDate,
        mealType: targetMealType,
        voteChoice: 'NO'
      })
    });
    assert(changeToNoRes.status === 200 && changeToNoRes.data.voteChoice === 'NO',
      'Student 2 changes vote from YES to NO successfully');

    const adminAfterChangeToNo = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchAfterChangeToNo = adminAfterChangeToNo.data.meals[targetMealType];
    assert(lunchAfterChangeToNo.noVotes === baseNo + 1, 'NO votes count incremented by 1');
    assert(lunchAfterChangeToNo.mealsToPrepare === basePrepare - 1, 'Preparation count decreased by 1 meal');

    // -------------------------------------------------------------
    // SCENARIO 7: Admin statistics are accurate
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 7] Admin statistics accuracy verification`);
    const adminFinal = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieAdmin } });
    const lunchFinal = adminFinal.data.meals[targetMealType];

    assert(typeof lunchFinal.expectedCount === 'number', 'expectedCount is a valid number');
    assert(typeof lunchFinal.eligibleStudentCount === 'number', 'eligibleStudentCount is a valid number');
    assert(typeof lunchFinal.yesVotes === 'number', 'yesVotes is a valid number');
    assert(typeof lunchFinal.noVotes === 'number', 'noVotes is a valid number');
    assert(typeof lunchFinal.notVoted === 'number', 'notVoted is a valid number');
    assert(typeof lunchFinal.mealsToPrepare === 'number', 'mealsToPrepare is a valid number');

    // Formula checks:
    assert(lunchFinal.mealsToPrepare === Math.max(0, lunchFinal.expectedCount - lunchFinal.noVotes),
      'Formula verified: Meals to Prepare = Expected Meal Count - Explicit NO Votes');
    assert(lunchFinal.notVoted === Math.max(0, lunchFinal.eligibleStudentCount - (lunchFinal.yesVotes + lunchFinal.noVotes)),
      'Formula verified: Not Voted = Eligible Student Count - (Explicit YES Votes + Explicit NO Votes)');

    // -------------------------------------------------------------
    // SCENARIO 8: Students and Faculty cannot access admin-only counts
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 8] Security: Students and Faculty cannot access admin counts`);
    // Student GET /api/polls/three-meals
    const studentThreeMeals = await request('/api/polls/three-meals', { headers: { Cookie: cookieS1 } });
    const studentLunch = studentThreeMeals.data.meals[targetMealType];
    assert(studentLunch.expectedCount === undefined, 'Student cannot see expectedCount in three-meals');
    assert(studentLunch.yesVotes === undefined, 'Student cannot see yesVotes in three-meals');
    assert(studentLunch.noVotes === undefined, 'Student cannot see noVotes in three-meals');
    assert(studentLunch.notVoted === undefined, 'Student cannot see notVoted in three-meals');
    assert(studentLunch.mealsToPrepare === undefined, 'Student cannot see mealsToPrepare in three-meals');

    // Faculty GET /api/polls/three-meals
    const facultyThreeMeals = await request('/api/polls/three-meals', { headers: { Cookie: cookieFac } });
    const facultyLunch = facultyThreeMeals.data.meals[targetMealType];
    assert(facultyLunch.expectedCount === undefined, 'Faculty cannot see expectedCount in three-meals');
    assert(facultyLunch.mealsToPrepare === undefined, 'Faculty cannot see mealsToPrepare in three-meals');

    // Forbidden routes for non-admin
    const studentAdminStats = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieS1 } });
    assert(studentAdminStats.status === 403, 'Student is rejected with 403 from /api/admin/three-meals-stats');

    const facultyAdminStats = await request('/api/admin/three-meals-stats', { headers: { Cookie: cookieFac } });
    assert(facultyAdminStats.status === 403, 'Faculty is rejected with 403 from /api/admin/three-meals-stats');

    const studentAdminIntent = await request('/api/admin/meal-intent?date=2026-10-23&type=lunch', { headers: { Cookie: cookieS1 } });
    assert(studentAdminIntent.status === 403, 'Student is rejected with 403 from /api/admin/meal-intent');

    // -------------------------------------------------------------
    // SCENARIO 9: Closed polls reject new votes and changes
    // -------------------------------------------------------------
    console.log(`\n[SCENARIO 9] Closed polls reject new votes and changes with 409 Conflict`);
    const mondayDate = '2026-10-26';
    const sundayDate = '2026-10-25';
    const afterDeadlineTime = '20:15:00'; // Deadline is 20:00:00

    const lateVoteAttempt = await request('/api/polls/vote', {
      method: 'POST',
      headers: {
        Cookie: cookieS1,
        'x-test-date': sundayDate,
        'x-test-time': afterDeadlineTime
      },
      body: JSON.stringify({
        mealDate: mondayDate,
        mealType: 'lunch',
        voteChoice: 'NO'
      })
    });
    assert(lateVoteAttempt.status === 409, 'Late vote attempt after cutoff rejected with 409 Conflict');
    assert(lateVoteAttempt.data.isClosed === true, 'Error response confirms isClosed: true');

    console.log(`\n=======================================================`);
    console.log(`  SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`=======================================================\n`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await db.getPool().end();
  }
}

runTestSuite();
