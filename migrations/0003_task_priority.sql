-- Task priority (1 High, 2 Medium, 3 Low; empty = not set) and who added the task, for the project list columns.
ALTER TABLE tasks ADD COLUMN priority INTEGER;
ALTER TABLE tasks ADD COLUMN createdBy TEXT;
