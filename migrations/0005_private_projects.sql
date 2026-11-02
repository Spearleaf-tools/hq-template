-- Private projects and admin-only EOS pages.
-- A project is open to everyone unless visibility='members'; then only the people on its list and admins see it.
-- Each person on a list can "manage" it (change who sees it, add and remove people, archive) or "edit" (work in it).
ALTER TABLE projects ADD COLUMN visibility TEXT DEFAULT 'everyone';
ALTER TABLE projects ADD COLUMN createdBy TEXT;
CREATE TABLE projectMembers (
  id TEXT PRIMARY KEY, -- "<project>|<person>"
  project TEXT NOT NULL, person TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'edit', "by" TEXT, createdAt TEXT
);
CREATE INDEX projectMembers_project ON projectMembers(project);
CREATE INDEX projectMembers_person ON projectMembers(person);

-- A Vision version saved for admins only never reaches members.
ALTER TABLE vtoVersions ADD COLUMN audience TEXT DEFAULT 'everyone';

-- Nothing disappears on the day this ships: every existing project stays open to everyone, and its owner becomes
-- its first manager. Which EOS pages are hidden lives in settings (id 'hidden', a comma list), empty to start.
UPDATE projects SET visibility = 'everyone' WHERE visibility IS NULL;
INSERT OR IGNORE INTO projectMembers (id, project, person, level, createdAt)
  SELECT id || '|' || owner, id, owner, 'manage', date('now') FROM projects WHERE owner IS NOT NULL AND owner <> '';
