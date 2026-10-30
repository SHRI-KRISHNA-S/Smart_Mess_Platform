-- Migration: 001_role_restructuring.sql
-- Purpose: Restructure user roles to Student, Faculty, Admin and preserve historical data.
-- 1. Modify users.role ENUM to ('student', 'faculty', 'admin')
-- 2. Modify users.student_type to allow NULL / default 'home' without dropping historical records

ALTER TABLE users 
    MODIFY COLUMN role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student';

ALTER TABLE users 
    MODIFY COLUMN student_type VARCHAR(50) NULL DEFAULT 'home';

-- Add index on role for quick filtering if not present
SET @role_idx_exists = (
    SELECT COUNT(1) 
    FROM information_schema.statistics 
    WHERE table_schema = DATABASE() 
      AND table_name = 'users' 
      AND index_name = 'idx_users_role'
);

SET @stmt = IF(@role_idx_exists = 0, 'ALTER TABLE users ADD INDEX idx_users_role (role);', 'SELECT 1;');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
