// End-to-end check against a running `wrangler dev` (DEV_LOGIN=1). Drives headless Chrome over the DevTools
// protocol: signs in, uses every main flow, reloads to prove it saved, checks the admin rules, and takes
// desktop and phone screenshots into test/out/.
//   node test/e2e.mjs http://127.0.0.1:8797
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8797';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--user-data-dir=' + OUT + 'profile-' + port, 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nextId = 1;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await wait(200);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
}
const send = (method, params = {}) => new Promise((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
async function nav(path) { await send('Page.navigate', { url: BASE + path }); await wait(1500); }
async function shot(name, w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  await wait(600);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name + '.png', Buffer.from(r.result.data, 'base64'));
}
const results = [];
async function step(name, fn) {
  try { const v = await fn(); results.push(['ok', name, v ?? '']); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
}
const settle = 'await commit();await new Promise(r=>setTimeout(r,150));await commit();if(diff().length)throw new Error("unsaved: "+JSON.stringify(diff()).slice(0,200));';

try {
  await connect();
  await send('Page.enable'); await send('Runtime.enable');
  await nav('/');
  await step('sign-in screen shows', () => js(`if(!document.querySelector('form[data-auth="dev"]'))throw new Error('no dev form');return 'ok'`));
  await step('dev sign-in as Paige (first person becomes admin)', () => js(`const f=document.querySelector('form[data-auth="dev"]');f.email.value='paige@example.com';f.requestSubmit();await new Promise(r=>setTimeout(r,1200));if(!D)throw new Error('not signed in');if(!isAdmin())throw new Error('not admin');return first(ME)`));
  // A second teammate signs in elsewhere.
  await fetch(BASE + '/auth/dev', { method: 'POST', headers: { 'X-HQ': '1', 'Content-Type': 'application/json' }, body: '{"email":"ali@example.com"}' });
  await step('basics exist (plan + vision)', () => js(`${settle}await refresh(true);return curPlan().year+' '+(vto()?'vision':'none')+' people='+D.people.length`));
  await step('+ creates a project and opens it', () => js(`ACT.newProject();const el=document.getElementById('p-title');if(document.activeElement!==el)throw new Error('title not focused');el.value='Dartmouth studio opening';el.dispatchEvent(new Event('input',{bubbles:true}));${settle}return S.view+' '+proj(S.projectId).name`));
  await step('add tasks, subtasks, due dates', () => js(`const p=S.projectId;const ali=D.people.find(x=>x.email==='ali@example.com').id;if(!isPrivate(proj(p)))throw new Error('new project not private');addMember(proj(p),ali);
    const a=newTask({project:p,title:'Presale landing page',due:addDays(TODAY,-2)});const b=newTask({project:p,title:'Google listing',owner:ali,due:addDays(TODAY,3)});
    newTask({project:p,parent:a.id,title:'Write copy'});newTask({project:p,parent:a.id,title:'Connect form',owner:ali,due:addDays(TODAY,-1)});newTask({title:'Loose task',owner:null});
    S.open[a.id]=true;renderMain();${settle}return D.tasks.length+' tasks'`));
  await step('due date and owner change right in the list', () => js(`S.tab='list';renderMain();const t=D.tasks.find(x=>x.title==='Google listing');const di=document.querySelector('.due-in[data-id="'+t.id+'"]');di.value=addDays(TODAY,9);di.dispatchEvent(new Event('change',{bubbles:true}));const oi=document.querySelector('.own-in[data-id="'+t.id+'"]');oi.value=ME;oi.dispatchEvent(new Event('change',{bubbles:true}));${settle}if(t.due!==addDays(TODAY,9))throw new Error('due '+t.due);if(t.owner!==ME)throw new Error('owner');return fmt(t.due)+', '+first(t.owner)`));
  await step('priority, sorting, duplicate and delete in the list', () => js(`S.tab='list';renderMain();const t=D.tasks.find(x=>x.title==='Google listing');
    if(!t.createdBy)throw new Error('no added-by');const ps=document.querySelector('select[data-change="tpri"][data-id="'+t.id+'"]');ps.value='1';ps.dispatchEvent(new Event('change',{bubbles:true}));if(t.priority!==1)throw new Error('priority not set');
    ACT.sortBy({dataset:{k:'pri'}});const top=document.querySelector('section .lrow .tlink').textContent;if(top!=='Google listing')throw new Error('sort put '+top+' first');
    const a=D.tasks.find(x=>x.title==='Presale landing page');const n=D.tasks.length;ACT.dupTask({dataset:{id:a.id}});if(D.tasks.length!==n+3)throw new Error('copied '+(D.tasks.length-n));
    const c=D.tasks.find(x=>x.title==='Presale landing page'&&x.id!==a.id);if(c.status!=='todo'||subsOf(c.id).length!==2)throw new Error('bad copy');
    ACT.closeDrawer();S.tab='list';renderMain();document.querySelector('.lrow .dots[data-id="'+c.id+'"]').click();if(!document.querySelector('.rmenu.open .mpop [data-act="dupTask"]'))throw new Error('no menu');
    document.querySelector('.rmenu.open [data-act="menuAskDel"]').click();if(!document.querySelector('.rmenu.open [data-act="delTask"]'))throw new Error('no confirm');document.querySelector('.rmenu.open [data-act="delTask"]').click();${settle}
    if(D.tasks.length!==n)throw new Error('delete left '+(D.tasks.length-n));await refresh(true);if(task(t.id).priority!==1)throw new Error('priority not saved');
    ACT.sortBy({dataset:{k:'due'}});return 'ok'`));
  await step('helpful links: add, edit, folding menu', () => js(`ACT.go({dataset:{v:'links'}});ACT.newLink();const f=document.querySelector('form[data-form="link"]');f.title.value='Rank Grid';f.url.value='grid.example.com';f.about.value='Map rankings for every client';f.requestSubmit();${settle}
    const l=D.links.find(x=>x.title==='Rank Grid');if(!l||l.url!=='https://grid.example.com')throw new Error('bad link '+JSON.stringify(l));if(!document.querySelector('.lk a[href="https://grid.example.com"]'))throw new Error('card missing');
    ACT.navSec({dataset:{k:'work'}});if(!document.querySelector('.nav-sec[hidden]'))throw new Error('did not fold');ACT.navSec({dataset:{k:'work'}});if(document.querySelector('.nav-sec[hidden]'))throw new Error('did not unfold');
    l.url='javascript:alert(1)';await commit();await new Promise(r=>setTimeout(r,150));await refresh(true);if(D.links.find(x=>x.id===l.id).url!=='https://grid.example.com')throw new Error('bad url was saved');return 'ok'`));
  await step('a name with markup shows as text, never as a control', () => js(`const p=D.people.find(x=>x.email==='ali@example.com');const was=p.name;p.name='<i id=pwn data-act=go>Ali</i>';S.who=p.id;go('mytasks');const bad=document.getElementById('pwn');p.name=was;S.who=null;go('mytasks');if(bad)throw new Error('markup ran');return 'escaped'`));
  await step('a refused change is undone alone; the others still save', () => js(`const [a,b]=D.tasks.filter(t=>!t.parent);a.status='banana';b.title='Renamed while another change fails';await commit();await new Promise(r=>setTimeout(r,200));await commit();await new Promise(r=>setTimeout(r,200));
    if(task(a.id).status==='banana')throw new Error('bad status kept');await refresh(true);if(task(b.id).title!=='Renamed while another change fails')throw new Error('good change lost');return 'ok'`));
  await step('an outside address can’t be added to a person', () => js(`const me=person(ME);me.alt='outsider@elsewhere.org';const t=D.tasks.find(x=>x.title==='Loose task');t.title='Kept although the address failed';await commit();await new Promise(r=>setTimeout(r,200));await commit();await new Promise(r=>setTimeout(r,200));
    await refresh(true);if(String(person(ME).alt||'').includes('outsider'))throw new Error('outside address saved');if(task(t.id).title!=='Kept although the address failed')throw new Error('other edit lost');return 'ok'`));
  await step('archive from the project page, then restore', () => js(`const tmp={id:uid('p'),name:'Old campaign',owner:ME,due:null,archived:0,desc:'',createdAt:TODAY};D.projects.push(tmp);S.projectId=tmp.id;go('project');S.menu='pmenu';renderMain();if(!document.querySelector('[data-act="askArchive"]'))throw new Error('no archive button');ACT.askArchive();ACT.archiveProject();${settle}if(!proj(tmp.id).archived)throw new Error('not archived');S.projectId=tmp.id;go('project');ACT.restoreProject({dataset:{id:tmp.id}});${settle}if(proj(tmp.id).archived)throw new Error('not restored');S.projectId=D.projects[0].id;return 'ok'`));
  await step('finished tasks show the day they were done', () => js(`S.tab='list';S.sort={k:'due',dir:1};const t=newTask({project:S.projectId,title:'Finished one',due:addDays(TODAY,-3)});setStatus(t,'done');renderMain();${settle}
    const cell=[...document.querySelectorAll('.lrow')].find(r=>r.textContent.includes('Finished one'))?.querySelector('.done-on');if(!cell||!cell.textContent.includes('Done Today'))throw new Error('no done date: '+(cell&&cell.textContent));return cell.textContent`));
  await step('parent-done warning', () => js(`const a=D.tasks.find(t=>t.title==='Presale landing page');ACT.toggleDone({dataset:{id:a.id}});if(S.modal!=='parentDone')throw new Error('no warning');ACT.closeModal();return 'warned'`));
  await shot('desktop-project-list', 1440, 900);
  await step('board view', () => js(`S.tab='board';renderMain();return document.querySelectorAll('.card').length+' cards'`));
  await shot('desktop-board', 1440, 900);
  await step('Vision edits + version', () => js(`go('vision');const d=vto().data;d.values.push('Empowerment through movement');d.purpose='A fitness culture with grace & grit';touchVto();ACT.saveVersion();document.querySelector('form[data-form="saveVersion"]').requestSubmit();${settle}return D.vtoVersions.length+' version'`));
  await step('1-Year Plan goals', () => js(`go('plan');const P=curPlan();P.revenue='$2.1M';['Open the Dartmouth studio','Grow conversion to 35%'].forEach((t,i)=>D.goals.push({id:uid('g'),year:P.year,text:t,owner:ME,status:'on',from:null,sort:i}));${settle}return goalsOf(P.year).length+' goals'`));
  await step('Rocks with milestones', () => js(`const g=goalsOf(curPlan().year)[0];const r={id:uid('r'),q:curQ(),goal:g.id,title:'Open Dartmouth on time',owner:ME,type:'company',status:'off',desc:'',from:null,closedMs:null};D.rocks.push(r);newTask({rock:r.id,title:'Sign lease'});const m=newTask({rock:r.id,title:'Hire front desk'});setStatus(D.tasks.find(t=>t.title==='Sign lease'),'done');go('rocks');${settle}return curRocks().length+' rock'`));
  await step('Scorecard numbers + validation', () => js(`go('scorecard');D.metrics.push({id:uid('m'),name:'Intro offers sold',how:'Walla',owner:ME,unit:'',retired:0,goals:[{from:'0000-01-01',op:'>=',goal:40}],sort:0});renderMain();const W=weeks();setScore(D.metrics[0],W[12],35);setScore(D.metrics[0],W[11],44);renderMain();${settle}const miss=document.querySelectorAll('td.miss').length;return W.length+' weeks, '+miss+' miss'`));
  await shot('desktop-scorecard', 1440, 900);
  await step('Issues: action, decision, solve', () => js(`go('issues');const i=newIssue('Saturday coverage at Melrose');S.openIssue=i.id;renderMain();draft(i).title='Send coverage options';ACT.addAction({dataset:{id:i.id}});ACT.solveIssue({dataset:{id:i.id}});if(i.status==='solved')throw new Error('solved without decision');i.decision='Ali covers Saturdays until we hire';ACT.solveIssue({dataset:{id:i.id}});${settle}return i.status+' with '+issueTasks(i).length+' action'`));
  await step('weekly meeting end-to-end', () => js(`go('meeting');ACT.startMt();for(let s=1;s<7;s++)ACT.goStep({dataset:{i:s}});S.mt.headlines.push({by:ME,text:'Presale page is live'});const t=newTask({title:'Order signage',todo:true,newInMt:true,due:addDays(TODAY,7)});S.mt.ratings[ME]='9';ACT.endMt();${settle}const m=meetingsDesc()[0];return 'avg '+m.avg+', todos '+m.todos.length+', headlines '+m.headlines.length`));
  await step('close the quarter (carry-over keeps open milestones)', () => js(`go('rocks');S.modal='closeQ';renderModal();const r=curRocks()[0];document.querySelector('[name=carry_'+r.id+']').checked=true;document.querySelector('form[data-form]').requestSubmit();${settle}lastServer='';await refresh(true);if(!D.settings.some(x=>x.id==='quarter'&&x.value===curQ()))throw new Error('the new quarter was not saved');const nr=D.rocks.find(x=>x.from===r.id);if(!nr)throw new Error('not carried');if(milestones(nr).length!==1)throw new Error('milestones '+milestones(nr).length);if(nr.status!=='off')throw new Error('status reset');return 'closed, now '+qLabel(curQ())`));
  await step('closed Rock is locked; correction recorded', () => js(`const r=D.rocks.find(x=>isClosedQ(x.q));openDrawer('rock',r.id);if(document.querySelector('.drawer textarea.dr-title'))throw new Error('editable');ACT.correctRock({dataset:{id:r.id}});document.getElementById('corr-to').value='done';document.getElementById('corr-why').value='Lease was signed on the last day';ACT.saveCorrection({dataset:{id:r.id}});${settle}return D.quarters[0].corrections.length+' correction'`));
  await step('close the year', () => js(`go('plan');S.modal='closeYear';renderModal();const g=goalsOf(curPlan().year)[1];document.querySelector('[name=carry_'+g.id+']').checked=true;document.querySelector('form[data-form]').requestSubmit();${settle}return 'now '+curPlan().year+' with '+goalsOf(curPlan().year).length+' goal'`));
  await step('shared inbox moves to a new hire; duplicates refused', () => js(`go('team');
    const me=person(ME);if(!me.lastLogin||!me.lastLogin.startsWith('paige@example.com|'))throw new Error('no last sign-in: '+me.lastLogin);
    const add=(id,v)=>{const el=document.getElementById('addr-'+id);el.value=v;ENTER.addAddr(el)};
    add(ME,'por@example.com');const np=document.getElementById('add-person');np.value='Jordan';ENTER.addPerson(np);${settle}
    const jo=D.people.find(x=>x.name==='Jordan');add(jo.id,'por@example.com');${settle}
    if(addrsOf(person(ME)).includes('por@example.com'))throw new Error('still on Paige');if(!addrsOf(jo).includes('por@example.com'))throw new Error('not on Jordan');
    jo.alt='paige@example.com';await commit();await new Promise(r=>setTimeout(r,150));if(String(person(jo.id).alt||'').includes('paige@'))throw new Error('duplicate was saved');
    return 'moved, duplicate refused'`));
  await step('deactivate Ali with handover', () => js(`go('team');const ali=D.people.find(x=>x.email==='ali@example.com');S.modal='deactivate';S.marg=ali.id;renderModal();document.querySelector('form[data-form]').requestSubmit();${settle}if(ali.active)throw new Error('still active');if(D.tasks.some(t=>t.owner===ali.id&&t.status!=='done'))throw new Error('open work left');return 'ok'`));
  await step('search finds things', () => js(`const q=document.getElementById('q');q.value='presale';q.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelectorAll('.qr').length+' results'`));
  await step('columns: hide, show and resize, kept on this device', () => js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.sort={k:'order',dir:1};go('project');
    ACT.menu({dataset:{id:'cols'}});const box=document.querySelector('.colopt input[data-k="added"]');box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));
    if(document.querySelector('.lhead .sorth[data-k="added"]')||document.querySelector('.lrow .lc'))throw new Error('Added still shown');if(!document.querySelector('.colpop'))throw new Error('menu closed');
    const pr=document.querySelector('.colopt input[data-k="pri"]');pr.checked=false;pr.dispatchEvent(new Event('change',{bubbles:true}));if(document.querySelector('.lrow .lp'))throw new Error('priority still shown');pr.checked=true;pr.dispatchEvent(new Event('change',{bubbles:true}));
    const h=document.querySelector('.rsz[data-col="owner"]');h.focus();h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    if(JSON.parse(localStorage.getItem('hq-cols')).w.owner!==186)throw new Error('width not saved');if(!document.querySelector('.ltab').style.getPropertyValue('--lcols').includes(' 186px'))throw new Error('width not applied');
    h.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));if(JSON.parse(localStorage.getItem('hq-cols')).w.owner)throw new Error('reset failed');
    CP.w.owner=900;sizeCols();const w=document.querySelector('.lwrap');if(w.scrollWidth<=w.clientWidth)throw new Error('no sideways scroll');
    w.scrollLeft=200;renderMain();if(document.querySelector('.lwrap').scrollLeft<150)throw new Error('scroll lost on redraw');
    const n=document.querySelector('.lrow:not(.addrow) .lname').getBoundingClientRect().left,m=document.querySelector('.lwrap').getBoundingClientRect().left;if(Math.abs(n-m)>2)throw new Error('name column moved');
    return 'ok'`));
  await shot('desktop-project-columns', 1280, 820);
  await step('columns: back to the usual set', () => js(`for(const k in CP.w)delete CP.w[k];for(const k in CP.off)delete CP.off[k];saveCols();S.menu=null;renderMain();return document.querySelectorAll('.lhead .lh').length+' columns'`));
  await shot('desktop-project-list', 1440, 900);
  await step('own columns: a dropdown, a number and text; fill in, edit, sort, widen the task column', () => js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.sort={k:'order',dir:1};go('project');
    const typ=(sel,v)=>{const el=document.querySelector(sel);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))};
    const make=(type,name,opts)=>{ACT.fieldNew();document.querySelector('.ftype[data-t="'+type+'"]').click();typ('.modal input[name="name"]',name);
      (opts||[]).forEach((o,i)=>{if(i>=2)document.querySelector('[data-act="optAdd"]').click();typ('.fopt:nth-child('+(i+1)+') .fin',o)});document.querySelector('form[data-form="field"]').requestSubmit()};
    make('select','Stage',['Booked','Waiting','Done']);make('number','Budget');make('text','Notes');
    const [sf,nf,tf]=fieldsOf(proj(S.projectId));if(sf?.type!=='select'||sf.opts.length!==3||nf?.type!=='number'||tf?.type!=='text')throw new Error('columns '+JSON.stringify(fieldsOf(proj(S.projectId))));
    const ids=[...document.querySelectorAll('.fcell[data-f="'+nf.id+'"]')].map(x=>x.dataset.id);if(ids.length<2)throw new Error('rows '+ids.length);
    const set=(f,id,v)=>{const el=document.querySelector('[data-f="'+f+'"][data-id="'+id+'"]');el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))};
    set(nf.id,ids[0],'1200');set(nf.id,ids[1],'900');set(tf.id,ids[0],'Call the landlord');set(sf.id,ids[0],sf.opts[1].id);set(sf.id,ids[1],sf.opts[0].id);
    if(task(ids[0]).extra[nf.id]!==1200)throw new Error('number stored as '+JSON.stringify(task(ids[0]).extra[nf.id]));
    const pill=document.querySelector('select[data-f="'+sf.id+'"][data-id="'+ids[1]+'"]');if(!pill.style.backgroundColor)throw new Error('dropdown not colored');
    ACT.sortBy({dataset:{k:'f:'+nf.id}});const order=[...document.querySelectorAll('section[data-sec="todo"] .lrow[data-row][data-par=""]')].map(r=>r.dataset.row);if(order.indexOf(ids[1])>order.indexOf(ids[0]))throw new Error('number sort');
    if(!document.querySelector('.fchip')?.textContent.includes('Budget'))throw new Error('sort chip');S.sort={k:'order',dir:1};
    ACT.fieldEdit({dataset:{f:sf.id}});typ('.modal input[name="name"]','Stage now');document.querySelectorAll('[data-act="optDel"]')[1].click();document.querySelector('form[data-form="field"]').requestSubmit();
    const sf2=fieldsOf(proj(S.projectId))[0];if(sf2.name!=='Stage now'||sf2.opts.length!==2)throw new Error('edit '+JSON.stringify(sf2));if(task(ids[0]).extra[sf.id])throw new Error('removed option still set');if(task(ids[1]).extra[sf.id]!==sf.opts[0].id)throw new Error('kept option lost');
    const h=document.querySelector('.rsz[data-col="name"]');h.focus();const w0=document.querySelector('.lhead .lname').getBoundingClientRect().width;h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    if(Math.abs(document.querySelector('.lhead .lname').getBoundingClientRect().width-(Math.round(w0)+16))>2)throw new Error('task column did not widen');delete CP.w.name;saveCols();
    ${settle}window.__fields=[sf.id,nf.id,tf.id];window.__cell=ids[0];window.__cell2=ids[1];renderMain();return 'ok'`));
  await shot('desktop-project-own-column', 1440, 900);
  await step('own columns: the server keeps them after a real reload, and refuses junk', async () => {
    const ids = await js(`return JSON.stringify({f:window.__fields,c:window.__cell,c2:window.__cell2})`);
    await send('Page.reload'); await wait(2500);
    return js(`const {f:[sid,nid,tid],c,c2}=${ids};for(let i=0;i<20&&!D;i++)await new Promise(r=>setTimeout(r,200));window.__fields=[sid,nid,tid];window.__cell=c;
      const p=D.projects.find(x=>fieldsOf(x).some(f=>f.id===nid));if(!p||fieldsOf(p).length!==3)throw new Error('columns lost');
      const e=task(c)?.extra||{};if(e[nid]!==1200||e[tid]!=='Call the landlord')throw new Error('values lost '+JSON.stringify(e));if(!task(c2)?.extra?.[sid])throw new Error('dropdown value lost');
      const post=(ch)=>fetch('/api/sync',{method:'POST',headers:{'X-HQ':'1','Content-Type':'application/json'},body:JSON.stringify({changes:[ch]})}).then(r=>r.status);
      const bad=[await post({t:'tasks',id:c,f:{extra:{[nid]:{x:1}}}}),await post({t:'projects',id:p.id,f:{fields:[{id:'f 1',name:'x'}]}}),
        await post({t:'projects',id:p.id,f:{fields:[{id:'f1',name:'x',type:'select',opts:[{id:'o1',name:'A',color:'red'}]}]}}),await post({t:'projects',id:p.id,f:{fields:[{id:'f1',name:'x',type:'select'}]}})];
      if(bad.some(s=>s!==400))throw new Error('junk saved '+bad);return 'kept, junk refused'`);
  });
  await step('own columns: delete clears the column and its values', () => js(`const nid=window.__fields[1];const p=D.projects.find(x=>fieldsOf(x).some(f=>f.id===nid));S.projectId=p.id;S.tab='list';go('project');
    ACT.menu({dataset:{id:'cols'}});document.querySelector('[data-act="fieldAsk"][data-f="'+nid+'"]').click();document.querySelector('[data-act="fieldDel"]').click();
    if(fieldsOf(p).length!==2||D.tasks.some(t=>t.extra&&nid in t.extra))throw new Error('not cleared');S.menu=null;${settle}renderMain();return 'ok'`));
  await shot('desktop-project-own-column-kept', 1440, 900);
  await step('own columns: the Add a column window', () => js(`ACT.fieldNew();return document.querySelectorAll('.ftype').length+' types'`));
  await shot('desktop-add-column-types', 1440, 900);
  await step('own columns: dropdown options', () => js(`document.querySelector('.ftype[data-t="select"]').click();return document.querySelectorAll('.fopt').length+' options'`));
  await shot('desktop-add-column-dropdown', 1440, 900);
  await step('own columns: close the window', () => js(`ACT.closeModal();S.fdraft=null;return 'ok'`));
  await step('custom order: drag handles move tasks, and sorting hides them', () => js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.sort={k:'order',dir:1};go('project');
    const rows=()=>[...document.querySelectorAll('section[data-sec="todo"] .lrow[data-row][data-par=""]')].map(r=>r.dataset.row);let ids=rows();
    if(ids.length<2){for(const x of ['Order A','Order B'])newTask({project:S.projectId,title:x,owner:null});renderMain();ids=rows()}
    if(!document.querySelector('.grip'))throw new Error('no handles');
    const last=ids[ids.length-1];moveTask(last,ids[0],false,'todo');if(rows()[0]!==last)throw new Error('not moved to top');
    const g=document.querySelector('.grip[data-grip="'+last+'"]');g.focus();g.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));if(rows()[1]!==last)throw new Error('arrow key did not move it');
    const doing=D.tasks.find(x=>x.id===ids[0]);moveTask(doing.id,null,true,'doing');if(doing.status!=='doing')throw new Error('status unchanged');
    ${settle}window.__order=rows();ACT.sortBy({dataset:{k:'due'}});if(document.querySelector('.lrow .grip:not(.off)'))throw new Error('handles live while sorted');if(!document.querySelector('.fchip'))throw new Error('no sort chip');
    document.querySelector('.fchip button').click();if(S.sort.k!=='order')throw new Error('chip did not go back');return 'ok'`));
  await step('custom order: the server keeps it', async () => {
    const want = await js(`return JSON.stringify(window.__order)`);
    await send('Page.reload'); await wait(2500);
    const got = await js(`for(let i=0;i<20&&!D;i++)await new Promise(r=>setTimeout(r,200));S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.sort={k:'order',dir:1};go('project');return JSON.stringify([...document.querySelectorAll('section[data-sec="todo"] .lrow[data-row][data-par=""]')].map(r=>r.dataset.row))`);
    if (want !== got) throw new Error(want + ' vs ' + got);
    return 'same order';
  });
  await step('project order: dots move projects in the menu and on the Projects page', () => js(`go('projects');
    const nav=()=>[...document.querySelectorAll('[data-plist="nav"] [data-pdrag]')].map(r=>r.dataset.pdrag);const page=()=>[...document.querySelectorAll('[data-plist="main"] [data-pdrag]')].map(r=>r.dataset.pdrag);
    if(nav().length<3){for(const n of ['Order X','Order Y','Order Z'])D.projects.push({id:uid('p'),name:n,owner:ME,due:null,archived:0,desc:'',createdAt:TODAY,visibility:'everyone',createdBy:ME,sort:Math.max(0,...D.projects.map(x=>x.sort||0))+1024});go('projects')}
    const ids=nav();if(!document.querySelector('.pcard .pgrip'))throw new Error('no dots on the cards');if(JSON.stringify(page())!==JSON.stringify(ids))throw new Error('menu and page disagree');
    const last=ids[ids.length-1];moveProject(last,ids[0],false);if(nav()[0]!==last||page()[0]!==last)throw new Error('not first');
    const g=document.querySelector('[data-plist="nav"] [data-pgrip="'+last+'"]');g.focus();g.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));if(nav()[1]!==last)throw new Error('arrow key did not move it');if(document.activeElement?.dataset.pgrip!==last)throw new Error('focus lost');
    document.querySelector('.pcard .pgrip').click();if(S.view!=='projects')throw new Error('clicking the dots opened the project');
    const cards=()=>[...document.querySelectorAll('[data-plist="main"] [data-pdrag]')];const src=cards()[0],dst=cards()[2],id=src.dataset.pdrag;
    src.querySelector('.pgrip').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));if(!src.draggable)throw new Error('dots did not arm the drag');
    const dt=new DataTransfer();src.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));const b=dst.getBoundingClientRect();const at={bubbles:true,cancelable:true,dataTransfer:dt,clientX:b.right-5,clientY:b.bottom-5};
    dst.dispatchEvent(new DragEvent('dragover',at));if(!dst.matches('.drop-right,.drop-after'))throw new Error('no drop marker');dst.dispatchEvent(new DragEvent('drop',at));src.dispatchEvent(new DragEvent('dragend',{bubbles:true}));
    if(page().indexOf(id)!==2)throw new Error('drag did not move it: '+page().indexOf(id));
    ${settle}window.__porder=nav();return nav().length+' projects'`));
  await step('project order: the server keeps it', async () => {
    const want = await js(`return JSON.stringify(window.__porder)`);
    await send('Page.reload'); await wait(2500);
    const got = await js(`for(let i=0;i<20&&!D;i++)await new Promise(r=>setTimeout(r,200));go('projects');return JSON.stringify([...document.querySelectorAll('[data-plist="nav"] [data-pdrag]')].map(r=>r.dataset.pdrag))`);
    if (want !== got) throw new Error(want + ' vs ' + got);
    return 'same order';
  });
  await shot('desktop-projects-order', 1440, 900);
  await step('sections: group the list by a dropdown, drag between sections, add into the first', () => js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.pgroup='status';S.sort={k:'order',dir:1};go('project');
    const typ=(sel,v)=>{const el=document.querySelector(sel);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))};
    ACT.fieldNew();document.querySelector('.ftype[data-t="select"]').click();typ('.modal input[name="name"]','Section');
    ['IDS',"To Do's",'Parking Lot'].forEach((o,i)=>{if(i>=2)document.querySelector('[data-act="optAdd"]').click();typ('.fopt:nth-child('+(i+1)+') .fin',o)});document.querySelector('form[data-form="field"]').requestSubmit();
    const f=fieldsOf(proj(S.projectId)).find(x=>x.name==='Section');if(!f)throw new Error('no Section column');
    renderMain();const sel=document.querySelector('.vopts select[data-change="pgroup"]');if(![...sel.options].some(o=>o.value==='f:'+f.id))throw new Error('Section not in the group menu');
    sel.value='f:'+f.id;sel.dispatchEvent(new Event('change',{bubbles:true}));
    for(const o of f.opts)if(!document.querySelector('section[data-sec="'+o.id+'"]'))throw new Error('no section for '+o.name);
    if(!document.querySelector('.fchip')?.textContent.includes('Section'))throw new Error('no group chip');
    const a=document.getElementById('add-task');a.value='New IDS item';a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const n=D.tasks.find(x=>x.title==='New IDS item');if(n.extra?.[f.id]!==f.opts[0].id)throw new Error('new task not in the first section');
    moveTask(n.id,null,true,f.opts[2].id);if(n.extra?.[f.id]!==f.opts[2].id)throw new Error('drag did not change the section');
    if(!document.querySelector('section[data-sec="'+f.opts[2].id+'"] .lrow[data-row="'+n.id+'"]'))throw new Error('not shown in its new section');
    const a3=document.getElementById('add-task-'+f.opts[2].id);if(!a3)throw new Error('no add row in the third section');a3.value='Parked item';a3.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    if(D.tasks.find(x=>x.title==='Parked item')?.extra?.[f.id]!==f.opts[2].id)throw new Error('add row did not use its section');
    setStatus(n,'done');renderMain();if(document.querySelector('.lrow[data-row="'+n.id+'"]'))throw new Error('finished task still shows in sections');
    S.pdone=true;renderMain();if(!document.querySelector('.lrow[data-row="'+n.id+'"]'))throw new Error('show finished did not work');S.pdone=false;setStatus(n,'todo');
    ACT.fold({dataset:{k:f.opts[0].id}});if(document.querySelector('section[data-sec="'+f.opts[0].id+'"] .lrow'))throw new Error('fold did not hide the rows');ACT.fold({dataset:{k:f.opts[0].id}});
    const ren=v=>{const el=document.querySelector('section[data-sec="'+f.opts[0].id+'"] .secname');el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));return fieldsOf(proj(S.projectId)).find(x=>x.id===f.id).opts[0].name};
    if(ren('Issues to solve')!=='Issues to solve')throw new Error('rename did not save');if(ren('   ')!=='Issues to solve')throw new Error('an empty name replaced the old one');if(ren('IDS')!=='IDS')throw new Error('rename back failed');
    S.tab='board';renderMain();const cols=[...document.querySelectorAll('.col[data-drop]')].map(c=>c.dataset.drop);if(f.opts.some(o=>!cols.includes(o.id)))throw new Error('board columns are not the sections: '+cols);
    ACT.addCard({dataset:{g:f.opts[1].id}});ACT.closeDrawer?.();ACT.secAdd();if(S.modal!=='field'||S.fdraft.id!==f.id||S.fdraft.opts.length!==4)throw new Error('Add section did not open the Section column with a new option');ACT.closeModal();if(D.tasks.at(-1).extra?.[f.id]!==f.opts[1].id)throw new Error('board add did not use its column');
    const pid=S.projectId;S.pgroup='status';ACT.openProject({dataset:{id:D.projects.find(x=>x.id!==pid&&!x.archived).id}});ACT.openProject({dataset:{id:pid}});if(S.pgroup!=='f:'+f.id)throw new Error('grouping not remembered');
    ${settle}return 'ok'`));
  await shot('desktop-board-sections', 1440, 900);
  await js(`S.tab='list';renderMain();return 1`);
  await shot('desktop-project-sections', 1440, 900);
  await step('sections: back to status', () => js(`S.pgroup='status';renderMain();return 'ok'`));
  await step('comments: write, edit and delete on a task', () => js(`const t=D.tasks.find(x=>x.project===S.projectId&&!x.parent);openDrawer('task',t.id);
    const box=document.getElementById('c-new');if(!box)throw new Error('no comment box');box.value='Can we share these on social?\\nhttps://example.com/x';box.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-act="cPost"]').click();const c=D.comments.find(x=>x.task===t.id);if(!c||c.by!==ME)throw new Error('not posted');
    if(!document.querySelector('.cm-body a[href="https://example.com/x"]'))throw new Error('link not clickable');${settle}
    ACT.cEdit({dataset:{id:c.id}});const ed=document.getElementById('c-edit');ed.value='Can we share these on Instagram?';document.querySelector('[data-act="cSave"]').click();
    if(c.body!=='Can we share these on Instagram?'||!c.edited)throw new Error('not edited');${settle}
    renderMain();if(!document.querySelector('.lrow[data-row="'+t.id+'"] .subn[title="1 comment"]'))throw new Error('no count on the row');
    const box2=document.getElementById('c-new');box2.value='Second one';box2.dispatchEvent(new Event('input',{bubbles:true}));box2.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true}));
    if(D.comments.filter(x=>x.task===t.id).length!==2)throw new Error('cmd+enter did not post');${settle}window.__ctask=t.id;return 'ok'`));
  await shot('desktop-task-comments', 1440, 900);
  await step('comments: the server keeps them after a real reload', async () => {
    const id = await js(`return window.__ctask`);
    await send('Page.reload'); await wait(2500);
    return js(`for(let i=0;i<20&&!D;i++)await new Promise(r=>setTimeout(r,200));const cs=D.comments.filter(x=>x.task==='${id}');if(cs.length!==2)throw new Error(cs.length+' comments');
      ACT.cAsk({dataset:{id:cs[1].id}});ACT.cDel({dataset:{id:cs[1].id}});${settle}return 'kept, one deleted'`);
  });
  await step('everything survived a reload', async () => {
    const before = await js(`return JSON.stringify(TABLES.map(t=>[t,D[t].length]))`);
    await nav('/#mytasks');
    const after = await js(`await new Promise(r=>setTimeout(r,800));return JSON.stringify(TABLES.map(t=>[t,D[t].length]))`);
    if (before !== after) throw new Error(before + ' vs ' + after);
    return 'same counts';
  });
  await step('history shows the closed quarter, year and meeting', () => js(`go('history');return document.querySelectorAll('.qcard').length+' cards, '+document.querySelectorAll('tr[data-act]').length+' meetings'`));
  await shot('desktop-history', 1440, 1000);
  // Phone checks: no sideways scrolling on any screen.
  for (const v of ['mytasks', 'projects', 'project', 'vision', 'plan', 'rocks', 'scorecard', 'issues', 'meeting', 'history', 'team']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await step('phone: ' + v + ' fits the screen', () => js(`if('${v}'==='project')S.projectId=D.projects[0].id;go('${v}');await new Promise(r=>setTimeout(r,100));const w=document.documentElement.scrollWidth,m=document.getElementById('main').scrollWidth;if(w>390||m>390)throw new Error('wider: '+w+'/'+m);return 'ok'`));
  }
  await js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';go('project');S.menu=D.tasks.find(x=>x.project===S.projectId&&!x.parent).id;renderMain();return 1`);
  await shot('desktop-task-menu', 1440, 900);
  await js(`S.menu=null;renderMain();return 1`);
  await step('view options: the who filter shows as a chip that clears', () => js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';go('project');
    const who=D.people.find(x=>x.id!==ME).id;const sel=document.querySelector('.vopts select[data-change="pwho"]');sel.value=who;sel.dispatchEvent(new Event('change',{bubbles:true}));
    const chip=document.querySelector('.fchip');if(!chip||!chip.textContent.includes('Only'))throw new Error('no chip');chip.querySelector('button').click();if(document.querySelector('.fchip')||S.pwho!=='all')throw new Error('not cleared');return 'ok'`));
  await js(`S.projectId=D.projects.find(x=>!x.archived).id;S.tab='list';S.vopts=true;go('project');return 1`);
  await shot('desktop-project-toolbar', 1440, 900);
  await js(`S.vopts=false;renderMain();return 1`);
  await step('phone: task panel', () => js(`go('mytasks');openDrawer('task',D.tasks.find(t=>t.title==='Presale landing page').id);return 'open'`));
  await shot('phone-task', 390, 844, true);
  await step('phone: my tasks', () => js(`ACT.closeDrawer();go('mytasks');return 'ok'`));
  await shot('phone-mytasks', 390, 844, true);
  await step('phone: board', () => js(`S.projectId=D.projects[0].id;S.tab='board';go('project');return 'ok'`));
  await shot('phone-board', 390, 844, true);
  await step('phone: menu', () => js(`S.navOpen=true;renderMain();return 'ok'`));
  await shot('phone-menu', 390, 844, true);
  await step('share panel: open, add, private, owner picker', () => js(`D.people.push({id:uid('u'),name:'Morgan',email:null,seat:'',role:'Member',active:1,inactiveOn:null,color:'#171717',createdAt:TODAY});${settle}S.projectId=D.projects.find(x=>isPrivate(x)).id;go('project');ACT.modal({dataset:{k:'share'}});
    if(!document.querySelector('form[data-form="share"] .vis-opt.on input[value="members"]'))throw new Error('not shown as private');
    const p=proj(S.projectId);const out=activePeople().filter(x=>!memberOf(p.id,x.id));const sel=document.getElementById('mem-who');if(!sel)throw new Error('no add picker');
    const before=membersOf(p.id).length;document.querySelector('[data-act="pAdd"]').click();if(membersOf(p.id).length!==before+1)throw new Error('not added');${settle}
    const t=D.tasks.find(x=>x.project===p.id&&!x.parent);const opts=[...document.querySelectorAll('.own-in[data-id="'+t.id+'"] option')].map(o=>o.value);
    if(opts.some(v=>v&&!v.startsWith('add:')&&!canSeeP(p,v)))throw new Error('owner picker offers outsiders');return membersOf(p.id).length+' on it'`));
  await shot('desktop-share', 1440, 900);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await shot('phone-share', 390, 844, true);
  await step('share panel: last manager can’t be removed by a member rule, removing someone frees their tasks', () => js(`const p=proj(S.projectId);const m=membersOf(p.id).find(x=>x.person!==ME&&x.person!==p.owner);
    const t=newTask({project:p.id,title:'Task for someone leaving',owner:m.person});${settle}document.querySelector('[data-act="pRemove"][data-id="'+m.id+'"]').click();
    if(memberOf(p.id,m.person))throw new Error('still on it');if(task(t.id).owner)throw new Error('still owns the task');${settle}ACT.closeModal();return 'removed, task unassigned'`));
  await step('admin hides the Scorecard', () => js(`go('team');const cb=document.querySelector('input[data-change="hideArea"][data-a="scorecard"]');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));${settle}
    go('scorecard');if(!document.querySelector('.hidden-note'))throw new Error('no admin note');if(!document.querySelector('[data-v="scorecard"]'))throw new Error('admin lost the menu item');return 'hidden'`));
  await shot('desktop-hidden-admin', 1440, 900);
  await step('sign-out changes fold into the working copy and save one row at a time', () => js(`const k=outboxKey(ME);const t=D.tasks.find(x=>!x.parent&&x.status!=='done');
    localStorage.setItem(k,JSON.stringify({at:Date.now(),changes:[{t:'tasks',id:t.id,f:{title:'Edited before sign-out'}},{t:'tasks',id:'t_ob',ins:true,f:{title:'Added before sign-out',status:'todo',project:null,parent:null,owner:null}},{t:'scores',id:'bad id with spaces',ins:true,f:{value:1}}]}));
    applyOutbox();if(!localStorage.getItem(k))throw new Error('cleared before the server took it');if(task(t.id).title!=='Edited before sign-out'||!task('t_ob'))throw new Error('not applied');
    D.scores=D.scores.filter(x=>x.id!=='bad id with spaces');${settle}lastServer='';await refresh(true);if(task(t.id).title!=='Edited before sign-out'||!task('t_ob'))throw new Error('not saved');if(localStorage.getItem(k))throw new Error('kept after saving');return 'applied, saved, cleared'`));
  await step('a refusal undoes only what it refused, not what was typed after saving', () => js(`const t=D.tasks.find(x=>!x.parent&&x.status!=='done');const was=t.status;t.status='banana';const p=commit();t.title='Typed while saving';await p;await new Promise(r=>setTimeout(r,200));
    if(task(t.id).status!==was)throw new Error('refused value kept');if(task(t.id).title!=='Typed while saving')throw new Error('newer edit lost');${settle}lastServer='';await refresh(true);if(task(t.id).title!=='Typed while saving')throw new Error('newer edit not saved');return 'kept'`));
  await step('waiting changes merge to one per row', () => js(`const m=mergeChanges([{t:'tasks',id:'a',ins:true,f:{title:'x'}},{t:'tasks',id:'a',f:{due:'2026-11-01'}},{t:'tasks',id:'b',ins:true,f:{}},{t:'tasks',id:'b',del:true},{t:'tasks',id:'c',f:{title:'y'}},{t:'tasks',id:'c',del:true}]);
    if(m.length!==2||!m[0].ins||m[0].f.title!=='x'||m[0].f.due!=='2026-11-01'||!m[1].del)throw new Error(JSON.stringify(m));return 'merged'`));
  await step('signed-out page', () => js(`await ACT.signout();return document.querySelector('.signin')?'signin':'?'`));
  await shot('phone-signin', 390, 844, true);
  await step('a member sees only what they may', () => js(`const f=document.querySelector('form[data-auth="dev"]');f.email.value='kim@example.com';f.requestSubmit();await new Promise(r=>setTimeout(r,1500));
    if(!D||isAdmin())throw new Error('not signed in as a member');if(document.querySelector('[data-v="scorecard"]'))throw new Error('Scorecard still in the menu');
    if(D.metrics.length||D.scores.length)throw new Error('Scorecard data was sent');if(D.projects.some(x=>isPrivate(x)&&!memberOf(x.id,ME)))throw new Error('got a private project');
    go('scorecard');if(!document.querySelector('.page .note'))throw new Error('no hidden note');${settle}return D.projects.length+' projects visible'`));
  await shot('phone-hidden-member', 390, 844, true);
  await step('member signs out', () => js(`await ACT.signout();return 'ok'`));
} finally {
  ws?.close();
  chrome.kill();
}

// Admin rules, straight against the API as a member.
const r = await fetch(BASE + '/auth/dev', { method: 'POST', headers: { 'X-HQ': '1', 'Content-Type': 'application/json' }, body: '{"email":"jess@example.com"}' });
const cookie = r.headers.get('set-cookie').split(';')[0];
const sync = (changes) => fetch(BASE + '/api/sync', { method: 'POST', headers: { 'X-HQ': '1', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ changes }) });
const deny = async (name, changes) => { const x = await sync(changes); results.push([x.status === 403 ? 'ok' : 'FAIL', 'member blocked: ' + name, x.status + ' ' + (await x.text()).slice(0, 80)]); };
await deny('closing a quarter', [{ t: 'quarters', id: '2099-Q1', ins: true, f: { closedOn: '2099-01-01', by: 'x', corrections: [] } }]);
await deny('making themselves admin', [{ t: 'people', id: 'nope', f: { role: 'Admin' } }]);
await deny('deleting a meeting', [{ t: 'meetings', id: 'x', del: true }]);
const proj = await sync([{ t: 'projects', id: 'p_member', ins: true, f: { name: 'Member project', owner: null, due: null, archived: 0, desc: '', createdAt: '2026-10-27' } }]);
results.push([proj.ok ? 'ok' : 'FAIL', 'member can create a project', proj.status]);
const all = await (await fetch(BASE + '/api/data', { headers: { 'X-HQ': '1', Cookie: cookie } })).json();
const closedRock = all.data.rocks.find((r) => all.data.quarters.some((q) => q.id === r.q));
if (closedRock) await deny('changing a closed-quarter Rock through a fake insert', [{ t: 'rocks', id: closedRock.id, ins: true, f: { status: closedRock.status === 'off' ? 'on' : 'off' } }]);
else results.push(['FAIL', 'no closed-quarter Rock to test with', '']);
if (closedRock) {
  const both = await sync([{ t: 'rocks', id: closedRock.id, del: true, ins: true }]);
  results.push([both.status === 400 ? 'ok' : 'FAIL', 'a delete marked as new is refused', both.status]);
  await deny('deleting a closed-quarter Rock', [{ t: 'rocks', id: closedRock.id, del: true }]);
}
const sv = await sync([{ t: 'scores', id: 'm_x|2026-10-25', ins: true, f: { metric: 'm_x', week: '2026-10-25', value: '"><select data-change=role>' } }]);
results.push([sv.status === 400 ? 'ok' : 'FAIL', 'a scorecard number that isn’t a number is refused', sv.status]);
const badId = await sync([{ t: 'tasks', id: 't"><b>', ins: true, f: { title: 'x' } }]);
results.push([badId.status === 400 ? 'ok' : 'FAIL', 'an id with markup is refused', badId.status]);
const vis = await sync([{ t: 'vto', id: 'main', f: { data: { values: 'not a list' } } }]);
results.push([vis.status === 400 ? 'ok' : 'FAIL', 'a broken Vision is refused', vis.status]);
const mt = all.data.meetings[0];
await sync([{ t: 'meetings', id: mt.id, ins: true, f: { date: '1999-01-01', avg: 1 } }]);
const mt2 = (await (await fetch(BASE + '/api/data', { headers: { 'X-HQ': '1', Cookie: cookie } })).json()).data.meetings.find((m) => m.id === mt.id);
results.push([mt2.date === mt.date ? 'ok' : 'FAIL', 'a saved meeting can’t be rewritten through a fake insert', mt2.date]);
const enumBad = await sync([{ t: 'tasks', id: 't_enum', ins: true, f: { title: 'x', status: 'banana' } }]);
results.push([enumBad.status === 400 ? 'ok' : 'FAIL', 'an unknown status is refused', enumBad.status]);
const goalsBad = await sync([{ t: 'metrics', id: 'm_bad', ins: true, f: { name: 'x', goals: {} } }]);
results.push([goalsBad.status === 400 ? 'ok' : 'FAIL', 'a malformed scorecard goal is refused', goalsBad.status]);
const colorBad = await sync([{ t: 'people', id: (await (await fetch(BASE + '/api/me', { headers: { 'X-HQ': '1', Cookie: cookie } })).json()).me.id, f: { color: 'red;background:url(x)' } }]);
results.push([colorBad.status === 400 ? 'ok' : 'FAIL', 'a color that isn’t a color is refused', colorBad.status]);
const ok = await sync([{ t: 'tasks', id: 't_member_test', ins: true, f: { title: 'Member can add a task', status: 'todo' } }]);
results.push([ok.ok ? 'ok' : 'FAIL', 'member can add a task', ok.status]);
const bad = await sync([{ t: 'tasks', id: 't2', ins: true, f: { secret: 1 } }]);
results.push([bad.status === 400 ? 'ok' : 'FAIL', 'unknown field refused', bad.status]);

// Private projects and hidden pages, straight against the API.
const login = async (email) => (await fetch(BASE + '/auth/dev', { method: 'POST', headers: { 'X-HQ': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).headers.get('set-cookie').split(';')[0];
const as = (ck) => ({
  sync: (changes) => fetch(BASE + '/api/sync', { method: 'POST', headers: { 'X-HQ': '1', 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ changes }) }),
  data: async () => (await fetch(BASE + '/api/data', { headers: { 'X-HQ': '1', Cookie: ck } })).json(),
  me: async () => (await (await fetch(BASE + '/api/me', { headers: { 'X-HQ': '1', Cookie: ck } })).json()).me.id,
});
// Only true or false counts: anything else (a name passed first by mistake) would always look like a pass.
const check = (ok, name, v = '') => { if (typeof ok !== 'boolean') throw new Error('check() needs true or false first: ' + name); results.push([ok ? 'ok' : 'FAIL', name, v]); };
const expect = async (who, status, name, changes) => { const x = await who.sync(changes); check(x.status === status, name, x.status + ' ' + (await x.text()).slice(0, 90)); };
const jess = as(cookie), kim = as(await login('kim@example.com')), boss = as(await login('paige@example.com'));
const jessId = await jess.me(), kimId = await kim.me();
const rockId = all.data.rocks.find((r) => !all.data.quarters.some((q) => q.id === r.q))?.id;
await expect(kim, 403, 'someone else can’t archive a project they don’t manage', [{ t: 'projects', id: 'p_member', f: { archived: 1 } }]);
await expect(jess, 200, 'a member makes a private project with a task', [
  { t: 'projects', id: 'p_secret', ins: true, f: { name: 'Secret plan', owner: jessId, archived: 0, desc: '', createdAt: '2026-10-28', visibility: 'members' } },
  { t: 'tasks', id: 't_secret', ins: true, f: { project: 'p_secret', title: 'Secret task', owner: jessId, status: 'todo', rock: rockId || null } },
  { t: 'tasks', id: 't_secret_sub', ins: true, f: { project: 'p_secret', parent: 't_secret', title: 'Secret subtask', status: 'todo' } },
]);
let kd = await kim.data();
check(!kd.data.projects.some((p) => p.id === 'p_secret') && !kd.data.tasks.some((t) => t.id.startsWith('t_secret')) && !kd.data.projectMembers.some((m) => m.project === 'p_secret'), 'an outsider never receives a private project, its tasks or subtasks');
if (rockId) check(kd.hidden.ms[rockId]?.total === 1 && !JSON.stringify(kd.hidden).includes('Secret'), 'an outsider gets the Rock’s private milestone as a count only', JSON.stringify(kd.hidden.ms[rockId]));
await expect(kim, 403, 'an outsider can’t change a private task', [{ t: 'tasks', id: 't_secret', f: { title: 'hacked' } }]);
await expect(kim, 403, 'an outsider can’t delete a private task', [{ t: 'tasks', id: 't_secret', del: true }]);
await expect(kim, 403, 'an outsider can’t add a task to a private project', [{ t: 'tasks', id: 't_sneak', ins: true, f: { project: 'p_secret', title: 'x', status: 'todo' } }]);
await expect(kim, 403, 'an outsider can’t hang a subtask under a private task', [{ t: 'tasks', id: 't_sneak2', ins: true, f: { parent: 't_secret', title: 'x', status: 'todo' } }]);
// Comments follow their task: hidden with it, and only their writer can change them.
await expect(jess, 200, 'the maker comments on her private task', [{ t: 'comments', id: 'c_secret', ins: true, f: { task: 't_secret', by: jessId, body: 'Only for us', at: '2026-10-29T10:00:00Z' } }]);
kd = await kim.data();
check(!kd.data.comments.some((c) => c.id === 'c_secret'), 'an outsider never receives comments on a private task');
await expect(kim, 403, 'an outsider can’t comment on a private task', [{ t: 'comments', id: 'c_sneak', ins: true, f: { task: 't_secret', by: kimId, body: 'hi', at: '2026-10-29T10:00:00Z' } }]);
await expect(kim, 403, 'an outsider can’t edit a comment on a private task', [{ t: 'comments', id: 'c_secret', f: { body: 'changed' } }]);
await expect(kim, 200, 'anyone can comment on an open task', [
  { t: 'tasks', id: 't_open_c', ins: true, f: { title: 'Open task', status: 'todo', project: null, owner: null } },
  { t: 'comments', id: 'c_kim', ins: true, f: { task: 't_open_c', by: kimId, body: 'From Kim', at: '2026-10-29T10:00:00Z' } },
  { t: 'comments', id: 'c_kim2', ins: true, f: { task: 't_open_c', by: kimId, body: 'Also from Kim', at: '2026-10-29T10:01:00Z' } },
]);
await expect(kim, 400, 'a comment can’t be written as someone else', [{ t: 'comments', id: 'c_fake', ins: true, f: { task: 't_open_c', by: jessId, body: 'x', at: '2026-10-29T10:00:00Z' } }]);
await expect(kim, 400, 'an empty comment is refused', [{ t: 'comments', id: 'c_empty', ins: true, f: { task: 't_open_c', by: kimId, body: '  ', at: '2026-10-29T10:00:00Z' } }]);
await expect(jess, 403, 'nobody else can edit your comment', [{ t: 'comments', id: 'c_kim', f: { body: 'changed by Jess' } }]);
await expect(jess, 403, 'a member can’t delete someone else’s comment', [{ t: 'comments', id: 'c_kim', del: true }]);
await expect(kim, 400, 'a comment can’t be moved to another task', [{ t: 'comments', id: 'c_kim', f: { task: 't_secret' } }]);
await expect(boss, 200, 'an admin can delete any comment', [{ t: 'comments', id: 'c_kim', del: true }]);
await expect(kim, 200, 'deleting a task deletes its comments', [{ t: 'tasks', id: 't_open_c', del: true }]);
check(!(await boss.data()).data.comments.some((c) => c.task === 't_open_c'), 'no comment is left behind without its task');
await expect(kim, 403, 'an outsider can’t add themselves to a private project', [{ t: 'projectMembers', id: `p_secret|${kimId}`, ins: true, f: { project: 'p_secret', person: kimId, level: 'manage' } }]);
await expect(kim, 403, 'an outsider can’t rename a private project', [{ t: 'projects', id: 'p_secret', ins: true, f: { name: 'mine now' } }]);
await expect(kim, 403, 'a project’s maker can’t be faked', [{ t: 'projects', id: 'p_fake', ins: true, f: { name: 'x', archived: 0, createdBy: jessId } }]);
await expect(jess, 400, 'a task can’t be handed to someone who isn’t on the project', [{ t: 'tasks', id: 't_secret', f: { owner: kimId } }]);
await expect(jess, 200, 'the manager adds Kim as an editor and hands her the task', [
  { t: 'projectMembers', id: `p_secret|${kimId}`, ins: true, f: { project: 'p_secret', person: kimId, level: 'edit', by: jessId, createdAt: '2026-10-28' } },
  { t: 'tasks', id: 't_secret', f: { owner: kimId } },
]);
kd = await kim.data();
check(kd.data.tasks.some((t) => t.id === 't_secret') && kd.data.tasks.some((t) => t.id === 't_secret_sub'), 'once added, Kim receives the project and its subtasks');
await expect(kim, 200, 'an editor can work in the project', [{ t: 'tasks', id: 't_secret', f: { title: 'Secret task, edited' } }]);
await expect(kim, 403, 'an editor can’t change who sees it', [{ t: 'projects', id: 'p_secret', f: { visibility: 'everyone' } }]);
await expect(kim, 403, 'an editor can’t make themselves a manager', [{ t: 'projectMembers', id: `p_secret|${kimId}`, f: { level: 'manage' } }]);
await expect(jess, 403, 'the last manager can’t leave', [{ t: 'projectMembers', id: `p_secret|${jessId}`, del: true }]);
await expect(jess, 200, 'the manager removes Kim', [{ t: 'projectMembers', id: `p_secret|${kimId}`, del: true }]);
const jd = await jess.data();
check(jd.data.tasks.find((t) => t.id === 't_secret')?.owner === null, 'Kim’s open task went back to unassigned', String(jd.data.tasks.find((t) => t.id === 't_secret')?.owner));
check(!(await kim.data()).data.tasks.some((t) => t.id === 't_secret'), 'after removal Kim no longer receives it');
await expect(jess, 200, 'the manager opens it to everyone', [{ t: 'projects', id: 'p_secret', f: { visibility: 'everyone' } }]);
check((await kim.data()).data.projects.some((p) => p.id === 'p_secret'), 'an open project reaches everyone');
await expect(kim, 200, 'anyone can take a task in an open project', [{ t: 'tasks', id: 't_secret', f: { owner: kimId } }]);
await expect(jess, 200, 'the manager makes it private again', [{ t: 'projects', id: 'p_secret', f: { visibility: 'members' } }]);
check((await jess.data()).data.tasks.find((t) => t.id === 't_secret')?.owner === null, 'going private frees tasks held by people not on it');
const bd = await boss.data();
check(bd.data.projects.some((p) => p.id === 'p_secret') && bd.data.tasks.some((t) => t.id === 't_secret'), 'an admin sees every private project');
await expect(boss, 200, 'an admin can manage any project', [{ t: 'projects', id: 'p_secret', f: { archived: 1 } }]);
await boss.sync([{ t: 'projects', id: 'p_secret', f: { archived: 0 } }]);
// Hidden EOS pages and admin-only Vision versions.
await expect(kim, 403, 'a member can’t hide EOS pages', [{ t: 'settings', id: 'hidden', ins: true, f: { value: '' } }]);
await expect(boss, 400, 'only real EOS pages can be hidden', [{ t: 'settings', id: 'hidden', ins: true, f: { value: 'vision,secrets' } }]);
await expect(boss, 200, 'an admin hides the Vision and the Scorecard', [{ t: 'settings', id: 'hidden', ins: true, f: { value: 'vision,scorecard' } }]);
kd = await kim.data();
check(!kd.data.vto.length && !kd.data.vtoVersions.length && !kd.data.metrics.length && !kd.data.scores.length && kd.data.rocks.length > 0, 'a member receives none of a hidden page, and the rest as usual');
await expect(kim, 403, 'a member can’t change a hidden Vision', [{ t: 'vto', id: 'main', ins: true, f: { data: { values: [] }, by: kimId, date: '2026-10-28' } }]);
await expect(kim, 403, 'a member can’t add a number to a hidden Scorecard', [{ t: 'scores', id: 'm_x|2026-10-25', ins: true, f: { metric: 'm_x', week: '2026-10-25', value: 3 } }]);
check((await boss.data()).data.vto.length === 1, 'admins still receive hidden pages');
await expect(boss, 200, 'the admin shows the Vision again', [{ t: 'settings', id: 'hidden', f: { value: 'scorecard' } }]);
const snap = (await boss.data()).data.vto[0].data;
await expect(kim, 403, 'a member can’t save an admins-only version', [{ t: 'vtoVersions', id: 'v_kim', ins: true, f: { date: '2026-10-28', by: kimId, label: 'x', snap, audience: 'admins' } }]);
await expect(boss, 200, 'an admin saves an admins-only version', [{ t: 'vtoVersions', id: 'v_draft', ins: true, f: { date: '2026-10-28', by: 'x', label: 'Draft', snap, audience: 'admins' } }]);
kd = await kim.data();
check(kd.data.vto.length === 1 && !kd.data.vtoVersions.some((v) => v.id === 'v_draft'), 'members get the Vision back, but never the admins-only version');
check((await boss.data()).data.vtoVersions.some((v) => v.id === 'v_draft'), 'admins see the admins-only version');
// Codex review fixes (2026-10-28), one check per finding.
await expect(boss, 200, 'a meeting record with a private to-do and a solved issue', [{ t: 'meetings', id: 'mt_codex', ins: true, f: { date: '2026-10-28', avg: 9, ratings: {}, headlines: [], cascades: [],
  todos: [{ id: 't_secret', title: 'Secret task, edited', owner: null }, { title: 'Secret task, edited', owner: null }, { id: 't_member_test', title: 'Public to-do', owner: null }], solved: [{ id: 'i_x', title: 'Hidden decision', decision: 'Confidential' }] } }]);
await boss.sync([{ t: 'settings', id: 'hidden', f: { value: 'issues' } }]);
const km = (await kim.data()).data.meetings.find((m) => m.id === 'mt_codex');
check(!!km && km.todos.length === 1 && km.todos[0].title === 'Public to-do' && !km.solved.length, 'meeting records don’t carry private to-dos or hidden issues to members', JSON.stringify(km?.todos));
await boss.sync([{ t: 'settings', id: 'hidden', f: { value: '' } }]);
await expect(jess, 400, 'a subtask can’t have subtasks of its own', [{ t: 'tasks', id: 't_nest', ins: true, f: { parent: 't_secret_sub', project: null, title: 'x', status: 'todo' } }]);
await expect(jess, 400, 'a task can’t be its own subtask', [{ t: 'tasks', id: 't_secret_sub', f: { parent: 't_secret_sub' } }]);
await expect(jess, 400, 'a task with subtasks can’t become a subtask', [{ t: 'tasks', id: 't_free', ins: true, f: { project: 'p_secret', parent: null, title: 'Top', status: 'todo' } }, { t: 'tasks', id: 't_secret', f: { parent: 't_free' } }]);
await expect(jess, 400, 'an update can’t invent a manager to get round the last-manager rule', [{ t: 'projectMembers', id: `p_secret|${kimId}`, f: { level: 'manage' } }, { t: 'projectMembers', id: `p_secret|${jessId}`, del: true }]);
await expect(jess, 200, 'a retried project save with the same maker goes through', [{ t: 'projects', id: 'p_secret', ins: true, f: { name: 'Secret plan', createdBy: jessId, visibility: 'members' } }]);
await expect(jess, 200, 'a retried member save goes through', [{ t: 'projectMembers', id: `p_secret|${jessId}`, ins: true, f: { project: 'p_secret', person: jessId, level: 'manage' } }]);
await expect(boss, 200, 'an admin makes Kim an admin', [{ t: 'people', id: kimId, f: { role: 'Admin' } }]);
await expect(boss, 200, 'and hands her a private task she isn’t on the list for', [{ t: 'tasks', id: 't_secret', f: { owner: kimId } }]);
await expect(boss, 200, 'then makes them a member again', [{ t: 'people', id: kimId, f: { role: 'Member' } }]);
check((await jess.data()).data.tasks.find((t) => t.id === 't_secret')?.owner === null, 'a demoted admin lets go of private tasks they can no longer see');
check(!(await kim.data()).data.tasks.some((t) => t.id === 't_secret'), '…and doesn’t receive them any more');
await expect(jess, 200, 'deleting a task deletes its subtasks with it', [{ t: 'tasks', id: 't_secret', del: true }]);
check(!(await boss.data()).data.tasks.some((t) => t.id === 't_secret_sub'), 'no subtask is left behind without its parent’s privacy');
// Codex review round 2 (2026-10-28).
await expect(jess, 200, 'a private task for the meeting-record checks', [{ t: 'tasks', id: 't_snap', ins: true, f: { project: 'p_secret', parent: null, title: 'Snap secret', status: 'todo' } }]);
await expect(boss, 200, 'a meeting record naming it three ways', [{ t: 'meetings', id: 'mt_snap', ins: true, f: { date: '2026-10-28', avg: 9, ratings: {}, headlines: [], cascades: [], solved: [],
  todos: [{ id: 't_snap', title: 'Snap secret', owner: null, project: 'p_secret' }, { id: 't_snap', title: 'Snap secret', owner: null }, { title: 'Snap secret', owner: null }] } }]);
await expect(jess, 200, 'the private task is renamed', [{ t: 'tasks', id: 't_snap', f: { title: 'Renamed secret' } }]);
const snapTodos = async () => (await kim.data()).data.meetings.find((m) => m.id === 'mt_snap')?.todos;
check((await snapTodos())?.length === 0, 'renaming a private task doesn’t surface it in an old meeting', JSON.stringify(await snapTodos()));
await expect(jess, 200, 'the private task is deleted', [{ t: 'tasks', id: 't_snap', del: true }]);
check((await snapTodos())?.length === 0, 'deleting it doesn’t either', JSON.stringify(await snapTodos()));
await expect(jess, 200, 'a task in an open project', [{ t: 'tasks', id: 't_pub', ins: true, f: { project: 'p_member', parent: null, title: 'Open parent', status: 'todo' } }]);
await expect(jess, 400, 'a subtask can’t sit in a stricter project than its parent', [{ t: 'tasks', id: 't_pub_kid', ins: true, f: { project: 'p_secret', parent: 't_pub', title: 'Private child', status: 'todo' } }]);
await expect(jess, 400, 'a task that moves has to take its subtasks along', [{ t: 'tasks', id: 't_pub_kid2', ins: true, f: { project: 'p_member', parent: 't_pub', title: 'Child', status: 'todo' } }, { t: 'tasks', id: 't_pub', f: { project: 'p_secret' } }]);
await expect(jess, 400, 'a subtask can’t be added under a parent deleted in the same save', [{ t: 'tasks', id: 't_pub', del: true }, { t: 'tasks', id: 't_orphan', ins: true, f: { project: 'p_member', parent: 't_pub', title: 'Orphan', status: 'todo' } }]);
await expect(jess, 400, 'the same row twice in one save is refused (delete, then re-promote)', [{ t: 'projectMembers', id: `p_secret|${jessId}`, del: true }, { t: 'projectMembers', id: `p_secret|${jessId}`, f: { level: 'manage' } }]);
await boss.sync([{ t: 'settings', id: 'hidden', f: { value: '' } }]);

for (const [s, n, v] of results) console.log(`${s === 'ok' ? '✓' : '✗'} ${n}${v !== '' ? '  (' + v + ')' : ''}`);
const fails = results.filter((x) => x[0] !== 'ok').length;
console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
process.exit(fails ? 1 : 0);
