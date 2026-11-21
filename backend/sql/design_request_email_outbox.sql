CREATE TABLE IF NOT EXISTS design_request_email_outbox (
    delivery_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    request_id INT UNSIGNED NOT NULL,
    recipient_email VARCHAR(254) NOT NULL,
    subject VARCHAR(240) NOT NULL,
    message TEXT NOT NULL,
    available_at_utc DATETIME NOT NULL,
    sent_at_utc DATETIME NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_error VARCHAR(500) NULL,
    INDEX design_email_ready (sent_at_utc, available_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
