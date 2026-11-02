-- Which address someone last signed in with, and when ("address|ISO time"). Shared studio inboxes change hands,
-- so admins need to see who is actually using which one.
ALTER TABLE people ADD COLUMN lastLogin TEXT;
