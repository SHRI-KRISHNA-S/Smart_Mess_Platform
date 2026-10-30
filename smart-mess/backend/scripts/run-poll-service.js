const pollService = require('../src/services/pollService');
const db = require('../src/config/db');

async function main() {
  await pollService.syncDailyPolls();
  const today = pollService.getLocalDateString();
  const targetDate = pollService.getTomorrowDateString(today);

  console.log('=======================================================');
  console.log('  AUTHORITATIVE MEAL COUNT LOGIC EXECUTION');
  console.log('  File: backend/src/services/pollService.js');
  console.log('  Timezone: Asia/Kolkata (IST)');
  console.log('  Current Date:', today);
  console.log('  Target Meal Date:', targetDate);
  console.log('=======================================================\n');

  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const res = await pollService.getAuthoritativeMealCount(targetDate, meal);
    console.log(`[${meal.toUpperCase()}]`);
    console.log(`  Expected Meal Count:     ${res.expectedCount}`);
    console.log(`  Eligible Student Count:  ${res.eligibleStudentCount}`);
    console.log(`  Explicit YES Votes:      ${res.yesVotes}`);
    console.log(`  Explicit NO Votes:       ${res.noVotes}`);
    console.log(`  Not Voted (Default YES): ${res.notVoted}`);
    console.log(`  -----------------------------------`);
    console.log(`  Meals to Prepare:        ${res.mealsToPrepare} (${res.expectedCount} Expected - ${res.noVotes} NO)\n`);
  }

  await db.getPool().end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
