-- Comments on tasks (2026-10-29). A comment shows to whoever can open its task; the server checks that.
CREATE TABLE comments (id TEXT PRIMARY KEY, task TEXT NOT NULL, "by" TEXT, body TEXT, at TEXT, edited TEXT);
CREATE INDEX comments_task ON comments(task);
