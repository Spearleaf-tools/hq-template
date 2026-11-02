-- Helpful links: every tool and page your team uses online, with a line on what it's for.
CREATE TABLE links (
  id TEXT PRIMARY KEY, title TEXT, url TEXT, about TEXT DEFAULT '', grp TEXT DEFAULT '', sort INTEGER DEFAULT 0,
  createdBy TEXT, createdAt TEXT
);
