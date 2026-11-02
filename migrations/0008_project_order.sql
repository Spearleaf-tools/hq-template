-- Projects get one shared order (2026-10-29): drag a project's dots to put the most important first.
-- It starts alphabetical, the way the menu listed them.
ALTER TABLE projects ADD COLUMN sort REAL;
UPDATE projects SET sort = 1024 + 1024 * (SELECT count(*) FROM projects p2
  WHERE lower(coalesce(p2.name, '')) < lower(coalesce(projects.name, ''))
     OR (lower(coalesce(p2.name, '')) = lower(coalesce(projects.name, '')) AND p2.id < projects.id));
