// Reading, and saving the app's changes. The app keeps a full copy of the data its person may see, works out what
// changed, and posts a list of row changes to /api/sync. Every list is saved as one D1 batch (all or nothing).
// The rules below decide who may see and change what; anything not listed is refused.

export const TABLES = {
  people: { cols: ['name', 'email', 'alt', 'seat', 'role', 'active', 'inactiveOn', 'color', 'createdAt'], ins: true, del: false },
  projects: { cols: ['name', 'owner', 'due', 'archived', 'desc', 'createdAt', 'visibility', 'createdBy', 'fields', 'sort'], json: ['fields'], ins: true, del: false },
  projectMembers: { cols: ['project', 'person', 'level', 'by', 'createdAt'], ins: true, del: true },
  tasks: { cols: ['project', 'parent', 'title', 'desc', 'owner', 'due', 'status', 'doneAt', 'rock', 'todo', 'issue', 'newInMt', 'createdAt', 'priority', 'createdBy', 'sort', 'extra'], json: ['extra'], ins: true, del: true },
  comments: { cols: ['task', 'by', 'body', 'at', 'edited'], ins: true, del: true },
  rocks: { cols: ['q', 'goal', 'title', 'owner', 'type', 'status', 'desc', 'from', 'closedMs'], json: ['closedMs'], ins: true, del: true },
  quarters: { cols: ['closedOn', 'by', 'corrections'], json: ['corrections'], ins: true, del: false },
  metrics: { cols: ['name', 'owner', 'unit', 'how', 'retired', 'goals', 'sort'], json: ['goals'], ins: true, del: false },
  scores: { cols: ['metric', 'week', 'value'], ins: true, del: false },
  issues: { cols: ['title', 'by', 'date', 'list', 'pri', 'status', 'details', 'decision', 'solvedOn'], ins: true, del: false },
  meetings: { cols: ['date', 'avg', 'ratings', 'todos', 'solved', 'headlines', 'cascades'], json: ['ratings', 'todos', 'solved', 'headlines', 'cascades'], ins: true, del: false, upd: false },
  plans: { cols: ['year', 'status', 'revenue', 'profit', 'measurables', 'closedOn', 'by'], ins: true, del: false },
  goals: { cols: ['year', 'text', 'owner', 'status', 'from', 'sort'], ins: true, del: true },
  vto: { cols: ['data', 'by', 'date'], json: ['data'], ins: true, del: false },
  vtoVersions: { cols: ['date', 'by', 'label', 'snap', 'audience'], json: ['snap'], ins: true, del: false, upd: false },
  settings: { cols: ['value'], ins: true, del: false },
  links: { cols: ['title', 'url', 'about', 'grp', 'sort', 'createdBy', 'createdAt'], ins: true, del: true },
};

// EOS pages an admin can hide from members while they're being worked on, and the tables behind each. A hidden
// page's rows never reach members, and members can't change them. Which ones are hidden: settings row 'hidden'.
export const AREAS = { vision: ['vto', 'vtoVersions'], plan: ['plans', 'goals'], rocks: ['rocks', 'quarters'], scorecard: ['metrics', 'scores'], issues: ['issues'], meeting: ['meetings'] };
const AREA_OF = Object.fromEntries(Object.entries(AREAS).flatMap(([a, ts]) => ts.map((t) => [t, a])));
const hiddenAreas = (v) => String(v || '').split(',').map((x) => x.trim()).filter((x) => Object.hasOwn(AREAS, x));

// Who can see a project: admins; everyone, when it's open to everyone; otherwise only the people on its list.
// A project that doesn't exist is seen by nobody but admins. No project at all (a loose task) is seen by everyone.
function access(projects, members, admins) {
  const st = { vis: new Map(projects.map((p) => [p.id, p.visibility || 'everyone'])), members: new Map(), admins };
  for (const m of members) st.members.set(m.project, (st.members.get(m.project) || new Map()).set(m.person, m.level));
  return st;
}
function canSee(st, pid, who) {
  if (!pid || st.admins.has(who)) return true;
  const v = st.vis.get(pid);
  return v !== undefined && (v !== 'members' || !!st.members.get(pid)?.has(who));
}

export class Refused extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new Refused(400, m);
const no = (m) => new Refused(403, m);

export async function getData(env, me) {
  const out = {};
  const res = await env.DB.batch(Object.keys(TABLES).map((t) => env.DB.prepare(`SELECT * FROM "${t}"`)));
  Object.keys(TABLES).forEach((t, i) => {
    const json = TABLES[t].json || [];
    out[t] = res[i].results.map((r) => {
      for (const k of json) if (r[k] != null) { try { r[k] = JSON.parse(r[k]); } catch { r[k] = null; } }
      return r;
    });
  });
  // `hidden.ms`: milestones a member can't see (they sit in a private project), counted per Rock, titles left out.
  const hidden = { ms: {} };
  if (out.people.find((p) => p.id === me.id)?.role === 'Admin') return { data: out, hidden };
  const off = hiddenAreas(out.settings.find((s) => s.id === 'hidden')?.value);
  for (const a of off) for (const t of AREAS[a]) out[t] = [];
  out.vtoVersions = out.vtoVersions.filter((v) => v.audience !== 'admins');
  const st = access(out.projects, out.projectMembers, new Set());
  // A subtask goes where its parent goes (all the way up, for any older data), so it never shows up somewhere a
  // task above it can't be seen.
  const byId = new Map(out.tasks.map((t) => [t.id, t]));
  // A parent that can't be found fails closed: an orphan never counts as public.
  const ok = (t) => {
    for (let x = t, n = 0; n < 10; n++) {
      if (!canSee(st, x.project, me.id)) return false;
      if (!x.parent) return true;
      x = byId.get(x.parent);
      if (!x) return false;
    }
    return false;
  };
  for (const t of out.tasks) {
    if (!t.rock || ok(t)) continue;
    const h = (hidden.ms[t.rock] ||= { done: 0, total: 0 });
    h.total++; if (t.status === 'done') h.done++;
  }
  if (!out.rocks.length) hidden.ms = {};
  // Saved meetings keep copies of their to-dos and solved issues. Since private projects arrived, the server stamps
  // each to-do with its project when the meeting is saved ('?' when it can't place it), and that decides who sees it.
  // To-dos without a stamp were saved before anything could be private, so they were open to everyone already.
  const shows = (x) => x && (!('project' in x) || canSee(st, x.project, me.id));
  out.meetings = out.meetings.map((m) => ({
    ...m,
    todos: Array.isArray(m.todos) ? m.todos.filter(shows) : m.todos,
    solved: off.includes('issues') ? [] : m.solved,
  }));
  out.tasks = out.tasks.filter(ok);
  // A comment shows to whoever can open its task.
  const seen = new Set(out.tasks.map((t) => t.id));
  out.comments = out.comments.filter((c) => seen.has(c.task));
  out.projects = out.projects.filter((p) => canSee(st, p.id, me.id));
  out.projectMembers = out.projectMembers.filter((m) => canSee(st, m.project, me.id));
  return { data: out, hidden };
}

function value(t, k, v) {
  if ((TABLES[t].json || []).includes(k)) {
    if (v == null) return null;
    const s = JSON.stringify(v);
    if (s.length > 200_000) throw bad(`${t}.${k} is too large`);
    return s;
  }
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw bad(`${t}.${k} is not a number`); return v; }
  if (typeof v === 'string') { if (v.length > 20_000) throw bad(`${t}.${k} is too long`); return v; }
  throw bad(`${t}.${k} has the wrong type`);
}

// Who may make this change. `ctx` holds what's loaded once per request: closed quarters and years, hidden EOS pages,
// and who could see each project before this save (`before`) and will after it (`after`).
async function check(c, keys, me, ctx, db) {
  const admin = me.role === 'Admin';
  const has = (...ks) => ks.some((k) => keys.includes(k));
  const row = async (sql) => db.prepare(sql).bind(c.id).first();
  // Managing a project is decided by the list as it was before this save, so nobody can promote themselves in it.
  const manages = (pid) => admin || ctx.created.has(pid) || ctx.before.members.get(pid)?.get(me.id) === 'manage';
  // The projects a task sits in: its own and every parent's up the line. Null when a parent is missing, so an orphan
  // never counts as public. `pending` includes this save's changes; without it, what's stored.
  const chain = async (id, pending) => {
    const out = [];
    for (let n = 0; id; n++) {
      if (n > 10 || (pending && ctx.taskDel.has(id))) return null;
      const r = await db.prepare('SELECT project, parent FROM tasks WHERE id=?').bind(id).first();
      if (!r && !(pending && ctx.taskIns.has(id))) return null;
      out.push(pending && ctx.taskProj.has(id) ? ctx.taskProj.get(id) : r?.project ?? null);
      id = pending && ctx.taskParent.has(id) ? ctx.taskParent.get(id) : r?.parent ?? null;
    }
    return out;
  };
  const seesAll = (st, projects, who) => !!projects && projects.every((p) => canSee(st, p, who));
  if (!admin && ctx.hidden.includes(AREA_OF[c.t])) throw no('An admin has hidden that page for now');
  switch (c.t) {
    case 'people':
      if (c.ins && !admin) throw no('Only an admin can add people');
      if (has('role', 'active', 'inactiveOn', 'email', 'alt') && !admin) throw no('Only an admin can change roles or deactivate people');
      if (c.f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.f.email)) throw bad('That email doesn’t look right');
      if (c.id !== me.id && !admin) throw no('Only an admin can edit someone else');
      break;
    case 'projects': {
      if (c.ins) {
        // A new project starts unarchived (the app always sends archived:0). Its maker is set by the server.
        if (c.f.archived && !admin) throw no('A new project can’t start archived');
      } else {
        if (!canSee(ctx.before, c.id, me.id)) throw no('That project is private');
        // A retried save sends the same maker again; only a different one is refused.
        if (has('createdBy') && c.f.createdBy !== (await row('SELECT createdBy FROM projects WHERE id=?'))?.createdBy) throw no('Who made a project can’t change');
        if (has('visibility', 'archived') && !manages(c.id)) throw no('Only someone who manages this project can change who sees it, or archive it');
      }
      if (has('owner', 'visibility')) {
        const owner = 'owner' in c.f ? c.f.owner : (await row('SELECT owner FROM projects WHERE id=?'))?.owner;
        if (owner && !canSee(ctx.after, c.id, owner)) throw bad('The project’s owner has to be on the project');
      }
      break;
    }
    case 'projectMembers': {
      // The id is "<project>|<person>", so one person is on a project's list at most once.
      const [pid, who, extra] = c.id.split('|');
      if (!pid || !who || extra !== undefined) throw bad('Bad project member id');
      if (c.ins && (c.f.project !== pid || c.f.person !== who)) throw bad('Bad project member id');
      if (!c.ins && (('project' in c.f && c.f.project !== pid) || ('person' in c.f && c.f.person !== who))) throw bad('Remove someone and add them again instead');
      if (!c.ins && !c.del && !ctx.before.members.get(pid)?.has(who)) throw bad('That person isn’t on this project');
      if (c.ins && !ctx.people.has(who)) throw bad('That person isn’t on the team');
      if (c.ins && !ctx.after.vis.has(pid)) throw bad('That project doesn’t exist');
      if (!manages(pid)) throw no('Only someone who manages this project can change who’s on it');
      break;
    }
    case 'rocks': {
      const cur = c.ins ? null : await row('SELECT q FROM rocks WHERE id=?');
      const q = c.f.q ?? cur?.q;
      if ((ctx.closedQ.has(q) || (cur && ctx.closedQ.has(cur.q))) && !admin) throw no('That quarter is closed. Only an admin can correct it');
      if (c.del && cur && ctx.closedQ.has(cur.q)) throw no('Rocks in a closed quarter can’t be deleted');
      break;
    }
    case 'quarters':
      if (!admin) throw no('Only an admin can close a quarter or correct one');
      break;
    case 'plans':
      if (ctx.closedY.has(c.id) && !admin) throw no('That year is closed. Only an admin can change it');
      if (has('status', 'closedOn', 'by') && !(c.ins && c.f.status === 'open') && !admin) throw no('Only an admin can close a year');
      break;
    case 'goals': {
      const cur = c.ins ? null : await row('SELECT year FROM goals WHERE id=?');
      const y = String(c.f.year ?? cur?.year ?? '');
      // Both ends count: a goal can't be moved into, or out of, a closed year.
      if ((ctx.closedY.has(y) || (cur && ctx.closedY.has(String(cur.year)))) && !admin) throw no('That year is closed. Only an admin can change its goals');
      break;
    }
    case 'settings':
      if (c.id === 'quarter' && !admin) throw no('Only an admin can change the current quarter');
      if (c.id === 'hidden' && !admin) throw no('Only an admin can hide or show EOS pages');
      break;
    case 'vtoVersions':
      if (c.f.audience === 'admins' && !admin) throw no('Only an admin can save a version just for admins');
      break;
    case 'tasks': {
      const cur = c.ins ? null : await row('SELECT project, parent, owner FROM tasks WHERE id=?');
      // Where it is now has to be visible (also for a delete), and so does where it's going.
      if (cur && !seesAll(ctx.before, await chain(c.id, false), me.id)) throw no('That task is in a private project');
      const kids = cur ? (await db.prepare('SELECT id, project FROM tasks WHERE parent=?').bind(c.id).all()).results : [];
      if (c.del) {
        // Deleting a task deletes its subtasks, so each of those has to be visible too.
        for (const k of kids) if (!seesAll(ctx.before, await chain(k.id, false), me.id)) throw no('One of its subtasks is in a private project');
        break;
      }
      const project = ('project' in c.f ? c.f.project : cur?.project) ?? null;
      const parent = ('parent' in c.f ? c.f.parent : cur?.parent) ?? null;
      // Privacy first, so no other message ever hints that a private task exists.
      const now = await chain(c.id, true);
      if (now && !seesAll(ctx.after, now, me.id)) throw no('That project is private. Ask someone who manages it to add you');
      if (!now) throw bad('That parent task doesn’t exist');
      // One level of subtasks, as in the app, so a subtask's privacy always comes from exactly one parent.
      if (has('parent') && parent) {
        if (parent === c.id) throw bad('A task can’t be its own subtask');
        const up = await chain(parent, true);
        if (!up) throw bad('That parent task doesn’t exist');
        if (up.length > 1) throw bad('A subtask can’t have subtasks of its own');
        if ([...ctx.taskParent.values()].includes(c.id) || kids.length) throw bad('A task with subtasks can’t become a subtask');
      }
      // A subtask stays in its parent's project, and a task that moves takes its subtasks along.
      if (parent && has('parent', 'project') && project !== ((await chain(parent, true))?.[0] ?? null)) throw bad('A subtask stays in its parent’s project');
      if (has('project')) for (const k of kids) if (!ctx.taskDel.has(k.id) && (ctx.taskProj.has(k.id) ? ctx.taskProj.get(k.id) : k.project) !== project) throw bad('Move its subtasks with it');
      // Nobody is handed a task they couldn't open.
      const owner = 'owner' in c.f ? c.f.owner : cur?.owner;
      if (has('owner', 'project', 'parent') && owner && !seesAll(ctx.after, now, owner)) throw bad('That person isn’t on the project. Add them to it first');
      break;
    }
    case 'comments': {
      // A comment follows its task: only someone who can open the task can read or write on it. Only its writer can
      // edit it; its writer or an admin can delete it.
      const cur = c.ins ? null : await row('SELECT task, "by" FROM comments WHERE id=?');
      if (!c.ins && !cur) { if (c.del) break; throw bad('That comment doesn’t exist'); }
      const tid = c.ins ? c.f.task : cur.task;
      if (typeof tid !== 'string' || !ID.test(tid)) throw bad('A comment needs a task');
      if (!seesAll(c.ins ? ctx.after : ctx.before, await chain(tid, c.ins), me.id)) throw no('That task is in a private project');
      if (c.ins && c.f.by !== me.id) throw bad('A comment is always written as you');
      if (!c.ins && has('task', 'by')) throw bad('A comment stays on its task');
      if (!c.ins && cur.by !== me.id && !(c.del && admin)) throw no(c.del ? 'Only who wrote a comment, or an admin, can delete it' : 'Only who wrote a comment can edit it');
      if (c.del) break;
      if ((c.ins || 'body' in c.f) && (typeof c.f.body !== 'string' || !c.f.body.trim() || c.f.body.length > 5000)) throw bad('A comment needs some words (up to 5,000 characters)');
      break;
    }
    case 'links':
      if ('url' in c.f && !/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(String(c.f.url || ''))) throw bad('Links start with https:// (or / for a page in HQ)');
      break;
  }
}

// Values the app relies on. Anything else would break a page for everyone until fixed by hand.
const ENUMS = {
  tasks: { status: ['todo', 'doing', 'done'], priority: [null, 1, 2, 3] },
  rocks: { status: ['on', 'off', 'done', 'missed'], type: ['company', 'individual'] },
  goals: { status: ['on', 'off', 'done', 'missed'] },
  issues: { status: ['open', 'solved'], list: ['weekly', 'longterm'] },
  plans: { status: ['open', 'closed'] },
  people: { role: ['Admin', 'Member'] },
  projects: { visibility: ['everyone', 'members'] },
  projectMembers: { level: ['manage', 'edit'] },
  vtoVersions: { audience: ['everyone', 'admins'] },
};
// Ids, links to other rows, dates and numbers end up inside the page's HTML attributes, so they must look exactly
// like what the app writes: then no stored value can ever turn into markup.
const ID = /^[A-Za-z0-9_.|:-]{1,120}$/;
const REFS = ['project', 'parent', 'owner', 'rock', 'issue', 'createdBy', 'goal', 'metric', 'by', 'person'];
const DATES = ['due', 'createdAt', 'doneAt', 'date', 'solvedOn', 'inactiveOn', 'closedOn', 'week'];
const NUMS = ['value', 'avg', 'todo', 'newInMt', 'archived', 'active', 'retired', 'sort', 'year', 'pri', 'priority'];
const isDate = (v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
const strs = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
const vision = (d) => d && typeof d === 'object' && !Array.isArray(d) && strs(d.values ?? []) && strs(d.uniques ?? [])
  && ['purpose', 'niche', 'tenYear', 'target', 'process', 'guarantee'].every((k) => d[k] == null || typeof d[k] === 'string')
  && (d.threeYear == null || (typeof d.threeYear === 'object' && strs(d.threeYear.looks ?? []) && ['date', 'revenue', 'profit', 'measurables'].every((k) => d.threeYear[k] == null || typeof d.threeYear[k] === 'string')));

// A project's own list column: text, a number, or a dropdown with named, colored options.
const field = (f) => f && typeof f === 'object' && typeof f.id === 'string' && ID.test(f.id) && typeof f.name === 'string' && f.name.length <= 60
  && [undefined, 'text', 'number', 'select'].includes(f.type)
  && (f.type === 'select' ? Array.isArray(f.opts) && f.opts.length >= 1 && f.opts.length <= 60 && f.opts.every((o) => o && typeof o.id === 'string' && ID.test(o.id) && typeof o.name === 'string' && o.name.length <= 60 && /^#[0-9a-f]{6}$/i.test(o.color)) : f.opts === undefined);

function shape(c, env) {
  for (const [k, v] of Object.entries(c.f)) {
    if (REFS.includes(k) && v != null && v !== '' && !ID.test(v)) throw bad(`${c.t}.${k} isn’t a valid id`);
    if (DATES.includes(k) && !isDate(v)) throw bad(`${c.t}.${k} isn’t a date`);
    // A Scorecard value is a number; a setting's value is text (the current quarter, the hidden pages).
    if (NUMS.includes(k) && !(c.t === 'settings' && k === 'value') && v != null && typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v))) throw bad(`${c.t}.${k} must be a number`);
  }
  if ((c.t === 'rocks' || c.t === 'goals') && c.f.from != null && c.f.from !== '' && !ID.test(c.f.from)) throw bad(`${c.t}.from isn’t a valid id`);
  if (c.t === 'people') {
    const doms = String(env.ALLOWED_DOMAINS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const extra = String(env.ALLOWED_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    for (const a of [c.f.email, ...String(c.f.alt || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)) {
      // An address already on file stays allowed (so an older outside address never blocks a handover); new ones must be ours.
      if (!doms.includes(a.split('@')[1]) && !extra.includes(a) && !(c.had || []).includes(a)) throw bad(`${a} isn’t a ${doms.join(' or ')} address`);
    }
  }
  for (const [k, allowed] of Object.entries(ENUMS[c.t] || {})) if (k in c.f && !allowed.includes(c.f[k])) throw bad(`${c.t}.${k} can’t be ${JSON.stringify(c.f[k])}`);
  if (c.t === 'metrics' && 'goals' in c.f && !(Array.isArray(c.f.goals) && c.f.goals.every((g) => g && typeof g === 'object' && typeof g.from === 'string' && ['>=', '<='].includes(g.op) && Number.isFinite(g.goal)))) throw bad('metrics.goals has the wrong shape');
  // A project's own list columns, and what a task has written in them.
  if (c.t === 'projects' && c.f.fields != null && !(Array.isArray(c.f.fields) && c.f.fields.length <= 40 && c.f.fields.every(field) && new Set(c.f.fields.map((f) => f.id)).size === c.f.fields.length)) throw bad('projects.fields has the wrong shape');
  if (c.t === 'tasks' && c.f.extra != null && !(typeof c.f.extra === 'object' && !Array.isArray(c.f.extra) && Object.keys(c.f.extra).length <= 40 && Object.entries(c.f.extra).every(([k, v]) => ID.test(k) && ((typeof v === 'string' && v.length <= 2000) || (typeof v === 'number' && Number.isFinite(v)))))) throw bad('tasks.extra has the wrong shape');
  if (c.t === 'people' && c.f.color != null && !/^#[0-9a-f]{6}$/i.test(c.f.color)) throw bad('people.color must look like #1B1714');
  if (c.t === 'vto' && 'data' in c.f && !vision(c.f.data)) throw bad('The Vision has the wrong shape');
  if (c.t === 'vtoVersions' && 'snap' in c.f && !vision(c.f.snap)) throw bad('That Vision version has the wrong shape');
  if (c.t === 'settings' && c.id === 'hidden' && 'value' in c.f && !(typeof c.f.value === 'string' && c.f.value.split(',').filter(Boolean).every((a) => Object.hasOwn(AREAS, a)))) throw bad('That isn’t an EOS page');
}

export async function sync(env, me, changes) {
  if (!Array.isArray(changes) || changes.length > 1000) throw bad('Bad change list');
  const db = env.DB;
  const [q, y, pr, pm, pe, hs, ar] = await db.batch([
    db.prepare('SELECT id FROM quarters'), db.prepare("SELECT id FROM plans WHERE status='closed'"),
    db.prepare('SELECT id, visibility FROM projects'), db.prepare('SELECT project, person, level FROM projectMembers'),
    db.prepare('SELECT id, role, active FROM people'), db.prepare("SELECT value FROM settings WHERE id='hidden'"),
    db.prepare("SELECT value FROM secrets WHERE id='accessRev'"),
  ]);
  const admins = new Set(pe.results.filter((r) => r.role === 'Admin').map((r) => r.id));
  // Who's asking, as stored right now (read with accessRev above): a request that started before a demotion or a
  // deactivation can't keep using the old role.
  const mine = pe.results.find((r) => r.id === me.id);
  if (!mine || !mine.active) throw no('Your access has been turned off');
  me = { ...me, role: mine.role };
  const ctx = {
    closedQ: new Set(q.results.map((r) => r.id)), closedY: new Set(y.results.map((r) => r.id)),
    hidden: hiddenAreas(hs.results[0]?.value), people: new Set(pe.results.map((r) => r.id)),
    before: access(pr.results, pm.results, admins), after: access(pr.results, pm.results, admins),
    created: new Set(), taskProj: new Map(), taskParent: new Map(), taskIns: new Set(), taskDel: new Set(),
  };
  // Who will see what once this save lands. Every change here is still checked on its own below, and one refusal
  // refuses the whole save, so a change can't sneak in by leaning on another one that fails.
  const touched = new Map(), removed = [], nowPrivate = [], demoted = [];
  let aclChange = false; // this save changes who can see what
  const rowsSeen = new Set();
  for (const [i, c] of changes.entries()) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string') continue;
    // One change per row (the app never sends more), so no rule can be dodged by deleting and re-adding in one save.
    if (rowsSeen.has(c.t + '|' + c.id)) { const e = bad('The same row came twice in one save'); e.at = i; throw e; }
    rowsSeen.add(c.t + '|' + c.id);
    const f = c.f && typeof c.f === 'object' ? c.f : {};
    if (c.t === 'projects' && !c.del) {
      if (c.ins || 'visibility' in f) aclChange = true;
      if (!ctx.before.vis.has(c.id) && c.ins) {
        ctx.created.add(c.id);
        ctx.after.vis.set(c.id, f.visibility || 'everyone');
        ctx.after.members.set(c.id, new Map([[me.id, 'manage']]));
      } else if (ctx.before.vis.has(c.id) && 'visibility' in f) {
        ctx.after.vis.set(c.id, f.visibility || 'everyone');
        if (f.visibility === 'members' && ctx.before.vis.get(c.id) !== 'members') nowPrivate.push(c.id);
      }
    }
    if (c.t === 'projectMembers') {
      const [pid, who] = c.id.split('|');
      const m = ctx.after.members.get(pid) || new Map();
      // An update to someone who isn't on the list changes nothing (the check below refuses it), so it can't count.
      if (c.del) { m.delete(who); removed.push([pid, who]); } else if (c.ins || ctx.before.members.get(pid)?.has(who)) m.set(who, f.level || m.get(who) || 'edit');
      aclChange = true;
      ctx.after.members.set(pid, m);
      if (!touched.has(pid)) touched.set(pid, i);
    }
    if (c.t === 'tasks' && !c.del && 'project' in f) ctx.taskProj.set(c.id, f.project);
    if (c.t === 'tasks' && !c.del && 'parent' in f) ctx.taskParent.set(c.id, f.parent);
    if (c.t === 'tasks' && !c.del && c.ins) ctx.taskIns.add(c.id);
    if (c.t === 'tasks' && c.del) ctx.taskDel.add(c.id);
    if (c.t === 'tasks' && (c.del || 'project' in f || 'parent' in f)) aclChange = true;
    if (c.t === 'people' && !c.del && ('role' in f || 'active' in f)) aclChange = true;
    if (c.t === 'people' && !c.del && 'role' in f && f.role !== 'Admin' && admins.has(c.id)) demoted.push(c.id);
    if (c.t === 'settings' && c.id === 'hidden') aclChange = true;
  }
  const stmts = [];
  let at = -1; // which change was refused, so the app can undo just that one
  try {
  for (const c of changes) {
    at++;
    const def = Object.hasOwn(TABLES, c?.t) ? TABLES[c.t] : null;
    if (!def) throw bad('Unknown table');
    // IDs end up inside HTML attributes, so only plain characters are allowed (every real ID fits: t_abc, 2026-Q4, m_x|2026-10-19).
    if (typeof c.id !== 'string' || !ID.test(c.id)) throw bad('Bad id');
    c.f = c.f && typeof c.f === 'object' ? c.f : {};
    if (c.del) {
      // A delete is always checked against the stored row (closed quarters and years), whatever else the request says.
      if (c.ins) throw bad('A change can’t be both new and deleted');
      if (!def.del) throw no(`${c.t} can’t be deleted`);
      await check(c, [], me, ctx, db);
      stmts.push(db.prepare(`DELETE FROM "${c.t}" WHERE id=?`).bind(c.id));
      // A task's comments, and its subtasks' comments, go with it.
      if (c.t === 'tasks') stmts.push(db.prepare('DELETE FROM comments WHERE task=? OR task IN (SELECT id FROM tasks WHERE parent=?)').bind(c.id, c.id));
      if (c.t === 'tasks') stmts.push(db.prepare('DELETE FROM tasks WHERE parent=?').bind(c.id));
      continue;
    }
    const keys = Object.keys(c.f);
    for (const k of keys) if (!def.cols.includes(k)) throw bad(`Unknown field ${c.t}.${k}`);
    if (c.ins && !def.ins) throw no(`New ${c.t} can’t be added here`);
    // "New" is decided by the database, not the request: an insert for a row that already exists is an update, so
    // it gets the same permission checks (closed quarters and years, history that can't change). Saved meetings and
    // Vision versions never change, so a repeat of their insert (a retried save) is skipped.
    if (c.ins && (await db.prepare(`SELECT 1 FROM "${c.t}" WHERE id=?`).bind(c.id).first())) {
      if (def.upd === false) continue;
      c.ins = false;
    }
    // A new project is made by whoever saves it, and they manage it from the start.
    if (c.t === 'projects' && c.ins) {
      if ('createdBy' in c.f && c.f.createdBy !== me.id) throw no('A project is made by whoever saves it');
      c.f.createdBy = me.id;
      if (!keys.includes('createdBy')) keys.push('createdBy');
    }
    if (c.t === 'people' && !c.ins && ('email' in c.f || 'alt' in c.f)) {
      const r = await db.prepare('SELECT email, alt FROM people WHERE id=?').bind(c.id).first();
      c.had = r ? [r.email, ...String(r.alt || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : [];
    }
    shape(c, env);
    if (!c.ins && def.upd === false) throw no(`${c.t} can’t be changed once saved`);
    await check(c, keys, me, ctx, db);
    if (c.t === 'meetings' && c.ins && Array.isArray(c.f.todos)) {
      // Each to-do is stamped with its task's project as it is now, counting every parent above it, so who may read
      // it later is settled for good. '?' (only admins see it) when a task or parent can't be found, or the chain
      // holds more than one project.
      const placeOf = async (id) => {
        const found = new Set();
        for (let n = 0; id; n++) {
          if (n > 10 || ctx.taskDel.has(id)) return '?';
          const r = await db.prepare('SELECT project, parent FROM tasks WHERE id=?').bind(id).first();
          if (!r && !ctx.taskIns.has(id)) return '?';
          const proj = ctx.taskProj.has(id) ? ctx.taskProj.get(id) : r?.project ?? null;
          if (proj) found.add(proj);
          id = ctx.taskParent.has(id) ? ctx.taskParent.get(id) : r?.parent ?? null;
        }
        return found.size > 1 ? '?' : [...found][0] ?? null;
      };
      c.f.todos = await Promise.all(c.f.todos.map(async (x) => (x && typeof x === 'object' ? { ...x, project: typeof x.id === 'string' ? await placeOf(x.id) : '?' } : x)));
    }
    const vals = keys.map((k) => value(c.t, k, c.f[k]));
    const cols = keys.map((k) => `"${k}"`);
    if (c.ins) {
      stmts.push(keys.length
        ? db.prepare(`INSERT INTO "${c.t}" (id,${cols.join(',')}) VALUES (?${',?'.repeat(keys.length)}) ON CONFLICT(id) DO UPDATE SET ${cols.map((k) => `${k}=excluded.${k}`).join(',')}`).bind(c.id, ...vals)
        : db.prepare(`INSERT OR IGNORE INTO "${c.t}" (id) VALUES (?)`).bind(c.id));
    } else if (keys.length) {
      stmts.push(db.prepare(`UPDATE "${c.t}" SET ${cols.map((k) => `${k}=?`).join(',')} WHERE id=?`).bind(...vals, c.id));
    }
    if (c.t === 'projects' && c.ins) stmts.push(db.prepare(`INSERT OR IGNORE INTO projectMembers (id,project,person,level,"by",createdAt) VALUES (?,?,?,'manage',?,?)`).bind(`${c.id}|${me.id}`, c.id, me.id, me.id, new Date().toISOString().slice(0, 10)));
  }
  // Every project keeps someone who can manage it. Only an admin can leave one with nobody.
  if (me.role !== 'Admin') {
    for (const [pid, i] of touched) {
      const had = [...(ctx.before.members.get(pid)?.values() || [])].includes('manage');
      const has = [...(ctx.after.members.get(pid)?.values() || [])].includes('manage');
      if (had && !has) { at = i; throw no('A project needs at least one person who manages it'); }
    }
  }
  } catch (e) {
    if (e instanceof Refused) e.at = at;
    throw e;
  }
  const pc = changes.filter((c) => c.t === 'people' && !c.del && ('email' in c.f || 'alt' in c.f));
  if (pc.length) {
    const rows = new Map((await db.prepare('SELECT id,email,alt FROM people').all()).results.map((r) => [r.id, { ...r }]));
    for (const c of pc) rows.set(c.id, { ...(rows.get(c.id) || {}), ...c.f });
    const seen = new Map();
    for (const [id, r] of rows) {
      for (const a of [r.email, ...String(r.alt || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)) {
        if (seen.has(a) && seen.get(a) !== id) {
          const e = bad(`${a} belongs to two people`);
          e.at = changes.findIndex((c) => pc.includes(c) && (c.id === id || c.id === seen.get(a)));
          throw e;
        }
        seen.set(a, id);
      }
    }
  }
  // Someone who can no longer see a project isn't left holding its open tasks: they go back to unassigned.
  const inProject = "status<>'done' AND (project=? OR parent IN (SELECT id FROM tasks WHERE project=?))";
  for (const [pid, who] of removed) {
    if (canSee(ctx.after, pid, who)) continue;
    stmts.push(db.prepare(`UPDATE tasks SET owner=NULL WHERE owner=? AND ${inProject}`).bind(who, pid, pid));
    stmts.push(db.prepare("UPDATE projects SET owner=NULL WHERE id=? AND owner=? AND visibility='members'").bind(pid, who));
  }
  // An admin made a member loses the private projects they aren't on, and their open tasks there.
  const notOn = "SELECT id FROM projects WHERE visibility='members' AND id NOT IN (SELECT project FROM projectMembers WHERE person=?)";
  for (const who of demoted) {
    stmts.push(db.prepare(`UPDATE tasks SET owner=NULL WHERE owner=? AND status<>'done' AND (project IN (${notOn}) OR parent IN (SELECT id FROM tasks WHERE project IN (${notOn})))`).bind(who, who, who));
    stmts.push(db.prepare(`UPDATE projects SET owner=NULL WHERE owner=? AND id IN (${notOn})`).bind(who, who));
  }
  for (const pid of nowPrivate) {
    stmts.push(db.prepare(`UPDATE tasks SET owner=NULL WHERE owner IS NOT NULL AND owner<>'' AND ${inProject} AND owner NOT IN (SELECT person FROM projectMembers WHERE project=?) AND owner NOT IN (SELECT id FROM people WHERE role='Admin')`).bind(pid, pid, pid));
  }
  const n = stmts.length;
  if (!n) return 0;
  // The checks above read the database before this batch runs. If someone else changed who can see what in between,
  // the first statement fails (json_extract of bad JSON raises an error) and D1 throws the whole batch away.
  stmts.unshift(db.prepare("SELECT CASE WHEN coalesce((SELECT value FROM secrets WHERE id='accessRev'),'0') = ? THEN 1 ELSE json_extract('{', '$') END").bind(ar.results[0]?.value ?? '0'));
  if (aclChange) stmts.push(db.prepare("INSERT INTO secrets (id,value) VALUES ('accessRev',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(crypto.randomUUID()));
  try {
    await db.batch(stmts);
  } catch (e) {
    if (/malformed JSON/i.test(String(e?.message || e))) throw new Refused(409, 'Someone changed who can see what while this was saving. Press Try again');
    throw e;
  }
  return n;
}
