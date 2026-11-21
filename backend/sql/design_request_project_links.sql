CREATE TABLE IF NOT EXISTS design_request_project_links (
    request_id INT UNSIGNED NOT NULL PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    assignee_id BIGINT UNSIGNED NULL,
    INDEX design_link_projects (project_id),
    INDEX design_link_assignees (assignee_id),
    FOREIGN KEY (request_id) REFERENCES design_requests(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_request_task_links (
    task_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    request_id INT UNSIGNED NOT NULL,
    INDEX design_task_request (request_id),
    FOREIGN KEY (request_id) REFERENCES design_request_project_links(request_id)
) ENGINE=InnoDB;
