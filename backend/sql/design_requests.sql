CREATE TABLE IF NOT EXISTS design_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    requester_department_id INT NULL,
    owner_department_id INT NOT NULL,
    category VARCHAR(32) NOT NULL,
    title VARCHAR(160) NOT NULL,
    brief TEXT NOT NULL,
    needed_by DATE NULL,
    delivery_due DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    stage VARCHAR(20) NOT NULL DEFAULT 'review',
    follow_up_date DATE NULL,
    follow_up_note TEXT NULL,
    draft_version INT UNSIGNED NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX design_inbox (owner_department_id, status, follow_up_date),
    INDEX design_sent (requester_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_request_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id INT UNSIGNED NOT NULL,
    actor_id INT NOT NULL,
    action VARCHAR(24) NOT NULL,
    note TEXT NULL,
    delivery_due DATE NULL,
    follow_up_date DATE NULL,
    follow_up_note TEXT NULL,
    draft_version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES design_requests(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_request_files (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    FOREIGN KEY (event_id) REFERENCES design_request_events(id)
) ENGINE=InnoDB;
