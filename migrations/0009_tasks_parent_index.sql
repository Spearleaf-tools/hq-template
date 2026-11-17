-- 2026-11-17: every task save looked up subtasks with WHERE parent=?, which scanned all ~3,600 tasks.
-- A save stuck retrying burned the free D1 limit of 5M rows read in about an hour. This makes it a few rows.
CREATE INDEX tasks_parent ON tasks(parent);
