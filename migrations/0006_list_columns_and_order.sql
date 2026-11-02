-- Task list upgrades (2026-10-29): a custom task order people set by dragging, a project's own named columns,
-- and what each task has written in them.
ALTER TABLE tasks ADD COLUMN sort REAL;
ALTER TABLE projects ADD COLUMN fields TEXT;
ALTER TABLE tasks ADD COLUMN extra TEXT;
