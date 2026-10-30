-- Database Schema for Smart Mess Meal Pre-Booking and Food Waste Reduction
-- Compatible with MySQL 8.0+

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    college_name VARCHAR(150) NOT NULL,
    student_type VARCHAR(50) DEFAULT 'home',
    password_hash VARCHAR(255) NULL,
    role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student',
    auth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    google_id VARCHAR(100) NULL,
    department VARCHAR(100) NULL,
    batch_start_year INT NULL,
    batch_end_year INT NULL,
    profile_completed TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS polls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    meal_date DATE NOT NULL,
    meal_type ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    closes_at DATETIME NULL,
    expected_count INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_polls_date_type UNIQUE (meal_date, meal_type),
    INDEX idx_polls_active_date (is_active, meal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    poll_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    display_order INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_menu_items_poll_id UNIQUE (id, poll_id),
    CONSTRAINT uq_menu_items_poll_order UNIQUE (poll_id, display_order),
    CONSTRAINT fk_menu_items_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    poll_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_votes_poll_user UNIQUE (poll_id, user_id),
    CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_votes_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    CONSTRAINT fk_votes_menu_item_poll FOREIGN KEY (menu_item_id, poll_id) REFERENCES menu_items(id, poll_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    meal_date DATE NOT NULL,
    meal_type ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
    will_eat TINYINT(1) NOT NULL,
    vote_choice ENUM('YES', 'NO') NOT NULL DEFAULT 'YES',
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_meal_responses_user_meal UNIQUE (user_id, meal_date, meal_type),
    CONSTRAINT fk_meal_responses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_meal_responses_date_type (meal_date, meal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

