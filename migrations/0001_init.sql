-- HQ. Column names match the field names the app uses, so the sync layer needs no mapping.
-- JSON columns (marked) hold nested data; the server parses them on read.

CREATE TABLE people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, seat TEXT DEFAULT '', -- email is empty until they first sign in
  role TEXT NOT NULL DEFAULT 'Member', active INTEGER NOT NULL DEFAULT 1, inactiveOn TEXT, color TEXT,
  createdAt TEXT,
  alt TEXT DEFAULT '' -- other sign-in addresses for the same person, comma separated (shared studio inboxes)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT, owner TEXT, due TEXT, archived INTEGER DEFAULT 0, "desc" TEXT DEFAULT '', createdAt TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, project TEXT, parent TEXT, title TEXT, "desc" TEXT DEFAULT '', owner TEXT, due TEXT,
  status TEXT DEFAULT 'todo', doneAt TEXT, rock TEXT, todo INTEGER DEFAULT 0, issue TEXT, newInMt INTEGER DEFAULT 0,
  createdAt TEXT
);
CREATE INDEX tasks_project ON tasks(project);
CREATE INDEX tasks_owner ON tasks(owner);

CREATE TABLE rocks (
  id TEXT PRIMARY KEY, q TEXT, goal TEXT, title TEXT, owner TEXT, type TEXT DEFAULT 'company', status TEXT DEFAULT 'on',
  "desc" TEXT DEFAULT '', "from" TEXT,
  closedMs TEXT -- JSON {done,total}, set when the quarter closes
);

CREATE TABLE quarters (
  id TEXT PRIMARY KEY, closedOn TEXT, "by" TEXT,
  corrections TEXT -- JSON array of {date,by,rockId,title,from,to,why}
);

CREATE TABLE metrics (
  id TEXT PRIMARY KEY, name TEXT, owner TEXT, unit TEXT DEFAULT '', how TEXT DEFAULT '', retired INTEGER DEFAULT 0,
  goals TEXT, -- JSON array of {from,op,goal}: each goal applies from its week on
  sort INTEGER DEFAULT 0
);

CREATE TABLE scores (
  id TEXT PRIMARY KEY, -- "<metric>|<week-ending date>"
  metric TEXT, week TEXT, value REAL
);

CREATE TABLE issues (
  id TEXT PRIMARY KEY, title TEXT, "by" TEXT, date TEXT, list TEXT DEFAULT 'weekly', pri INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open', details TEXT DEFAULT '', decision TEXT DEFAULT '', solvedOn TEXT
);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY, date TEXT, avg REAL,
  ratings TEXT, todos TEXT, solved TEXT, headlines TEXT, cascades TEXT -- JSON
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY, -- the year, as text
  year INTEGER, status TEXT DEFAULT 'open', revenue TEXT DEFAULT '', profit TEXT DEFAULT '', measurables TEXT DEFAULT '',
  closedOn TEXT, "by" TEXT
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY, year INTEGER, text TEXT, owner TEXT, status TEXT DEFAULT 'on', "from" TEXT, sort INTEGER DEFAULT 0
);

CREATE TABLE vto (
  id TEXT PRIMARY KEY, -- always 'main'
  data TEXT, -- JSON: the whole Vision
  "by" TEXT, date TEXT
);

CREATE TABLE vtoVersions (
  id TEXT PRIMARY KEY, date TEXT, "by" TEXT, label TEXT, snap TEXT -- JSON copy of the Vision
);

CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT); -- e.g. id 'quarter' = the open quarter

CREATE TABLE secrets (id TEXT PRIMARY KEY, value TEXT); -- server only, never sent to the app
