/**
 * Automated End-to-End API Test Suite for Smart Mess Prototype
 * 
 * Tests covered:
 * 1. Health check & Config endpoints
 * 2. Registration validation errors (short password, invalid email, etc.)
 * 3. Duplicate email registration conflict (409)
 * 4. Successful registration for Student & Faculty roles (201)
 * 5. Rejection of obsolete External Student registration (400)
 * 6. Login failure (invalid credentials) & success for Student, Faculty, Admin
 * 7. Unauthenticated access protection (401 on protected routes)
 * 8. Non-admin access to admin routes (403 forbidden for Student & Faculty)
 * 9. Active poll inspection and menu options
 * 10. Rejection of obsolete preference poll voting (403 Forbidden)
 * 11. Meal intention first answer for Student & Faculty
 * 12. Changing meal intention answer before cutoff
 * 13. Invalid intention bodies (non-boolean willEat, invalid date format, wrong date)
 * 14. Admin detailed results and Student vs Faculty breakdown
 * 15. Admin meal-intent analytics (Yes, No, No-response counts and response rate by role)
 * 16. Admin poll toggle (close poll and reopen poll)
 * 17. Unknown route 404 test
 */

const path = require('path');
const fs = require('fs');
try {
  require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch (e) {
  if (fs.existsSync(path.resolve(__dirname, '../backend/.env'))) {
    const lines = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';
const db = require('../backend/src/config/db');

let studentUserCookie = '';
let facultyUserCookie = '';
let adminUserCookie = '';
let activePollId = null;
let upcomingMealDate = null;
let upcomingMealType = null;

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

async function runTestSuite() {
  console.log(`\n=======================================================`);
  console.log(`  RUNNING AUTOMATED API TEST SUITE (Smart Mess API)`);
  console.log(`  Target: ${BASE_URL}`);
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
    // 1. Health & Config Checks
    console.log(`[TEST GROUP 1] Health & Configuration`);
    const health = await request('/api/health');
    assert(health.status === 200 && health.data.status === 'healthy', 'GET /api/health returns 200 and healthy status');

    const config = await request('/api/config');
    assert(config.status === 200 && typeof config.data.homeCollegeName === 'string', 'GET /api/config returns 200 and configured college name');

    // 2. Registration Validation Errors
    console.log(`\n[TEST GROUP 2] Registration Validation & Role Assignment`);
    const invalidReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'R',
        email: 'invalid-email',
        college_name: 'Tech',
        role: 'invalid_role',
        password: 'short'
      })
    });
    assert(invalidReg.status === 400 && invalidReg.data.error === 'Validation failed', 'POST /api/auth/register rejects invalid schema with 400');

    // 3. Register Student
    const testTimestamp = Date.now();
    const studentEmail = `student_${testTimestamp}@test.edu`;
    const studentReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Aarav Kumar',
        email: studentEmail,
        college_name: config.data.homeCollegeName || 'National Institute of Technology',
        role: 'student',
        password: 'Password123'
      })
    });
    assert(studentReg.status === 201 && studentReg.data.user.role === 'student', 'Register Student creates user with student role (201)');
    studentUserCookie = extractTokenCookie(studentReg.cookieHeader);

    // 4. Duplicate Email Conflict
    const dupReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Duplicate Aarav',
        email: studentEmail,
        college_name: 'NIT',
        role: 'student',
        password: 'Password123'
      })
    });
    assert(dupReg.status === 409, 'Duplicate email registration returns 409 Conflict');

    // 5. Register Faculty
    const facultyEmail = `faculty_${testTimestamp}@test.edu`;
    const facultyReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dr. Priya Raman',
        email: facultyEmail,
        college_name: config.data.homeCollegeName || 'National Institute of Technology',
        role: 'faculty',
        password: 'Password123'
      })
    });
    assert(facultyReg.status === 201 && facultyReg.data.user.role === 'faculty', 'Register Faculty creates user with faculty role (201)');
    facultyUserCookie = extractTokenCookie(facultyReg.cookieHeader);

    // 6. Rejection of obsolete External Student role
    const extReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'External Guest',
        email: `ext_${testTimestamp}@external.edu`,
        college_name: 'External College',
        student_type: 'external',
        password: 'Password123'
      })
    });
    assert(extReg.status === 400, 'Obsolete external student registration is rejected with 400');

    // 7. Authentication & Security
    console.log(`\n[TEST GROUP 3] Authentication & Security`);
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: studentEmail,
        password: 'WrongPassword99'
      })
    });
    assert(badLogin.status === 401 && badLogin.data.error === 'Authentication failed', 'Login with incorrect password returns 401');

    const studentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: studentEmail,
        password: 'Password123'
      })
    });
    assert(studentLogin.status === 200 && studentLogin.data.user.role === 'student', 'Student login succeeds (200)');

    const facultyLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: facultyEmail,
        password: 'Password123'
      })
    });
    assert(facultyLogin.status === 200 && facultyLogin.data.user.role === 'faculty', 'Faculty login succeeds (200)');

    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@mess.local',
        password: process.env.ADMIN_PASSWORD || 'athish123'
      })
    });
    assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Admin login succeeds and returns admin role (200)');
    adminUserCookie = extractTokenCookie(adminLogin.cookieHeader);

    // 8. Protected Routes & Authorization Checks
    console.log(`\n[TEST GROUP 4] Role-Based Access Control (RBAC)`);
    const unauthRes = await request('/api/auth/me');
    assert(unauthRes.status === 401, 'Unauthenticated request to /api/auth/me rejected with 401');

    const studentMe = await request('/api/auth/me', { headers: { Cookie: studentUserCookie } });
    assert(studentMe.status === 200 && studentMe.data.user.role === 'student', 'Student can access /api/auth/me');

    const facultyMe = await request('/api/auth/me', { headers: { Cookie: facultyUserCookie } });
    assert(facultyMe.status === 200 && facultyMe.data.user.role === 'faculty', 'Faculty can access /api/auth/me');

    const studentAdminAccess = await request('/api/admin/polls', { headers: { Cookie: studentUserCookie } });
    assert(studentAdminAccess.status === 403, 'Student access to admin route rejected with 403 Forbidden');

    const facultyAdminAccess = await request('/api/admin/polls', { headers: { Cookie: facultyUserCookie } });
    assert(facultyAdminAccess.status === 403, 'Faculty access to admin route rejected with 403 Forbidden');

    const adminPollsRes = await request('/api/admin/polls', { headers: { Cookie: adminUserCookie } });
    assert(adminPollsRes.status === 200 && Array.isArray(adminPollsRes.data.polls), 'Admin can access /api/admin/polls (200)');

    // 9. Active Poll Check & Rejection of Obsolete Voting
    console.log(`\n[TEST GROUP 5] Polling & Obsolete Voting Decommissioning`);
    const activePollRes = await request('/api/polls/active', { headers: { Cookie: studentUserCookie } });
    assert(activePollRes.status === 200, 'GET /api/polls/active returns 200');
    activePollId = activePollRes.data?.poll?.id || adminPollsRes.data.polls[0]?.id;

    // Verify obsolete voting is rejected with 403 Forbidden
    const voteAttempt = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: studentUserCookie },
      body: JSON.stringify({ menu_item_id: 1 })
    });
    assert(voteAttempt.status === 403, 'Preference poll voting is decommissioned and returns 403 Forbidden');

    const facultyVoteAttempt = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: facultyUserCookie },
      body: JSON.stringify({ menu_item_id: 1 })
    });
    assert(facultyVoteAttempt.status === 403, 'Faculty preference poll voting is rejected with 403 Forbidden');

    // 10. Meal Intention Notification & Flow
    console.log(`\n[TEST GROUP 6] Meal Intention Notification & Flow`);
    const intentStatus = await request('/api/notifications/meal-intent', {
      headers: { Cookie: studentUserCookie }
    });
    assert(intentStatus.status === 200 && intentStatus.data.meal !== null, 'GET /api/notifications/meal-intent returns meal details for student');
    upcomingMealDate = intentStatus.data.meal.date;
    upcomingMealType = intentStatus.data.meal.type;

    const facultyIntentStatus = await request('/api/notifications/meal-intent', {
      headers: { Cookie: facultyUserCookie }
    });
    assert(facultyIntentStatus.status === 200 && facultyIntentStatus.data.meal !== null, 'GET /api/notifications/meal-intent returns meal details for faculty');

    // Invalid body testing (non-boolean willEat, wrong date)
    const invalidIntent1 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: studentUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: 'yes'
      })
    });
    assert(invalidIntent1.status === 400, 'Non-boolean willEat is rejected with 400 Validation Error');

    const invalidIntent2 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: studentUserCookie },
      body: JSON.stringify({
        mealDate: '2099-01-01',
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(invalidIntent2.status === 400, 'Wrong meal date is rejected with 400 Invalid target meal');

    // Student answers "Yes, I'll eat"
    const submitIntentStudent = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: studentUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(submitIntentStudent.status === 200 && submitIntentStudent.data.willEat === true, 'Student submits Yes meal intention (200)');

    // Student changes answer to "No, I won't" before cutoff
    const changeIntentStudent = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: studentUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: false
      })
    });
    assert(changeIntentStudent.status === 200 && changeIntentStudent.data.willEat === false, 'Student changes intention to No before cutoff (200)');

    // Faculty answers "Yes, I'll eat"
    const submitIntentFaculty = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: facultyUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(submitIntentFaculty.status === 200 && submitIntentFaculty.data.willEat === true, 'Faculty submits Yes meal intention (200)');

    // 11. Admin Analytics & Role Breakdown
    console.log(`\n[TEST GROUP 7] Admin Analytics & Role Split`);
    const adminPollDetails = await request(`/api/admin/polls/${activePollId}/results`, {
      headers: { Cookie: adminUserCookie }
    });
    assert(adminPollDetails.status === 200, 'Admin can view detailed poll results (200)');
    assert(typeof adminPollDetails.data.registeredStudentCount === 'number', 'Admin poll details report registered student count');
    assert(typeof adminPollDetails.data.registeredFacultyCount === 'number', 'Admin poll details report registered faculty count');

    const adminIntentMetrics = await request(`/api/admin/meal-intent?date=${upcomingMealDate}&type=${upcomingMealType}`, {
      headers: { Cookie: adminUserCookie }
    });
    assert(adminIntentMetrics.status === 200, 'Admin can fetch meal intention analytics (200)');
    assert(adminIntentMetrics.data.summary.yes.count >= 1, 'Admin meal intention counts Yes responses');
    assert(adminIntentMetrics.data.summary.no.count >= 1, 'Admin meal intention counts No responses');
    assert(adminIntentMetrics.data.splitByRole.yes.faculty >= 1, 'Admin meal intention splits Yes by faculty role');
    assert(adminIntentMetrics.data.splitByRole.no.student >= 1, 'Admin meal intention splits No by student role');

    // 12. Admin Poll Controls
    console.log(`\n[TEST GROUP 8] Admin Poll Controls`);
    const closePollRes = await request(`/api/admin/polls/${activePollId}`, {
      method: 'PATCH',
      headers: { Cookie: adminUserCookie },
      body: JSON.stringify({ is_active: false })
    });
    assert(closePollRes.status === 200 && closePollRes.data.poll.is_active === 0, 'Admin successfully closes poll (PATCH 200)');

    const reopenPollRes = await request(`/api/admin/polls/${activePollId}`, {
      method: 'PATCH',
      headers: { Cookie: adminUserCookie },
      body: JSON.stringify({ is_active: true })
    });
    assert(reopenPollRes.status === 200 && reopenPollRes.data.poll.is_active === 1, 'Admin successfully reopens poll (PATCH 200)');

    // 13. BIT Central Live Mess Menu Integration
    console.log(`\n[TEST GROUP 9] BIT Central Live Mess Menu Integration`);
    const unauthMenu = await request('/api/mess-menu?hostel=boys&date=2026-10-22');
    assert(unauthMenu.status === 401, 'Unauthenticated request to /api/mess-menu returns 401');

    const badHostelMenu = await request('/api/mess-menu?hostel=other&date=2026-10-22', {
      headers: { Cookie: studentUserCookie }
    });
    assert(badHostelMenu.status === 400, 'Invalid hostel returns 400 validation error');

    const badDateMenu = await request('/api/mess-menu?hostel=boys&date=invalid-date', {
      headers: { Cookie: studentUserCookie }
    });
    assert(badDateMenu.status === 400, 'Invalid date format returns 400 validation error');

    const liveMenuStudent = await request('/api/mess-menu?hostel=boys&date=2026-10-22&refresh=true', {
      headers: { Cookie: studentUserCookie }
    });
    assert(liveMenuStudent.status === 200, 'Student can access live mess menu (200)');
    assert(liveMenuStudent.data.hostel === 'boys', 'Normalized menu returns correct hostel');
    assert(liveMenuStudent.data.date === '2026-10-22', 'Normalized menu returns requested date');
    assert(liveMenuStudent.data.source === 'bitcentral.bitsathy.in', 'Normalized menu returns official source attribution');
    assert(Array.isArray(liveMenuStudent.data.fullMenu?.lunch), 'Normalized menu contains fullMenu arrays');
    assert(liveMenuStudent.data.cached === false, 'refresh=true bypasses cache');

    const cachedMenuStudent = await request('/api/mess-menu?hostel=boys&date=2026-10-22', {
      headers: { Cookie: studentUserCookie }
    });
    assert(cachedMenuStudent.status === 200 && cachedMenuStudent.data.cached === true, 'Subsequent identical request returns cached: true');

    const liveMenuFaculty = await request('/api/mess-menu?hostel=girls&date=2026-10-22', {
      headers: { Cookie: facultyUserCookie }
    });
    assert(liveMenuFaculty.status === 200 && liveMenuFaculty.data.hostel === 'girls', 'Faculty can access live mess menu for girls hostel (200)');

    const liveMenuAdmin = await request('/api/mess-menu?hostel=boys&date=2026-10-22', {
      headers: { Cookie: adminUserCookie }
    });
    assert(liveMenuAdmin.status === 200, 'Admin can access live mess menu (200)');

    // =========================================================================
    // 14. Google Authentication with BIT Domain Restriction (Prompt Requirements)
    // =========================================================================
    console.log(`\n[TEST GROUP 10] Google Authentication & BIT Domain Restriction (@bitsathy.ac.in)`);

    const bitStudentEmail = `bit_student_${testTimestamp}@bitsathy.ac.in`;
    const bitFacultyEmail = `bit_faculty_${testTimestamp}@bitsathy.ac.in`;
    const bitAdminEmail = `bit_admin_${testTimestamp}@bitsathy.ac.in`;

    function makeMockGoogleToken(payload) {
      return 'mock-google-token:' + JSON.stringify(payload);
    }

    // CASE 4: Gmail account outside the allowed domain -> REJECTED (403)
    const gmailAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: 'student@gmail.com',
          email_verified: true,
          name: 'Gmail User'
        }),
        role: 'student'
      })
    });
    assert(gmailAttempt.status === 403, 'Case 4: Gmail account (@gmail.com) outside allowed domain is rejected with 403 Forbidden');
    assert(gmailAttempt.data.message?.includes('@bitsathy.ac.in'), 'Case 4: Error explicitly specifies @bitsathy.ac.in restriction');

    // CASE 5: Similar-looking but invalid domains -> REJECTED (403)
    const otherCollegeAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: 'student@othercollege.ac.in',
          email_verified: true,
          name: 'Other College Student'
        }),
        role: 'student'
      })
    });
    assert(otherCollegeAttempt.status === 403, 'Case 5a: Other college domain (@othercollege.ac.in) rejected with 403 Forbidden');

    const suffixDomainAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: 'student@bitsathy.ac.in.example.com',
          email_verified: true,
          name: 'Attacker Domain'
        }),
        role: 'student'
      })
    });
    assert(suffixDomainAttempt.status === 403, 'Case 5b: Suffix domain extension (@bitsathy.ac.in.example.com) rejected with 403 Forbidden');

    const fakeBitAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: 'student@fakebitsathy.ac.in',
          email_verified: true,
          name: 'Fake Substring'
        }),
        role: 'student'
      })
    });
    assert(fakeBitAttempt.status === 403, 'Case 5c: Substring domain (@fakebitsathy.ac.in) rejected with 403 Forbidden');

    // CASE 6: Unverified email -> REJECTED (403)
    const unverifiedEmailAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: 'unverified@bitsathy.ac.in',
          email_verified: false,
          name: 'Unverified BIT Member'
        }),
        role: 'student'
      })
    });
    assert(unverifiedEmailAttempt.status === 403, 'Case 6: Unverified Google email rejected with 403 Forbidden');

    // CASE 7: Invalid or expired ID token -> REJECTED (401)
    const expiredTokenAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: bitStudentEmail,
          email_verified: true,
          expired: true
        }),
        role: 'student'
      })
    });
    assert(expiredTokenAttempt.status === 401, 'Case 7a: Expired Google ID token rejected with 401 Unauthorized');

    const invalidTokenAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: 'invalid_raw_token_xyz_123',
        role: 'student'
      })
    });
    assert(invalidTokenAttempt.status === 401, 'Case 7b: Invalid Google ID token rejected with 401 Unauthorized');

    // CASE 8: User attempting to manipulate their role to Admin -> REJECTED (403)
    const roleManipulateAttempt = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: `attacker_${testTimestamp}@bitsathy.ac.in`,
          email_verified: true,
          name: 'Privilege Escalation Attacker'
        }),
        role: 'admin'
      })
    });
    assert(roleManipulateAttempt.status === 403, 'Case 8: User attempting to self-assign Admin role via Google rejected with 403 Forbidden');

    // CASE 1: Automatic Student Account Creation with Recognized Department & Batch (.ad24 -> AI&DS, 2024-2028)
    const aidsEmail = `rahul_${testTimestamp}.ad24@bitsathy.ac.in`;
    const googleAidsLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: aidsEmail,
          email_verified: true,
          name: 'Rahul M'
        })
      })
    });
    assert(googleAidsLogin.status === 201 && googleAidsLogin.data.user.role === 'student', 'Case 1a: New student automatically receives Student account (201)');
    assert(googleAidsLogin.data.user.department === 'Artificial Intelligence and Data Science (AI&DS)', 'Case 1b: .ad code parses to Artificial Intelligence and Data Science (AI&DS)');
    assert(googleAidsLogin.data.user.batch_start_year === 2024, 'Case 1c: 24 code parses to 2024 admission year');
    assert(googleAidsLogin.data.user.batch_end_year === 2028, 'Case 1d: Course duration calculates 2028 graduation year');
    assert(googleAidsLogin.data.user.profile_completed === true, 'Case 1e: Recognized department marks profile_completed true');
    const googleStudentCookie = extractTokenCookie(googleAidsLogin.cookieHeader);

    // CASE 2: Automatic Student Account Creation for Roll Number pattern (e.g. 7376221cs101 -> CSE, 2022-2026)
    const cseRollEmail = `7376221cs${String(testTimestamp).slice(-3)}@bitsathy.ac.in`;
    const googleCseLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: cseRollEmail,
          email_verified: true,
          name: 'Priya C'
        })
      })
    });
    assert(googleCseLogin.status === 201 && googleCseLogin.data.user.department === 'Computer Science and Engineering (CSE)', 'Case 2a: Roll number format parses Computer Science and Engineering (CSE)');
    assert(googleCseLogin.data.user.batch_start_year === 2022 && googleCseLogin.data.user.batch_end_year === 2026, 'Case 2b: 22 roll format parses 2022–2026 batch');

    // CASE 3: Safe Fallback for Ambiguous / Unknown email pattern (department: null, profile_completed: false)
    const ambiguousEmail = `ambiguous_student_${testTimestamp}@bitsathy.ac.in`;
    const googleAmbiguousLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: ambiguousEmail,
          email_verified: true,
          name: 'Ambiguous Student'
        })
      })
    });
    assert(googleAmbiguousLogin.status === 201 && googleAmbiguousLogin.data.user.role === 'student', 'Case 3a: Ambiguous email automatically creates Student account (201)');
    assert(googleAmbiguousLogin.data.user.department === null, 'Case 3b: Ambiguous pattern safely falls back to department: null');
    assert(googleAmbiguousLogin.data.user.profile_completed === false, 'Case 3c: Ambiguous pattern marks profile_completed false');

    // CASE 4: Existing Student Re-login (preserves data, does not create duplicates)
    const googleStudentReLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: aidsEmail,
          email_verified: true,
          name: 'Rahul M'
        })
      })
    });
    assert(googleStudentReLogin.status === 200 && googleStudentReLogin.data.user.role === 'student', 'Case 4a: Existing student logs in with HTTP 200');
    assert(googleStudentReLogin.data.user.department === 'Artificial Intelligence and Data Science (AI&DS)', 'Case 4b: Existing student retains parsed department');

    const [countRows] = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [aidsEmail]);
    assert(countRows[0].cnt === 1, 'Case 4c: Exactly 1 account exists in database for this email (no duplicates)');

    // CASE 5: Concurrency Protection (simultaneous sign-ins for same new email)
    const concurrentEmail = `concurrent_${testTimestamp}@bitsathy.ac.in`;
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      request('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken: makeMockGoogleToken({ email: concurrentEmail, email_verified: true, name: 'Concurrent User' })
        })
      }),
      request('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken: makeMockGoogleToken({ email: concurrentEmail, email_verified: true, name: 'Concurrent User' })
        })
      })
    ]);
    assert((concurrentRes1.status === 200 || concurrentRes1.status === 201) &&
           (concurrentRes2.status === 200 || concurrentRes2.status === 201),
           'Case 5a: Simultaneous sign-ins both succeed without crashing or 500 errors');
    const [concurrentCount] = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE email = ?', [concurrentEmail]);
    assert(concurrentCount[0].cnt === 1, 'Case 5b: Concurrency race condition correctly creates exactly 1 database record');

    // CASE 6: Existing Faculty role preservation
    await db.query(
      `INSERT INTO users (name, email, college_name, student_type, password_hash, role, auth_provider)
       VALUES (?, ?, ?, 'home', NULL, 'faculty', 'google')`,
      ['Dr. S. Karthik', bitFacultyEmail, 'Bannari Amman Institute of Technology']
    );

    const googleFacultyLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: bitFacultyEmail,
          email_verified: true,
          name: 'Dr. S. Karthik'
        })
      })
    });
    assert(googleFacultyLogin.status === 200 && googleFacultyLogin.data.user.role === 'faculty', 'Case 6a: Existing Faculty logs in and preserves faculty role (200)');
    const googleFacultyCookie = extractTokenCookie(googleFacultyLogin.cookieHeader);

    // CASE 7: Existing Admin role preservation
    await db.query(
      `INSERT INTO users (name, email, college_name, student_type, password_hash, role, auth_provider)
       VALUES (?, ?, ?, 'home', NULL, 'admin', 'google')`,
      ['BIT Mess Administrator', bitAdminEmail, 'Bannari Amman Institute of Technology']
    );

    const googleAdminLogin = await request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        idToken: makeMockGoogleToken({
          email: bitAdminEmail,
          email_verified: true,
          name: 'BIT Mess Administrator'
        })
      })
    });
    assert(googleAdminLogin.status === 200 && googleAdminLogin.data.user.role === 'admin', 'Case 7a: Existing Admin logs in and preserves admin role (200)');
    const googleAdminCookie = extractTokenCookie(googleAdminLogin.cookieHeader);

    const adminGooglePollsAccess = await request('/api/admin/polls', { headers: { Cookie: googleAdminCookie } });
    assert(adminGooglePollsAccess.status === 200, 'Case 7b: Google-authenticated Admin can access protected admin polls route (200)');

    // CASE 10: Logout and expired sessions
    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: googleStudentCookie }
    });
    assert(logoutRes.status === 200, 'Case 10a: POST /api/auth/logout succeeds (200)');

    const postLogoutMe = await request('/api/auth/me');
    assert(postLogoutMe.status === 401, 'Case 10b: Access to /api/auth/me after logout rejected with 401 Unauthorized');

    // CASE 11: Direct API requests without valid authentication
    const directAdminNoAuth = await request('/api/admin/polls');
    assert(directAdminNoAuth.status === 401, 'Case 11a: Direct request to /api/admin/polls without auth returns 401');

    const directIntentNoAuth = await request('/api/notifications/meal-intent');
    assert(directIntentNoAuth.status === 401, 'Case 11b: Direct request to /api/notifications/meal-intent without auth returns 401');

    const directMessMenuNoAuth = await request('/api/mess-menu?hostel=boys&date=2026-10-22');
    assert(directMessMenuNoAuth.status === 401, 'Case 11c: Direct request to /api/mess-menu without auth returns 401');

    // CASE 12: Existing Student, Faculty, and Admin permissions after integration
    const studentAdminBlock = await request('/api/admin/polls', { headers: { Cookie: googleStudentCookie } });
    assert(studentAdminBlock.status === 403, 'Case 12a: Google-authenticated Student is forbidden from admin routes (403)');

    const facultyAdminBlock = await request('/api/admin/polls', { headers: { Cookie: googleFacultyCookie } });
    assert(facultyAdminBlock.status === 403, 'Case 12b: Google-authenticated Faculty is forbidden from admin routes (403)');

    const studentMenuAccess = await request('/api/mess-menu?hostel=boys&date=2026-10-22', { headers: { Cookie: googleStudentCookie } });
    assert(studentMenuAccess.status === 200, 'Case 12c: Google-authenticated Student can access live mess menu (200)');

    const facultyMenuAccess = await request('/api/mess-menu?hostel=girls&date=2026-10-22', { headers: { Cookie: googleFacultyCookie } });
    assert(facultyMenuAccess.status === 200, 'Case 12d: Google-authenticated Faculty can access live mess menu (200)');

    // 15. Unknown Endpoint 404 Check
    const unknownRes = await request('/api/unknown-endpoint');
    assert(unknownRes.status === 404 && unknownRes.data.error === 'Not found', 'Unknown /api route returns JSON 404');

    console.log(`\n=======================================================`);
    console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`=======================================================\n`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during test run:', error);
    process.exit(1);
  } finally {
    try {
      await db.getPool().end();
    } catch (_) {}
    if (localServer) {
      await new Promise(r => localServer.close(r));
    }
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = runTestSuite;
