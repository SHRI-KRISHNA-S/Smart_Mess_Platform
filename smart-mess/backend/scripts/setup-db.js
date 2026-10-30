const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'smart_mess_db',
  ADMIN_NAME = 'Mess Administrator',
  ADMIN_EMAIL = 'admin@mess.local',
  ADMIN_PASSWORD,
  HOME_COLLEGE_NAME = 'National Institute of Technology'
} = process.env;

function getDbConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  const config = {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  };

  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      config.host = parsed.hostname;
      config.port = Number(parsed.port) || 3306;
      config.user = decodeURIComponent(parsed.username);
      config.password = decodeURIComponent(parsed.password);
      const dbFromPath = parsed.pathname.replace(/^\//, '');
      if (dbFromPath) {
        config.database = dbFromPath;
      }
    } catch {
      // ignore
    }
  }

  const needsSsl =
    process.env.DB_SSL === 'true' ||
    (config.host && (
      config.host.includes('tidbcloud.com') ||
      config.host.includes('aivencloud.com') ||
      config.host.includes('clever-cloud.com')
    ));

  if (needsSsl) {
    config.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    };
  }

  // TiDB Cloud 'sys' is an internal MySQL database; use 'test' or 'smart_mess_db' for application data
  if (config.database === 'sys') {
    config.database = 'test';
  }

  return config;
}

// Validate database name against SQL injection
function isValidDbName(name) {
  return /^[a-zA-Z0-9_]+$/.test(name);
}

// Validate admin password strength
function validateAdminPassword(password) {
  if (!password) {
    throw new Error('ADMIN_PASSWORD is required in .env');
  }
  const placeholders = ['password', 'admin123', 'admin', 'changeme', 'placeholder'];
  if (placeholders.includes(password.toLowerCase().trim())) {
    throw new Error('ADMIN_PASSWORD cannot be a trivial or placeholder password.');
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must contain at least one letter and one number.');
  }
}

async function runSetup() {
  console.log('--- Starting Smart Mess Database Setup ---');

  const config = getDbConfig();

  if (!isValidDbName(config.database)) {
    console.error(`Invalid database name: "${config.database}". Database names must contain only alphanumeric characters and underscores.`);
    process.exit(1);
  }

  validateAdminPassword(ADMIN_PASSWORD);

  let initialConnection;
  const targetDb = config.database || 'smart_mess_db';

  // 1. First attempt: connect to MySQL server without database specified (allows creating target database)
  try {
    console.log(`Connecting to MySQL server at ${config.host}:${config.port} as user "${config.user}"...`);
    const serverOnlyConfig = { ...config };
    delete serverOnlyConfig.database;
    initialConnection = await mysql.createConnection(serverOnlyConfig);
  } catch (serverErr) {
    // 2. Second attempt: connect directly to target database (in case server restricts non-db connections)
    console.log(`Initial connection without database failed (${serverErr.message}). Retrying with direct database "${targetDb}"...`);
    try {
      initialConnection = await mysql.createConnection(config);
    } catch (directErr) {
      console.error('Failed to connect to MySQL server. Please ensure MySQL is running and your database credentials are correct.');
      console.error('Error detail:', directErr.message);
      process.exit(1);
    }
  }

  try {
    // Ensure database exists and select it
    try {
      console.log(`Ensuring database "${targetDb}" exists...`);
      await initialConnection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await initialConnection.changeUser({ database: targetDb });
    } catch (createErr) {
      console.log(`Note: CREATE DATABASE (${createErr.message}), switching directly to "${targetDb}"...`);
      await initialConnection.changeUser({ database: targetDb });
    }

    // 2. Read and run schema.sql
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    console.log(`Executing schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await initialConnection.query(schemaSql);
    console.log('Schema tables verified/created successfully.');

    // 2b. Safe migration: ensure uq_polls_date_type unique index exists on polls
    const [existingIndexes] = await initialConnection.query(
      "SELECT INDEX_NAME FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'polls' AND INDEX_NAME = 'uq_polls_date_type'"
    );
    if (existingIndexes.length === 0) {
      console.log('Applying safe migration: adding uq_polls_date_type unique constraint...');
      await initialConnection.query('ALTER TABLE polls ADD CONSTRAINT uq_polls_date_type UNIQUE (meal_date, meal_type)');
      console.log('Migration applied: uq_polls_date_type added.');
    }

    // 2c. Safe migration: Role Restructuring (Student, Faculty, Admin)
    console.log('Applying safe migration: updating user roles and student_type default...');
    await initialConnection.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student'"
    );
    await initialConnection.query(
      "ALTER TABLE users MODIFY COLUMN student_type VARCHAR(50) NULL DEFAULT 'home'"
    );

    const [roleIndexRows] = await initialConnection.query(
      "SELECT INDEX_NAME FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_role'"
    );
    if (roleIndexRows.length === 0) {
      await initialConnection.query('ALTER TABLE users ADD INDEX idx_users_role (role)');
      console.log('Migration applied: idx_users_role added.');
    }
    console.log('Role restructuring migrations verified/applied successfully.');

    // 2d. Safe migration: Google OAuth fields (password_hash nullable, auth_provider, google_id)
    console.log('Applying safe migration: ensuring Google OAuth fields in users table...');
    await initialConnection.query(
      "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL"
    );

    const [providerColRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'auth_provider'"
    );
    if (providerColRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) NOT NULL DEFAULT 'local'");
      console.log('Migration applied: auth_provider column added.');
    }

    const [googleIdColRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'"
    );
    if (googleIdColRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL");
      console.log('Migration applied: google_id column added.');
    }
    console.log('Google OAuth database migration verified/applied successfully.');

    // 2e. Safe migration: Student department, batch, and profile fields
    console.log('Applying safe migration: checking student department & batch fields in users table...');
    const [deptColRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department'"
    );
    if (deptColRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN department VARCHAR(100) NULL");
      console.log('Migration applied: department column added.');
    }

    const [batchStartRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'batch_start_year'"
    );
    if (batchStartRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN batch_start_year INT NULL");
      console.log('Migration applied: batch_start_year column added.');
    }

    const [batchEndRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'batch_end_year'"
    );
    if (batchEndRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN batch_end_year INT NULL");
      console.log('Migration applied: batch_end_year column added.');
    }

    const [profileCompletedRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_completed'"
    );
    if (profileCompletedRows.length === 0) {
      await initialConnection.query("ALTER TABLE users ADD COLUMN profile_completed TINYINT(1) NOT NULL DEFAULT 0");
      console.log('Migration applied: profile_completed column added.');
    }
    console.log('Department and batch migration verified/applied successfully.');

    // 2f. Safe migration: meal_responses vote_choice column and meal_votes view
    console.log('Applying safe migration: checking vote_choice in meal_responses and meal_votes view...');
    const [voteChoiceRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meal_responses' AND COLUMN_NAME = 'vote_choice'"
    );
    if (voteChoiceRows.length === 0) {
      await initialConnection.query("ALTER TABLE meal_responses ADD COLUMN vote_choice ENUM('YES', 'NO') NOT NULL DEFAULT 'YES'");
      await initialConnection.query("UPDATE meal_responses SET vote_choice = IF(will_eat = 1, 'YES', 'NO')");
      console.log('Migration applied: vote_choice column added to meal_responses.');
    }

    await initialConnection.query(`
      CREATE OR REPLACE VIEW meal_votes AS
      SELECT mr.id,
             mr.user_id,
             mr.user_id AS student_id,
             mr.meal_date,
             mr.meal_type,
             IF(mr.will_eat = 1, 'YES', 'NO') AS vote_choice,
             mr.will_eat,
             mr.responded_at,
             mr.updated_at,
             mr.responded_at AS timestamp,
             u.role
      FROM meal_responses mr
      JOIN users u ON mr.user_id = u.id;
    `);
    console.log('Migration applied: meal_votes view verified/created.');

    // 2g. Safe migration: expected_count column in polls table
    console.log('Applying safe migration: checking expected_count column in polls table...');
    const [expectedCountRows] = await initialConnection.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'polls' AND COLUMN_NAME = 'expected_count'"
    );
    if (expectedCountRows.length === 0) {
      await initialConnection.query("ALTER TABLE polls ADD COLUMN expected_count INT NOT NULL DEFAULT 100");
      console.log('Migration applied: expected_count column added to polls table.');
    }

    // 3. Check if polls table already has records; run seed.sql if empty
    const [existingPolls] = await initialConnection.query('SELECT COUNT(*) AS count FROM polls');
    if (existingPolls[0].count === 0) {
      const seedPath = path.resolve(__dirname, '../../database/seed.sql');
      console.log(`Running seed data from: ${seedPath}`);
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await initialConnection.query(seedSql);
      console.log('Seed poll and menu options inserted successfully.');
    } else {
      console.log(`Found ${existingPolls[0].count} existing poll(s); skipping seed poll insertion.`);
    }

    // 4. Create or update the admin account safely
    console.log(`Ensuring admin account exists for email "${ADMIN_EMAIL}"...`);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const [adminCheck] = await initialConnection.query(
      'SELECT id FROM users WHERE email = ?',
      [ADMIN_EMAIL]
    );

    if (adminCheck.length === 0) {
      await initialConnection.query(
        `INSERT INTO users (name, email, college_name, student_type, password_hash, role)
         VALUES (?, ?, ?, 'home', ?, 'admin')`,
        [ADMIN_NAME, ADMIN_EMAIL, HOME_COLLEGE_NAME, passwordHash]
      );
      console.log('Admin account created successfully.');
    } else {
      await initialConnection.query(
        `UPDATE users
         SET name = ?, college_name = ?, password_hash = ?, role = 'admin'
         WHERE email = ?`,
        [ADMIN_NAME, HOME_COLLEGE_NAME, passwordHash, ADMIN_EMAIL]
      );
      console.log('Admin account updated with current password from .env successfully.');
    }

    console.log('--- Database Setup Completed Successfully ---');
  } catch (err) {
    console.error('Error during database setup:', err.message);
    process.exit(1);
  } finally {
    if (initialConnection) {
      await initialConnection.end();
    }
  }
}

if (require.main === module) {
  runSetup();
}

module.exports = runSetup;
