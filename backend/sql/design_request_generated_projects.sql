-- Select the same MySQL database used by the Windows RMS preview before running.
SET @design_project_migration = IF(
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'design_request_project_links'
            AND column_name = 'generated_project'
    ),
    'SELECT ''Design project column already exists'' AS migration_status',
    'ALTER TABLE design_request_project_links ADD COLUMN generated_project TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE design_project_migration FROM @design_project_migration;
EXECUTE design_project_migration;
DEALLOCATE PREPARE design_project_migration;
