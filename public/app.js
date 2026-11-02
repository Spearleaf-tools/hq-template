// HQ. The app keeps a full copy of the team's data in D. Every handler changes D and re-renders;
// a sync step then works out which rows changed and posts them to /api/sync (one all-or-nothing batch).
// Every 20 seconds, when nobody is mid-edit, it reloads so everyone sees each other's changes.
'use strict';

const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const todayET=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
let TODAY=todayET();
const addDays=(iso,n)=>{const[y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)};
const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const dow=iso=>new Date(iso+'T12:00:00Z').getUTCDay();
function fmt(iso,rel=true){if(!iso)return'';if(rel){if(iso===TODAY)return'Today';if(iso===addDays(TODAY,1))return'Tomorrow';if(iso===addDays(TODAY,-1))return'Yesterday'}const[,m,d]=iso.split('-');return MON[+m-1]+' '+(+d)}
const fmtLong=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-');return MON[+m-1]+' '+(+d)+', '+y};
const longDay=iso=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

const PATHS={
  check:'<path d="M20 6 9 17l-5-5"/>',
  tasks:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  rock:'<path d="M3 20h18L14 7l-4 6-2-3z"/>',
  chart:'<path d="M3 20h18M6 16v-5M11 16V6M16 16v-8"/>',
  alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5.5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  ftext:'<path d="M5 6h14M12 6v13"/>',
  fnum:'<path d="M10 4 8 20M16 4l-2 16M4 9h16M3 15h16"/>',
  fsel:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m9 11 3 3 3-3"/>',
  grip:'<circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
  dots:'<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  pencil:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  caret:'<path d="m9 6 6 6-6 6"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  chat:'<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  sub:'<path d="M6 4v9a3 3 0 0 0 3 3h10"/><path d="m16 13 3 3-3 3"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back:'<path d="m15 6-6 6 6 6"/>',
  play:'<path d="M7 5v14l12-7z" fill="currentColor"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  star:'<path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" fill="currentColor" stroke="none"/>'
};
const I=(n,s=18)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${n==='check'?2.6:1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;
// The company's name and logo come from wrangler.jsonc (COMPANY_NAME, LOGO) through /api/me.
const CO=()=>CONFIG.company||'Your company';
const logo=()=>CONFIG.logo?`<img class="logo" src="${esc(CONFIG.logo)}" alt="${esc(CO())}">`:`<span class="wordmark">${esc(CO())}</span>`;

// ---------------------------------------------------------------------------
// Data, state and lookups
// ---------------------------------------------------------------------------
const TABLES=['people','projects','tasks','comments','rocks','quarters','metrics','scores','issues','meetings','plans','goals','vto','vtoVersions','settings','links','projectMembers'];
// HIDDEN.ms: per Rock, how many of its milestones sit in private projects this person can't open (counts only).
let D=null,S=null,ME=null,CONFIG={},SNAP={},lastFocus=null,lastServer='',HIDDEN={ms:{}};
function initState(){S={view:'mytasks',who:null,projectId:null,tab:'list',pwho:'all',sort:{k:'order',dir:1},pgroup:'status',projTab:'active',open:{},drawer:null,modal:null,marg:null,confirmDel:null,correcting:null,openIssue:null,drafts:{},issuesTab:'weekly',navOpen:false,resetScroll:true,q:'',signinError:'',mt:{running:false,step:0,start:0,stepStart:0,dropped:{},ratings:{},headlines:[],cascades:[],solved:[]}}}
function load(data,hidden){D={};for(const t of TABLES)D[t]=(data[t]||[]).map(r=>r);HIDDEN=hidden||{ms:{}};SNAP=snapOf()}
const snapOf=()=>Object.fromEntries(TABLES.map(t=>[t,new Map(D[t].map(r=>[r.id,JSON.stringify(r)]))]));

const task=id=>D.tasks.find(t=>t.id===id);
const proj=id=>D.projects.find(p=>p.id===id);
// Projects keep one shared order, set by dragging their dots; a project nobody has placed yet goes last, by name.
const projSort=(a,b)=>(a.sort??Infinity)-(b.sort??Infinity)||(a.name||'').localeCompare(b.name||'');
const pgrip=p=>`<button class="grip pgrip" data-act="pgrip" data-pgrip="${p.id}" aria-label="Move “${esc(p.name||'Untitled project')}”: drag it, or use the arrow keys" title="Drag to move">${I('grip',16)}</button>`;
const rock=id=>D.rocks.find(r=>r.id===id);
const issue=id=>D.issues.find(i=>i.id===id);
const person=id=>D.people.find(p=>p.id===id);
const first=id=>person(id)?.name||'No owner';
const isAdmin=()=>person(ME)?.role==='Admin';
// Who sees what. The server only sends what this person may see and refuses the rest; these decide what screens offer.
// A private project is seen by the people on its list and by admins. "manage" can change who's on it; "edit" works in it.
const isPrivate=p=>p?.visibility==='members';
const memberOf=(pid,who)=>D.projectMembers.find(m=>m.project===pid&&m.person===who);
const membersOf=pid=>D.projectMembers.filter(m=>m.project===pid);
const canSeeP=(p,who)=>!p||!isPrivate(p)||person(who)?.role==='Admin'||!!memberOf(p.id,who);
const canManage=p=>!!p&&(isAdmin()||memberOf(p.id,ME)?.level==='manage');
const managersOf=p=>membersOf(p.id).filter(m=>m.level==='manage');
const taskProj=t=>proj(t.project)||proj(task(t.parent)?.project);
function addMember(p,who,level='edit'){const m=memberOf(p.id,who);if(m)return m;const n={id:p.id+'|'+who,project:p.id,person:who,level,by:ME,createdAt:TODAY};D.projectMembers.push(n);return n}
// Open tasks in a private project go back to unassigned when their owner can't see it any more (the server does the same).
const unassignOutsiders=p=>{if(!isPrivate(p))return;D.tasks.forEach(t=>{if(t.status!=='done'&&t.owner&&taskProj(t)?.id===p.id&&!canSeeP(p,t.owner))t.owner=null})};
// EOS pages an admin has hidden from members while they're being worked on.
const AREAS={vision:'Vision',plan:'1-Year Plan',rocks:'Rocks',scorecard:'Scorecard',issues:'Issues',meeting:'Weekly meeting'};
const hiddenList=()=>String(setting('hidden')||'').split(',').filter(a=>AREAS[a]);
const isHidden=a=>!isAdmin()&&hiddenList().includes(a);
const subsOf=id=>D.tasks.filter(t=>t.parent===id);
const isOD=t=>!!t.due&&t.due<TODAY&&t.status!=='done';
const byDue=(a,b)=>(a.due||'9999').localeCompare(b.due||'9999');
const byPri=(a,b)=>(a.priority||9)-(b.priority||9);
const val=id=>document.getElementById(id)?.value||'';
const ST={todo:'To do',doing:'Doing',done:'Done'};
const PRI={1:'High',2:'Medium',3:'Low'};
const RK={on:'On track',off:'Off track',done:'Done',missed:'Not done'};
const RKNOW={on:'On track',off:'Off track',done:'Done'};
const OPS={'>=':'≥','<=':'≤'};
const meets=(v,op,g)=>op==='>='?v>=g:v<=g;
const qOf=iso=>iso.slice(0,4)+'-Q'+Math.ceil(+iso.slice(5,7)/3);
const qLabel=q=>q?q.slice(5)+' '+q.slice(0,4):'';
const qEnd=q=>q.slice(0,4)+'-'+({1:'03-31',2:'06-30',3:'09-30',4:'12-31'})[q.slice(6)];
const nextQ=q=>{const y=+q.slice(0,4),n=+q.slice(6);return n<4?`${y}-Q${n+1}`:`${y+1}-Q1`};
const setting=k=>D.settings.find(s=>s.id===k)?.value;
function setSetting(k,v){const s=D.settings.find(x=>x.id===k);if(s)s.value=v;else D.settings.push({id:k,value:v})}
const curQ=()=>setting('quarter')||qOf(TODAY);
const curRocks=()=>D.rocks.filter(r=>r.q===curQ());
const closedQuarters=()=>[...D.quarters].sort((a,b)=>b.id.localeCompare(a.id));
const isClosedQ=q=>D.quarters.some(x=>x.id===q);
const openPlan=()=>D.plans.filter(p=>p.status==='open').sort((a,b)=>a.year-b.year)[0];
// While the 1-Year Plan is hidden, a member's copy has no plan; pages that mention it get this year, unsaved.
const curPlan=()=>openPlan()||{id:'',year:+TODAY.slice(0,4),status:'open',revenue:'',profit:'',measurables:''};
const goalsOf=year=>D.goals.filter(g=>g.year===year).sort((a,b)=>(a.sort||0)-(b.sort||0));
const findGoal=id=>D.goals.find(g=>g.id===id)||null;
const metricGoals=m=>[...(m.goals||[])].sort((a,b)=>a.from.localeCompare(b.from));
const goalAt=(m,w)=>{const gs=metricGoals(m);return gs.filter(g=>g.from<=w).slice(-1)[0]||gs[0]||{op:'>=',goal:0}};
const milestones=r=>D.tasks.filter(t=>t.rock===r.id);
// Done and total milestones, counting the ones in private projects this person can't open.
const msCount=r=>{const ms=milestones(r);const h=HIDDEN.ms[r.id]||{done:0,total:0};return{done:ms.filter(t=>t.status==='done').length+h.done,total:ms.length+h.total,hidden:h.total}};
const meetingsDesc=()=>[...D.meetings].sort((a,b)=>b.date.localeCompare(a.date));
const lastMeetingDate=()=>meetingsDesc()[0]?.date||'0000-00-00';
const reviewList=()=>{const lm=lastMeetingDate();return D.tasks.filter(t=>t.todo&&!t.newInMt&&(t.status!=='done'||(t.doneAt&&t.doneAt>lm)))};
const issueTasks=i=>D.tasks.filter(t=>t.issue===i.id);
const vto=()=>D.vto.find(v=>v.id==='main');
function weeks(){const d=dow(TODAY);const last=addDays(TODAY,-(d===0?7:d));return [...Array(13)].map((_,i)=>addDays(last,(i-12)*7))}
const score=(m,w)=>{const s=D.scores.find(x=>x.id===m.id+'|'+w);return s&&s.value!=null?s.value:null};
function setScore(m,w,v){const id=m.id+'|'+w;const s=D.scores.find(x=>x.id===id);if(s)s.value=v;else D.scores.push({id,metric:m.id,week:w,value:v})}
const opts=(o,sel)=>Object.entries(o).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${v}</option>`).join('');
const activePeople=()=>D.people.filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name));
const ownerOpts=(sel,none)=>(none?`<option value="" ${!sel?'selected':''}>No owner</option>`:'')+D.people.filter(p=>p.active||p.id===sel).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)}${p.active?'':' (archived)'}</option>`).join('');
const addrsOf=p=>[p.email,...String(p.alt||'').split(',')].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);
function setAddrs(p,list){list=[...new Set(list)];p.email=list[0]||null;p.alt=list.slice(1).join(',')}
const ownerOfAddr=a=>D.people.find(p=>addrsOf(p).includes(a));
const sharedInbox=(p,a)=>!a.split('@')[0].includes(String(p.name||'').split(' ')[0].toLowerCase());
function setStatus(t,st){t.status=st;t.doneAt=st==='done'?TODAY:null}
function newTask(x){const t={id:uid('t'),project:x.project??null,parent:x.parent??null,title:x.title??'New task',desc:'',owner:x.owner===undefined?ME:x.owner,due:x.due??null,status:x.status??'todo',doneAt:null,rock:x.rock??null,todo:x.todo?1:0,issue:x.issue??null,newInMt:x.newInMt?1:0,createdAt:TODAY,priority:x.priority??null,createdBy:ME};if(t.status==='done')t.doneAt=TODAY;D.tasks.push(t);if(t.owner&&!canSeeP(taskProj(t),t.owner))t.owner=null;return t}
// Owner choices for a task: in a private project, the people who can see it. Someone who manages it also gets
// everyone else under "Add to this project", which adds them before handing over the task.
function taskOwnerOpts(t){const p=taskProj(t);if(!isPrivate(p))return ownerOpts(t.owner,true);
  const pick=x=>`<option value="${x.id}" ${x.id===t.owner?'selected':''}>${esc(x.name)}${x.active?'':' (archived)'}</option>`;
  const ins=D.people.filter(x=>(x.active||x.id===t.owner)&&canSeeP(p,x.id)).sort((a,b)=>a.name.localeCompare(b.name));
  const outs=canManage(p)?activePeople().filter(x=>!canSeeP(p,x.id)):[];
  return `<option value="" ${!t.owner?'selected':''}>No owner</option>${ins.map(pick).join('')}${outs.length?`<optgroup label="Add to this project">${outs.map(x=>`<option value="add:${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>`:''}`}
function setOwner(t,v){if(v.startsWith('add:')){v=v.slice(4);const p=taskProj(t);if(p&&canManage(p)){addMember(p,v);toast(`${first(v)} was added to ${p.name||'this project'}`)}else v=''}t.owner=v||null}
// After a task moves project, anyone who can't see the new one either joins it (if you manage it) or lets go of the task.
function fitOwners(t){const p=taskProj(t);if(!isPrivate(p))return;[t,...subsOf(t.id)].forEach(x=>{if(!x.owner||canSeeP(p,x.owner))return;if(canManage(p)){addMember(p,x.owner);toast(`${first(x.owner)} was added to ${p.name||'the project'} so they keep their task`)}else{toast(`${first(x.owner)} isn’t on that project, so the task has no owner now`);x.owner=null}})}
function newIssue(title,list='weekly'){const i={id:uid('i'),title,by:ME,date:TODAY,list,pri:0,status:'open',details:'',decision:'',solvedOn:null};D.issues.push(i);return i}
const draft=i=>S.drafts[i.id]||(S.drafts[i.id]={title:'',owner:i.by,due:addDays(TODAY,7)});
const getP=(o,p)=>p.split('.').reduce((a,k)=>a?.[k],o);
function setP(o,p,v){const ks=p.split('.');const last=ks.pop();ks.reduce((a,k)=>a[k],o)[last]=v}
const EMPTY_VTO=()=>({values:[],purpose:'',niche:'',tenYear:'',target:'',uniques:[],process:'',guarantee:'',threeYear:{date:'',revenue:'',profit:'',measurables:'',looks:[]}});
function touchVto(){const v=vto();v.by=ME;v.date=TODAY}

// Things every team needs to exist: this year's plan and the Vision.
function ensureBasics(){
  if(!openPlan()&&!isHidden('plan')){const y=+TODAY.slice(0,4);D.plans.push({id:String(y),year:y,status:'open',revenue:'',profit:'',measurables:'',closedOn:null,by:null})}
  if(isHidden('vision'))return;
  if(!vto())D.vto.push({id:'main',data:EMPTY_VTO(),by:ME,date:TODAY});
  const v=vto();v.data=Object.assign(EMPTY_VTO(),v.data||{});v.data.threeYear=Object.assign(EMPTY_VTO().threeYear,v.data.threeYear||{});
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
let saveState='saved',saveMsg='',inflight=false,again=false,saveTimer=null,retryTimer=null;
// Counts local changes and saves. A teammate refresh that started before one of them is thrown away, so it can
// never put older data back on screen.
let gen=0,refreshSeq=0;
// Changes not yet saved when the session ran out wait here (on this device) and are sent after signing back in.
// One per person, so a teammate signing in on the same computer never sends (or clears) someone else's.
const outboxKey=id=>'hq-outbox:'+id;
// Returns false if this device can't hold them; the caller then keeps the work on screen instead of signing out.
function stashOutbox(){const ch=diff();if(!ch.length)return true;
  try{const k=outboxKey(ME);const old=JSON.parse(localStorage.getItem(k)||'null');localStorage.setItem(k,JSON.stringify({at:Date.now(),changes:mergeChanges([...(old?.changes||[]),...ch])}));return true}catch{return false}}
// One change per row, as the server requires: a later edit merges into an earlier one, a delete replaces it, and a
// row added and then deleted before it was ever sent drops out.
function mergeChanges(list){const m=new Map();for(const c of list){const k=c.t+'|'+c.id,p=m.get(k);
  if(!p||p.del)m.set(k,c);else if(c.del){if(p.ins)m.delete(k);else m.set(k,c)}else m.set(k,{...p,f:{...p.f,...c.f}})}return [...m.values()]}
// Changes kept from before a sign-out go into the working copy as if just made, then save the normal way: one row at
// a time can be refused and undone alone, and anything edited since lands on top instead of being overwritten.
function applyOutbox(){const k=outboxKey(ME);let ob=null;try{ob=JSON.parse(localStorage.getItem(k)||'null')}catch{}if(!ob?.changes?.length)return;
  for(const c of ob.changes){const list=D[c.t];if(!list)continue;const i=list.findIndex(r=>r.id===c.id);
    if(c.del){if(i>=0)list.splice(i,1)}else if(i>=0)Object.assign(list[i],c.f||{});else if(c.ins)list.push({...(c.f||{}),id:c.id})}
  outboxOpen=true;setTimeout(()=>toast('Saving the changes you made before you were signed out.'),600)}
// The recovered changes leave this device only once the server has taken a save.
let outboxOpen=false;
function closeOutbox(){if(!outboxOpen)return;outboxOpen=false;try{localStorage.removeItem(outboxKey(ME))}catch{}}
function sessionEnded(){if(stashOutbox())return signedOut();setSave('error','You’re signed out. Sign in again in a new tab, then press Try again here')}
function diff(){
  const ch=[];
  for(const t of TABLES){const prev=SNAP[t]||new Map();const seen=new Set();
    for(const r of D[t]){seen.add(r.id);const js=JSON.stringify(r);const old=prev.get(r.id);if(old===js)continue;
      if(old===undefined){const f={...r};delete f.id;ch.push({t,id:r.id,ins:true,f})}
      else{const o=JSON.parse(old);const f={};for(const k of Object.keys(r))if(k!=='id'&&JSON.stringify(r[k])!==JSON.stringify(o[k]))f[k]=r[k];for(const k of Object.keys(o))if(!(k in r))f[k]=null;if(Object.keys(f).length)ch.push({t,id:r.id,f})}}
    for(const id of prev.keys())if(!seen.has(id))ch.push({t,id,del:true})}
  return ch;
}
function schedule(ms=300){if(!D)return;gen++;clearTimeout(saveTimer);saveTimer=setTimeout(commit,ms);saveMeeting()}
async function commit(){
  if(!D)return;if(inflight){again=true;return}
  const ch=diff();if(!ch.length){closeOutbox();setSave('saved');return}
  inflight=true;gen++;setSave('saving');const sent=snapOf();
  try{
    const r=await fetch('/api/sync',{method:'POST',headers:{'X-HQ':'1','Content-Type':'application/json'},body:JSON.stringify({changes:ch})});
    if(r.status===401){inflight=false;sessionEnded();return}
    const j=await r.json().catch(()=>({}));
    if(r.ok){SNAP=sent;closeOutbox();setSave('saved')}
    else if(r.status>=400&&r.status<500){
      // Refused: put back the server's copy of the row it refused (or every row in this save, if it didn't say which).
      // Anything else, including edits made while this save was on its way, stays and saves next.
      const refused=Number.isInteger(j.at)&&ch[j.at]?[ch[j.at]]:null;
      // If it didn't say which change, nothing is undone: the work stays here, marked as not saved.
      if(!refused){setSave('error',`Couldn’t save: ${j.error||'not allowed'}`);return}
      // Only fields still holding the refused value go back; anything typed since the save went out stays.
      for(const c of refused){const old=SNAP[c.t].get(c.id);const i=D[c.t].findIndex(x=>x.id===c.id);
        if(old===undefined){if(i>=0)D[c.t].splice(i,1)}
        else{const row=JSON.parse(old);if(i<0)D[c.t].push(row);else if(c.del||c.ins)D[c.t][i]=row;else for(const k of Object.keys(c.f||{}))if(JSON.stringify(D[c.t][i][k])===JSON.stringify(c.f[k]))D[c.t][i][k]=row[k]}}
      ensureBasics();render();toast(`Couldn’t save: ${j.error||'not allowed'}. That change was undone.`);
      if(diff().length)again=true;else setSave('saved');
    }else throw new Error(j.error||'Server error');
  }catch(e){setSave('error',navigator.onLine?'Didn’t save':'You’re offline');clearTimeout(retryTimer);retryTimer=setTimeout(commit,8000)}
  finally{inflight=false;if(again){again=false;schedule(50)}}
}
function setSave(state,msg){saveState=state;saveMsg=msg||'';document.querySelectorAll('.savest').forEach(paintSave)}
function paintSave(el){el.classList.toggle('err',saveState==='error');el.innerHTML=saveState==='saving'?'Saving…':saveState==='error'?`${esc(saveMsg)}. Your work is kept here. <button class="link" data-act="retrySave">Try again</button>`:'All changes saved'}
window.addEventListener('beforeunload',e=>{if(D&&(inflight||diff().length)){e.preventDefault();e.returnValue=''}});
window.addEventListener('online',()=>commit());

// Pick up teammates' changes when nobody here is mid-edit.
async function refresh(force){
  const busy=()=>{const a=document.activeElement;return !D||document.hidden||inflight||S.modal||diff().length||(!force&&a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))};
  if(busy())return;const g=gen,my=++refreshSeq;
  try{const r=await fetch('/api/data',{headers:{'X-HQ':'1'}});if(r.status===401)return sessionEnded();if(!r.ok)return;
    const j=await r.json();const js=JSON.stringify([j.data,j.hidden]);TODAY=todayET();
    // Checked again now the data is back: someone may have edited, saved or opened something meanwhile.
    if(g!==gen||my!==refreshSeq||busy()||js===lastServer)return;lastServer=js;load(j.data,j.hidden);ensureBasics();render();schedule()}catch{}
}
setInterval(refresh,20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});

// The weekly meeting in progress lives on this device until it's ended and saved.
function saveMeeting(){try{if(S.mt.running)localStorage.setItem('hq-meeting',JSON.stringify(S.mt));else localStorage.removeItem('hq-meeting')}catch{}}
function restoreMeeting(){try{const m=JSON.parse(localStorage.getItem('hq-meeting')||'null');if(m&&m.running&&Date.now()-m.start<6*3600_000)S.mt=m}catch{}}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
const lightBg=hex=>{const n=parseInt((hex||'#171717').slice(1),16);return ((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000>150};
function av(id,cls=''){const p=person(id);if(!p)return `<span class="av av-none ${cls}" title="No owner">?</span>`;return `<span class="av ${cls} ${p.active?'':'off'}" style="--av:${esc(p.color||'#171717')};--avt:${lightBg(p.color)?'#171717':'#fff'}" title="${esc(p.name)}${p.active?'':' (inactive)'}">${esc((p.name||'?')[0])}</span>`}
const chk=t=>`<button class="chk" role="checkbox" aria-checked="${t.status==='done'}" aria-label="Mark “${esc(t.title)}” done" data-act="toggleDone" data-id="${t.id}">${I('check',12)}</button>`;
function due(t){if(!t.due)return '<span class="due none">No date</span>';const od=isOD(t);return `<span class="due ${od?'od':''}">${od?'<b>Overdue</b> · ':''}${fmt(t.due)}</span>`}
const rockChip=id=>rock(id)?`<span class="chip chip-rock" title="Rock: ${esc(rock(id).title)}">${I('star',11)} ${esc(rock(id).title)}</span>`:'';
const priSel=t=>`<select class="pill pill-sel pri-${t.priority||0}" data-change="tpri" data-id="${t.id}" aria-label="Priority of ${esc(t.title)}"><option value="" ${t.priority?'':'selected'}>None</option>${opts(PRI,String(t.priority||''))}</select>`;
const priTag=t=>t.priority?`<span class="pill pri-${t.priority}">${PRI[t.priority]}</span>`:'';
const stSel=t=>`<select class="pill pill-sel st-${t.status}" data-change="status" data-id="${t.id}" aria-label="Status of ${esc(t.title)}">${opts(ST,t.status)}</select>`;
const rpill=r=>`<span class="pill rk-${r.status}">${r.status==='done'?I('check',11):''}${RK[r.status]||''}</span>`;
function ctx(t){const o=[];if(t.parent){o.push(`<span class="chip">${I('sub',12)} ${esc(task(t.parent)?.title)}</span>`)}else if(t.project&&proj(t.project)){o.push(`<span class="chip">${esc(proj(t.project).name)}</span>`)}if(t.todo)o.push('<span class="chip chip-todo">Meeting to-do</span>');if(t.rock)o.push(rockChip(t.rock));return o.join('')}
// Click the date to change it; click the owner to reassign. The real control sits invisibly over the label.
const dueEdit=t=>`<span class="due-cell" title="Change the due date">${due(t)}<input type="date" class="due-in" value="${esc(t.due||'')}" data-change="tdue" data-id="${t.id}" aria-label="Due date for ${esc(t.title)}"></span>`;
const ownerEdit=t=>`<span class="own-cell" title="Change the owner">${av(t.owner)}<span class="own-name">${esc(first(t.owner))}</span><select class="own-in" data-change="towner" data-id="${t.id}" aria-label="Owner of ${esc(t.title)}">${taskOwnerOpts(t)}</select></span>`;
// Finished tasks show the day they were done instead of a due date (the due date stays in the tooltip).
const doneOn=t=>`<span class="due done-on" title="${t.due?'Was due '+esc(fmtLong(t.due)):''}">Done${t.doneAt?' '+esc(fmt(t.doneAt)):''}</span>`;
const rowMine=t=>`<div class="trow ${t.status==='done'?'isdone':''}">${chk(t)}<div class="tmain"><button class="tlink" data-act="openTask" data-id="${t.id}">${esc(t.title)}</button>${t.status==='done'?'':priTag(t)}${ctx(t)}</div>${t.status==='done'?doneOn(t):dueEdit(t)}</div>`;
let toastT;function toast(m){const el=document.getElementById('toast');el.textContent=m;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3200)}
const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const avgOf=ms=>{const r=ms.filter(m=>m.avg!=null);return r.length?(r.reduce((a,m)=>a+m.avg,0)/r.length).toFixed(1):'–'};

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
// Work and EOS fold away; each person's choice is remembered on their own device.
let NAVSHUT={};try{NAVSHUT=JSON.parse(localStorage.getItem('hq-nav-shut')||'{}')||{}}catch{}
const navSec=(k,label,body)=>`<button class="nav-h" data-act="navSec" data-k="${k}" aria-expanded="${!NAVSHUT[k]}">${label}<span class="nav-car">${I('caret',12)}</span></button><div class="nav-sec" ${NAVSHUT[k]?'hidden':''}>${body}</div>`;
function side(){
  const ni=(v,label,icon,n)=>`<button class="nav-i ${S.view===v?'on':''}" data-act="go" data-v="${v}" ${S.view===v?'aria-current="page"':''}>${I(icon)}<span>${label}</span>${n?`<span class="n">${n}</span>`:''}</button>`;
  const myN=D.tasks.filter(t=>t.owner===ME&&t.status!=='done').length;
  const openI=D.issues.filter(i=>i.status==='open'&&i.list==='weekly').length;
  return `<aside class="side" aria-label="Main menu">
    <div class="brand">${logo()}<span class="hq">HQ</span></div>
    <div class="search"><span class="ic-s">${I('search',16)}</span><input id="q" type="search" placeholder="Search" aria-label="Search tasks, projects, Rocks and issues" autocomplete="off" data-live="search" value="${esc(S.q)}"><div id="qres" class="qres" ${S.q.trim()?'':'hidden'}>${searchResults()}</div></div>
    <nav>
      ${navSec('work','Work',`${ni('mytasks','My tasks','tasks',myN)}
      <div class="nav-row">${ni('projects','Projects','folder')}<button class="nav-add" data-act="newProject" aria-label="New project" title="New project">${I('plus',16)}</button></div>
      <div data-plist="nav">${D.projects.filter(p=>!p.archived&&canSeeP(p,ME)&&(!isPrivate(p)||memberOf(p.id,ME))).sort(projSort).map(p=>`<div class="nav-prow" data-pdrag="${p.id}">${pgrip(p)}<button class="nav-i nav-sub ${S.view==='project'&&S.projectId===p.id?'on':''}" data-act="openProject" data-id="${p.id}">${isPrivate(p)?`<span class="nav-lock" title="Private">${I('lock',12)}</span>`:''}${esc(p.name||'Untitled project')}</button></div>`).join('')}</div>`)}
      ${navSec('eos','EOS',[['vision','Vision','eye'],['plan','1-Year Plan','target'],['rocks','Rocks','rock'],['scorecard','Scorecard','chart'],['issues','Issues','alert',openI],['meeting','Weekly meeting','calendar'],['history','History','archive']].filter(([v])=>!isHidden(v)).map(a=>ni(...a)).join(''))}
    </nav>
    <div class="side-foot">${ni('links','Helpful links','link')}${ni('team','Team','users')}
      <div class="me">${av(ME)}<div><div class="nm">${esc(first(ME))}</div><button class="link" data-act="signout">Sign out</button></div></div>
      <div class="savest" aria-live="polite"></div>
    </div>
  </aside>`;
}
const mtop=()=>`<div class="mtop"><button class="iconbtn" data-act="nav" aria-label="Open menu">${I('menu')}</button>${logo()}<span class="hq">HQ</span><div class="savest" aria-live="polite"></div></div>`;
const tabbar=()=>{const tb=(v,label,icon)=>`<button class="tb ${S.view===v||(v==='projects'&&S.view==='project')?'on':''}" data-act="go" data-v="${v}">${I(icon,20)}<span>${label}</span></button>`;
  return `<nav class="tabbar" aria-label="Sections">${tb('mytasks','My tasks','tasks')}${tb('projects','Projects','folder')}${isHidden('rocks')?'':tb('rocks','Rocks','rock')}${isHidden('issues')?'':tb('issues','Issues','alert')}<button class="tb ${S.navOpen?'on':''}" data-act="nav">${I('menu',20)}<span>More</span></button></nav>`};
function searchResults(){
  const q=S.q.trim().toLowerCase();if(!q)return '';
  const hit=s=>String(s||'').toLowerCase().includes(q);
  const res=[
    ...D.projects.filter(p=>hit(p.name)).map(p=>['Project','openProject',p.id,(p.name||'Untitled project')+(p.archived?' (archived)':'')]),
    ...D.tasks.filter(t=>hit(t.title)||hit(t.desc)).slice(0,8).map(t=>['Task','openTask',t.id,t.title]),
    ...D.rocks.filter(r=>hit(r.title)).map(r=>['Rock','openRock',r.id,`${r.title} (${qLabel(r.q)})`]),
    ...D.issues.filter(i=>hit(i.title)||hit(i.decision)).map(i=>['Issue','openIssue',i.id,i.title+(i.status==='solved'?' (solved)':'')]),
    ...D.links.filter(l=>hit(l.title)||hit(l.url)||hit(l.about)).map(l=>['Link','openLink',l.id,l.title])
  ].slice(0,12);
  return res.length?res.map(([k,a,id,t])=>`<button class="qr" data-act="${a}" data-id="${id}"><span class="qr-k">${k}</span><span>${esc(t)}</span></button>`).join(''):`<div class="qnone">Nothing matches “${esc(S.q)}”.</div>`;
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
function vSignin(){
  const c=CONFIG;const dom=(c.domains||['yourcompany.com'])[0];
  return `<div class="signin"><div class="si-card"><div class="brand big">${logo()}<span class="hq">HQ</span></div><p class="si-sub">Projects, tasks and EOS for the ${esc(CO())} team.</p>
  ${S.signinError?`<p class="si-err" role="alert">${esc(S.signinError)}</p>`:''}
  ${c.googleClientId?`<div id="gbtn"></div><p class="si-note">Use your @${esc(dom)} Google account.</p>`:'<p class="si-note">Google sign-in isn’t switched on yet.</p>'}
  ${c.preview?`<p class="si-or">Testing</p><form class="si-form" data-auth="preview"><input class="fin" type="email" name="email" placeholder="Work email" autocomplete="email" required aria-label="Work email"><input class="fin" type="password" name="code" placeholder="Preview code" required aria-label="Preview code"><button class="btn btn-primary" type="submit">Sign in with a preview code</button></form>`:''}
  ${c.devLogin?`<p class="si-or">On this computer only</p><form class="si-form" data-auth="dev"><input class="fin" type="email" name="email" placeholder="you@${esc(dom)}" required aria-label="Email"><button class="btn btn-ghost" type="submit">Developer sign-in</button></form>`:''}
  </div></div>`;
}
function mountGoogle(){
  if(!CONFIG.googleClientId||!document.getElementById('gbtn'))return;
  const go=()=>{google.accounts.id.initialize({client_id:CONFIG.googleClientId,ux_mode:'redirect',login_uri:location.origin+'/auth/google',auto_select:false});
    google.accounts.id.renderButton(document.getElementById('gbtn'),{theme:'outline',size:'large',shape:'pill',text:'signin_with',width:Math.min(320,document.getElementById('gbtn').clientWidth||320)})};
  if(window.google?.accounts?.id)return go();
  const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=go;s.onerror=()=>{S.signinError='Couldn’t reach Google. Check your connection and reload.';renderMain()};document.head.appendChild(s);
}
async function authSubmit(form){
  const kind=form.dataset.auth;const f=new FormData(form);
  const r=await fetch('/auth/'+kind,{method:'POST',headers:{'X-HQ':'1','Content-Type':'application/json'},body:JSON.stringify({email:f.get('email'),code:f.get('code')})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){S.signinError=j.error||'Sign-in failed.';renderMain();return}
  S.signinError='';boot();
}
function signedOut(){D=null;initState();S.view='signin';root.innerHTML=vSignin();mountGoogle()}

// ---------------------------------------------------------------------------
// Views: work
// ---------------------------------------------------------------------------
function vMyTasks(){
  const who=S.who||ME;const isP=who!=='none';
  const title=who===ME?'My tasks':isP?`${first(who)}’s tasks`:'Unassigned';
  const mine=D.tasks.filter(t=>isP?t.owner===who:!t.owner);
  const open=mine.filter(t=>t.status!=='done').sort((a,b)=>byDue(a,b)||byPri(a,b));
  const wk=addDays(TODAY,6);
  const groups=[['Overdue',t=>isOD(t)],['Due this week',t=>t.due&&t.due>=TODAY&&t.due<=wk],['Later',t=>t.due&&t.due>wk],['No due date',t=>!t.due]];
  const done=mine.filter(t=>t.status==='done').sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')).slice(0,30);
  const rocks=isP?curRocks().filter(r=>r.owner===who):[];
  const nUn=D.tasks.filter(t=>!t.owner&&t.status!=='done').length;
  const whoSel=`<label class="filt">Showing <select class="fin sm" data-change="who" aria-label="Whose tasks"><option value="${ME}" ${who===ME?'selected':''}>Me</option>${D.people.filter(p=>p.id!==ME&&(p.active||p.id===who)).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${who===p.id?'selected':''}>${esc(p.name)}${p.active?'':' (archived)'}</option>`).join('')}<option value="none" ${who==='none'?'selected':''}>Unassigned (${nUn})</option></select></label>`;
  return `<header class="ph"><div><div class="eyebrow">${longDay(TODAY)}</div><h1>${esc(title)}</h1><p class="sub">${isP?'Everything assigned to '+(who===ME?'you':esc(first(who)))+', across every project, soonest first. Subtasks, Rock milestones and meeting to-dos land here too.':'Tasks nobody owns yet, including ones with no project. Open one and give it an owner.'}</p></div><div class="ph-act">${whoSel}<button class="btn btn-primary" data-act="quickTask">${I('plus',15)} New task</button></div></header>
  ${rocks.length?`<h2 class="sh">${who===ME?'Your':esc(first(who))+'’s'} Rocks this quarter</h2><div class="rstrip">${rocks.map(r=>{const ms=milestones(r);return `<button class="rcard" data-act="openRock" data-id="${r.id}">${rpill(r)}<span class="rc-t">${esc(r.title)}</span><span class="im">${msCount(r).done} of ${msCount(r).total} milestones done</span></button>`}).join('')}</div>`:''}
  ${groups.map(([name,f])=>{const ts=open.filter(f);if(!ts.length)return '';return `<h2 class="sh">${name} <span class="n">${ts.length}</span></h2><div>${ts.map(rowMine).join('')}</div>`}).join('')}
  ${!open.length?`<div class="all-clear"><p><b>${isP?'All clear':'Nothing unassigned'}</b>${isP?'Nothing open right now.':''}</p>${isP?'<p class="im">Press “New task” to add one, or open a project.</p>':''}</div>`:''}
  ${done.length?`<details class="donebox"><summary>Recently done <span class="n">${done.length}</span></summary><div>${done.map(rowMine).join('')}</div></details>`:''}`;
}

function projStats(p){const ts=D.tasks.filter(t=>t.project===p.id);const open=ts.filter(t=>t.status!=='done');return{ts,open,d:ts.length-open.length,od:open.filter(isOD).length,next:open.filter(t=>t.due).sort(byDue)[0]}}
function vProjects(){
  // Admins can see every project. Private ones they aren't on sit in their own section, out of the way.
  const offList=p=>isPrivate(p)&&!memberOf(p.id,ME);
  const tab=S.projTab;const all=D.projects.filter(p=>tab==='archived'?p.archived:!p.archived).sort(projSort);const list=all.filter(p=>!offList(p)),others=isAdmin()?all.filter(offList):[];const nA=D.projects.filter(p=>p.archived).length;
  const pcard=p=>{const s=projStats(p);const late=p.due&&p.due<TODAY&&!p.archived;return pcardHtml(p,s,late)};
  return `<header class="ph"><div><div class="eyebrow">Work</div><h1>Projects</h1><p class="sub">Each project holds its tasks and subtasks. Open one to see it as a list or a board. Finished projects get archived, never deleted. Drag a project’s dots to put the most important first; everyone sees the same order.</p></div><button class="btn btn-primary" data-act="newProject">${I('plus',15)} New project</button></header>
  <div class="seg mb" role="group" aria-label="Show"><button aria-pressed="${tab==='active'}" data-act="projTab" data-t="active">Active · ${D.projects.length-nA}</button><button aria-pressed="${tab==='archived'}" data-act="projTab" data-t="archived">Archived · ${nA}</button></div>
  <div class="pgrid" data-plist="main">${list.map(pcard).join('')||`<p class="empty">${tab==='archived'?'Nothing archived yet.':'No projects yet. Press “New project” to start one.'}</p>`}</div>
  ${others.length?`<h2 class="sh">Private projects you’re not on <span class="n">${others.length}</span></h2><p class="hint" style="margin-top:0">You can see these because you’re an admin. The people on them don’t see that you looked.</p><div class="pgrid" data-plist="others">${others.map(pcard).join('')}</div>`:''}`;
}
function pcardHtml(p,s,late){
    return `<div class="pcard" role="link" tabindex="0" data-act="openProject" data-id="${p.id}" data-pdrag="${p.id}"><div class="pc-top">${pgrip(p)}${av(p.owner)}<span>${esc(first(p.owner))} owns it</span>${isPrivate(p)?`<span class="chip chip-lock" title="Only the people on it can see it">${I('lock',11)} Private</span>`:''}${p.due?`<span class="due ${late?'od':''}">${late?'<b>Late</b> · ':''}Due ${fmt(p.due,false)}</span>`:''}</div><h3>${esc(p.name||'Untitled project')}</h3>${p.desc?`<p>${esc(p.desc)}</p>`:''}<div class="bar" role="img" aria-label="${s.d} of ${s.ts.length} tasks done"><i style="width:${s.ts.length?s.d/s.ts.length*100:0}%"></i></div><div class="pmeta"><span>${s.d} of ${s.ts.length} tasks done, subtasks included</span><span>${p.archived?(canManage(p)?`<button class="link" data-act="restoreProject" data-id="${p.id}">Restore</button>`:'Archived'):s.od?`<span class="odl">${s.od} overdue</span>`:s.next?'Next due '+fmt(s.next.due):'Nothing due'}</span></div></div>`;
}
const matchWho=t=>S.pwho==='all'||t.owner===S.pwho||(S.pwho==='none'&&!t.owner)||subsOf(t.id).some(s=>s.owner===S.pwho);
// The project page's controls, in three plain groups: what you do to the project (top right), how you look at its
// tasks (the bar under the title), and which filters are on (chips you can clear).
// The three-dot button that opens a small menu; a click anywhere else or Escape closes it.
const dotsBtn=(id,label)=>`<button class="iconbtn xs dots" data-act="menu" data-id="${id}" aria-label="More options for ${esc(label)}" aria-haspopup="menu" aria-expanded="${S.menu===id}">${I('dots',16)}</button>`;
// The three-dot menu on a row or card. Delete asks first, inside the same menu.
function taskMenu(t){
  if(S.menu!==t.id)return `<span class="rmenu">${dotsBtn(t.id,t.title)}</span>`;
  const n=subsOf(t.id).length;
  const pop=S.menuDel===t.id?`<div class="mpop" role="alertdialog" aria-label="Delete task"><p>Delete “${esc(t.title)}”${n?` and its ${n} subtask${n>1?'s':''}`:''}? This can’t be undone.</p><div class="row"><button class="btn btn-sm btn-danger" data-act="delTask" data-id="${t.id}">Delete</button><button class="btn btn-sm btn-ghost" data-act="menuClose">Keep it</button></div></div>`
    :`<div class="mpop" role="menu"><button role="menuitem" data-act="openTask" data-id="${t.id}">${I('pencil',15)} Open</button><button role="menuitem" data-act="dupTask" data-id="${t.id}">${I('copy',15)} Duplicate${n?' with subtasks':''}</button><button role="menuitem" class="danger" data-act="menuAskDel" data-id="${t.id}">${I('trash',15)} Delete</button></div>`;
  return `<span class="rmenu open">${dotsBtn(t.id,t.title)}${pop}</span>`;
}
function projMenu(p){const id='pmenu';
  const items=`<button role="menuitem" data-act="modal" data-k="editProject">${I('pencil',15)} Edit details</button>${canManage(p)?(p.archived?`<button role="menuitem" data-act="restoreProject" data-id="${p.id}">${I('archive',15)} Restore project</button>`:`<button role="menuitem" class="danger" data-act="askArchive">${I('archive',15)} Archive project</button>`):''}`;
  return `<span class="rmenu ${S.menu===id?'open':''}">${dotsBtn(id,'this project')}${S.menu===id?`<div class="mpop" role="menu">${items}</div>`:''}</span>`}
function shareBtn(p){const ms=membersOf(p.id);const faces=ms.slice(0,3).map(m=>av(m.person)).join('');
  return `<button class="btn btn-ghost share-btn" data-act="modal" data-k="share" title="Choose who can see this project">${isPrivate(p)?`<span class="avs">${faces}</span>${ms.length>3?`<span class="avs-more">+${ms.length-3}</span>`:''}`:I('users',15)} Share</button>`}
// Filters that are on, in words, each with an × to clear it.
function filterChips(){const c=[];
  if(S.pwho!=='all')c.push(['pwho',S.pwho==='none'?'Only unassigned tasks':`Only ${esc(first(S.pwho))}’s tasks`]);
  if(S.tab==='list'&&S.pgroup!=='status')c.push(['pgroup',`Grouped by ${esc(groupOf(S.pgroup).label)}`]);
  if(S.tab==='list'&&S.sort.k!=='order')c.push(['sort',`Sorted by ${S.sort.k.startsWith('f:')?esc(colById(S.sort.k)?.label||'a column'):SORT_NAME[S.sort.k]||'a column'}`]);
  return c}
function viewBar(p,shown,total){const chips=filterChips();const on=chips.length;
  // Grouping shows once the project has a dropdown column to group by.
  const grp=S.tab==='list'&&(Object.keys(fieldGroups()).length||S.pgroup!=='status')?`<label class="vp-f">Group the list by<select class="fin" data-change="pgroup">${Object.entries(allGroups()).map(([k,g])=>`<option value="${k}" ${S.pgroup===k?'selected':''}>${esc(g.label)}</option>`).join('')}</select></label>`:'';
  const who=`<label class="vp-f">Show tasks for<select class="fin" data-change="pwho"><option value="all">Everyone</option>${D.people.filter(x=>x.active||x.id===S.pwho).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${x.id}" ${S.pwho===x.id?'selected':''}>${esc(x.name)}${x.active?'':' (archived)'}</option>`).join('')}<option value="none" ${S.pwho==='none'?'selected':''}>Nobody yet (unassigned)</option></select></label>`;
  return `<div class="vbar"><div class="seg" role="group" aria-label="View as"><button aria-pressed="${S.tab==='list'}" data-act="tab" data-t="list">${I('list',15)} List</button><button aria-pressed="${S.tab==='board'}" data-act="tab" data-t="board">${I('board',15)} Board</button></div>
    <span class="vb-n">${on&&shown!==total?`${shown} of ${total} tasks`:`${total} task${total===1?'':'s'}`}</span>
    ${chips.map(([k,l])=>`<span class="fchip">${l}<button data-act="clearFilt" data-k="${k}" aria-label="Clear: ${l}" title="Clear">${I('x',12)}</button></span>`).join('')}
    <details class="vopts" ${S.vopts?'open':''}><summary class="btn btn-ghost btn-sm">${I('list',14)} View options${on?` · ${on}`:''}</summary><div class="vpop"><p class="vp-h">Choose which tasks show and how the list is grouped. This only changes your view, not anyone else’s.</p>${who}${grp}${on?`<button class="link" data-act="clearFilt" data-k="all">Reset to everything</button>`:''}</div></details></div>`}
function vProject(){
  const p=proj(S.projectId);if(!p){S.view='projects';return vProjects()}
  if(S.sort.k.startsWith('f:')&&!colById(S.sort.k))S.sort={k:'order',dir:1};
  if(S.pgroup.startsWith('f:')&&!fieldGroups()[S.pgroup])S.pgroup='status';
  const all=D.tasks.filter(t=>t.project===p.id&&!t.parent);const ts=all.filter(matchWho);
  const late=p.due&&p.due<TODAY&&!p.archived;
  return `<header class="ph"><div><div class="eyebrow">Project · ${esc(first(p.owner))} owns it · ${isPrivate(p)?`${I('lock',11)} private`:'open to everyone'}${p.due?` · <span class="${late?'odl':''}">due ${fmt(p.due,false)}</span>`:''}${p.archived?' · archived':''}</div><textarea id="p-title" class="ph-title" rows="1" data-live="ptitle" data-change="refresh" data-id="${p.id}" aria-label="Project name" placeholder="Name this project">${esc(p.name)}</textarea><p class="sub">${p.desc?esc(p.desc)+' ':''}<button class="link" data-act="modal" data-k="editProject">${p.desc?'Edit project details':'Add an owner, due date or description'}</button></p></div>
  <div class="ph-act">${shareBtn(p)}${projMenu(p)}<button class="btn btn-primary" data-act="addCard" data-st="todo">${I('plus',15)} Add task</button></div></header>
  ${viewBar(p,ts.length,all.length)}
  ${isPrivate(p)&&membersOf(p.id).length<2&&memberOf(p.id,ME)?`<div class="note">${I('lock',18)}<span>Nobody else is on this project yet, so only you and the admins can see it. Press <b>Share</b> to add people, or open it to the whole team.</span></div>`:''}
  ${S.confirmArchive===p.id?(()=>{const n=projStats(p).open.length;return `<div class="note" role="alert">${I('archive',18)}<span><b>Archive “${esc(p.name||'this project')}”?</b> ${n?`${n} task${n===1?' is':'s are'} still open and will stay open. `:''}It moves to the Archived tab on Projects, and you can restore it any time.</span><span class="row" style="margin-left:auto"><button class="btn btn-sm btn-danger" data-act="archiveProject">Archive</button><button class="link" data-act="cancelArchive">Keep it</button></span></div>`})():''}
  ${S.tab==='list'?listView(ts):boardView(ts)}`;
}
// The list's columns after the task name. Each person can widen, narrow, hide or show them from the + at the end of
// the headings; that's kept on this device and applies to every project. A project can also have its own named
// columns (projects.fields), which everyone on it sees and fills in (tasks.extra).
const LCOLS=[
  {k:'pri',label:'Priority',w:104,min:76,cell:t=>`<span class="lp">${priSel(t)}</span>`},
  {k:'owner',label:'Owner',w:170,min:60,cell:t=>`<span class="lo">${ownerEdit(t)}</span>`},
  {k:'due',label:'Due',w:150,min:84,cell:t=>`<span class="ld">${t.status==='done'?doneOn(t):dueEdit(t)}</span>`},
  {k:'added',label:'Added',w:84,min:68,cell:t=>`<span class="lc" title="${t.createdAt?`Added ${fmtLong(t.createdAt)}${t.createdBy?' by '+esc(first(t.createdBy)):''}`:''}">${t.createdAt?fmt(t.createdAt,false):''}</span>`},
  {k:'status',label:'Status',w:124,min:96,nosort:true,cell:t=>`<span class="ls">${stSel(t)}</span>`}
];
const NAMEC={k:'name',label:'Task',w:0,min:200};
const fieldsOf=p=>Array.isArray(p?.fields)?p.fields:[];
// A project's own column is a dropdown (options with colors, shown like Priority), text, or a number.
const FTYPES={select:{label:'Dropdown',icon:'fsel',sub:'Pick from a list you set up, like Priority'},text:{label:'Text',icon:'ftext',sub:'Any words or notes'},number:{label:'Number',icon:'fnum',sub:'Amounts, counts or money'}};
const ftype=f=>Object.hasOwn(FTYPES,f.type)?f.type:'text';
const FCOLORS=['#1B1714','#FB8B22','#F8B822','#234E96','#2F7D6D','#B5473A','#6E6658','#D8CFBE'];
const darkBg=c=>{const n=parseInt(c.slice(1),16);return ((n>>16)*299+(n>>8&255)*587+(n&255)*114)/1000<150};
function fieldCell(f,t){const v=t.extra?.[f.id];const at=`data-change="fval" data-id="${t.id}" data-f="${f.id}" aria-label="${esc(f.name||'Untitled')} for ${esc(t.title)}"`;
  if(ftype(f)==='select'){const o=(f.opts||[]).find(x=>x.id===v);
    return `<select class="pill pill-sel fsel ${o?(darkBg(o.color)?'on-dark':''):'pri-0'}" ${o?`style="background-color:${o.color};border-color:${o.color};color:${darkBg(o.color)?'#fff':'var(--ink)'}"`:''} ${at}><option value="">Set</option>${(f.opts||[]).map(x=>`<option value="${x.id}" ${x.id===v?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`}
  if(ftype(f)==='number')return `<input class="fcell num" type="number" step="any" inputmode="decimal" value="${typeof v==='number'?v:''}" ${at}>`;
  return `<input class="fcell" value="${esc(typeof v==='string'?v:'')}" maxlength="2000" ${at}>`}
const fieldCol=f=>({k:'f:'+f.id,fid:f.id,label:f.name||'Untitled',w:ftype(f)==='number'?120:160,min:60,cell:t=>`<span class="lf">${fieldCell(f,t)}</span>`});
const allCols=()=>[...LCOLS,...fieldsOf(proj(S.projectId)).map(fieldCol)];
const colById=k=>k==='name'?NAMEC:allCols().find(c=>c.k===k);
function loadCols(){try{const v=JSON.parse(localStorage.getItem('hq-cols')||'null');if(v&&typeof v==='object')return{w:v.w||{},off:v.off||{}}}catch{}return{w:{},off:{}}}
const CP=loadCols();
const saveCols=()=>{try{localStorage.setItem('hq-cols',JSON.stringify(CP))}catch{}};
const colOn=c=>c.k in CP.off?!CP.off[c.k]:!c.off;
const colW=c=>Math.max(c.min,Math.round(+CP.w[c.k]||c.w));
const shownCols=()=>allCols().filter(colOn);
// Until someone sets its width, the task name fills whatever room the other columns leave (never under 280px).
const nameW=()=>+CP.w.name?Math.max(NAMEC.min,Math.round(CP.w.name)):0;
const colStyle=cs=>{const nw=nameW();return `--lcols:${nw?nw+'px':'minmax(280px,1fr)'} ${cs.map(c=>colW(c)+'px').join(' ')} 44px${nw?' minmax(0,1fr)':''};min-width:${(nw||280)+56+cs.reduce((a,c)=>a+colW(c),0)}px`};
function sizeCols(){const t=document.querySelector('.ltab');if(t)t.style.cssText=colStyle(shownCols())}
const rszH=c=>`<span class="rsz" role="separator" aria-orientation="vertical" aria-label="Resize the ${esc(c.label)} column" tabindex="0" data-col="${c.k}" title="Drag to resize. Double-click to reset."></span>`;
const colHead=c=>`<span class="lh">${c.nosort?`<span class="sorth-static">${esc(c.label)}</span>`:sortH(c.k,esc(c.label))}${rszH(c)}</span>`;
function colsMenu(){const open=S.menu==='cols';const fs=fieldsOf(proj(S.projectId));
  const box=c=>`<input type="checkbox" data-change="colOn" data-k="${c.k}" ${colOn(c)?'checked':''} aria-label="Show ${esc(c.label)}">`;
  const own=fs.map(f=>{const c=fieldCol(f);return S.colDel===f.id
    ?`<div class="colopt coldel"><span>Delete “${esc(c.label)}” and everything written in it?</span><span class="row"><button class="btn btn-sm btn-danger" data-act="fieldDel" data-f="${f.id}">Delete</button><button class="btn btn-sm btn-ghost" data-act="fieldKeep">Keep it</button></span></div>`
    :`<div class="colopt">${box(c)}<span class="colname" title="${FTYPES[ftype(f)].label}">${I(FTYPES[ftype(f)].icon,14)}<span>${esc(c.label)}</span></span><button class="iconbtn xs" data-act="fieldEdit" data-f="${f.id}" aria-label="Edit the ${esc(c.label)} column" title="Rename it or change its options">${I('pencil',14)}</button><button class="iconbtn xs" data-act="fieldAsk" data-f="${f.id}" aria-label="Delete the ${esc(c.label)} column" title="Delete this column">${I('trash',14)}</button></div>`}).join('');
  const pop=open?`<div class="mpop colpop" role="dialog" aria-label="Columns"><p>Show these columns</p>${LCOLS.map(c=>`<label class="colopt">${box(c)} ${c.label}</label>`).join('')}
    <p>This project’s own columns</p>${own}<button class="coladd" data-act="fieldNew">${I('plus',15)} Add a column</button>
    <button class="colreset" data-act="colsReset">Reset column widths</button></div>`:'';
  return `<span class="rmenu ${open?'open':''}"><button class="iconbtn xs colbtn" data-act="menu" data-id="cols" aria-haspopup="dialog" aria-expanded="${open}" aria-label="Columns" title="Add, show or hide columns">${I('plus',15)}</button>${pop}</span>`}
// Menus inside the sideways-scrolling list are pinned to the screen, so the list's edges can't cut them off.
function pinPops(){document.querySelectorAll('.lwrap .rmenu.open .mpop').forEach(p=>{const b=p.parentElement.querySelector('button').getBoundingClientRect();const w=p.offsetWidth,h=p.offsetHeight;
  let top=b.bottom+4;if(top+h>innerHeight-8)top=b.top-4-h>8?b.top-4-h:Math.max(8,innerHeight-8-h);
  p.style.cssText=`position:fixed;top:${top}px;left:${Math.max(8,Math.min(b.right-w,innerWidth-w-8))}px;right:auto`})}
// The list groups by status, or by one of the project's own dropdown columns: one section per option, like Asana's
// sections. Every option shows, even when empty, so there's always somewhere to drag a task to.
const STATUS_GROUP={label:'Status',keys:()=>['todo','doing','done'],of:t=>t.status,name:k=>ST[k],keepEmpty:true,set:(t,k)=>setStatus(t,k)};
function fieldGroups(){const o={};for(const f of fieldsOf(proj(S.projectId))){if(ftype(f)!=='select')continue;const os=f.opts||[];const opt=k=>os.find(x=>x.id===k);
  o['f:'+f.id]={label:f.name||'Untitled',own:true,keys:()=>[...os.map(x=>x.id),''],of:t=>opt(t.extra?.[f.id])?t.extra[f.id]:'',name:k=>opt(k)?.name||`No ${f.name||'value'}`,color:k=>opt(k)?.color,keepEmpty:true,hideEmpty:k=>k==='',
    set:(t,k)=>{const x={...(t.extra||{})};if(k)x[f.id]=k;else delete x[f.id];t.extra=Object.keys(x).length?x:null}}}return o}
const allGroups=()=>({status:STATUS_GROUP,...fieldGroups()});
const groupOf=k=>allGroups()[k]||STATUS_GROUP;
function lrow(t,sub,cs,gk){const s=subsOf(t.id);const d=s.filter(x=>x.status==='done').length;const sod=s.filter(isOD).length;
  return `<div class="lrow ${sub?'is-sub':''} ${t.status==='done'?'isdone':''}" data-row="${t.id}" data-par="${t.parent||''}" data-grp="${esc(gk)}"><span class="lname"><span class="grip-slot"><button class="grip ${S.sort.k==='order'?'':'off'}" data-grip="${t.id}" aria-label="Move “${esc(t.title)}”: drag it, or use the up and down arrow keys" title="${S.sort.k==='order'?'Drag to move':'Clear the sort first to drag tasks'}">${I('grip',16)}</button></span><span class="car-slot">${!sub&&s.length?`<button class="caret ${S.open[t.id]?'open':''}" data-act="expand" data-id="${t.id}" aria-expanded="${!!S.open[t.id]}" aria-label="Show subtasks">${I('caret',14)}</button>`:''}</span>${chk(t)}
  <span class="lt"><button class="tlink" data-act="openTask" data-id="${t.id}">${esc(t.title)}</button>${t.status==='done'?'':`<span class="ph-pri">${priTag(t)}</span>`}${s.length?`<span class="subn" title="Subtasks done">${I('sub',12)} ${d}/${s.length}</span>`:''}${cCount(t)}${sod&&!sub?`<span class="due od"><b>${sod} subtask${sod>1?'s':''} overdue</b></span>`:''}${t.rock&&!sub?`<span class="chip chip-rock sm" title="Linked to a Rock">${I('star',10)} Rock</span>`:''}</span></span>
  ${cs.map(c=>c.cell(t)).join('')}${taskMenu(t)}</div>`}
// Click a column name to sort by it (click again to flip). Tasks with no value for that column always go last.
// "order" is the custom order people drag tasks into; tasks nobody has placed yet come after, by due date.
const SORT_KEY={title:t=>t.title.toLowerCase(),pri:t=>t.priority||null,owner:t=>t.owner?first(t.owner).toLowerCase():null,due:t=>t.due||null,added:t=>t.createdAt||null,order:t=>typeof t.sort==='number'?t.sort:null};
const SORT_DIR={title:1,pri:1,owner:1,due:1,added:-1,order:1};
const SORT_NAME={title:'name',pri:'priority',owner:'owner',due:'due date',added:'date added'};
// A project's own column sorts by its type: numbers by size, dropdowns in the order their options are listed, text
// alphabetically.
function fieldKey(id){const f=fieldsOf(proj(S.projectId)).find(x=>x.id===id);const ty=f?ftype(f):'text';
  if(ty==='number')return t=>typeof t.extra?.[id]==='number'?t.extra[id]:null;
  if(ty==='select')return t=>{const i=(f.opts||[]).findIndex(o=>o.id===t.extra?.[id]);return i<0?null:i};
  return t=>t.extra?.[id]?String(t.extra[id]).toLowerCase():null}
function sorted(ts){const{k,dir}=S.sort;const key=SORT_KEY[k]||(String(k).startsWith('f:')?fieldKey(k.slice(2)):SORT_KEY.order);
  return [...ts].sort((a,b)=>{const x=key(a),y=key(b);if(x!==y){if(x==null)return 1;if(y==null)return -1;return (x<y?-1:1)*dir}return byDue(a,b)||byPri(a,b)})}
const sortH=(k,label)=>{const on=S.sort.k===k;return `<button class="sorth ${on?'on':''}" data-act="sortBy" data-k="${k}" aria-pressed="${on}" title="Sort by ${label.toLowerCase()}">${label}${on?`<span class="arr" aria-hidden="true">${S.sort.dir>0?'↑':'↓'}</span>`:''}</button>`};
function listView(ts){const cs=shownCols();const G=groupOf(S.pgroup);const own=S.pgroup!=='status';
  const addRow=`<div class="lrow addrow"><span class="lname"><span class="grip-slot"></span><span class="car-slot"></span><span class="chk-slot plus">${I('plus',15)}</span><input id="add-task" class="addin" placeholder="Add a task, then press Enter" aria-label="New task title" data-enter="addTask" enterkeyhint="done"></span></div>`;
  return `<div class="lwrap"><div class="ltab" style="${colStyle(cs)}"><div class="lhead"><span class="lname"><span class="grip-slot"></span><span class="car-slot"></span><span class="chk-slot"></span>${sortH('title','Task')}${rszH(NAMEC)}</span>${cs.map(colHead).join('')}${colsMenu()}</div>`+
  G.keys(ts).map((k,i)=>{const mine=ts.filter(t=>G.of(t)===k);const g=!own&&k==='done'&&S.sort.k==='due'?mine.sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')):sorted(mine);
    if(!g.length&&(!G.keepEmpty||G.hideEmpty?.(k)))return '';const dot=G.color?.(k);
    return `<section data-sec="${esc(k)}"><h3 class="lg-h">${dot?`<span class="gdot" style="background:${dot}"></span>`:''}${esc(G.name(k))} <span class="n">${g.length}</span></h3>${g.map(t=>lrow(t,false,cs,k)+(S.open[t.id]?sorted(subsOf(t.id)).map(x=>lrow(x,true,cs,k)).join(''):'')).join('')}
    ${i===0?addRow:''}</section>`}).join('')+`</div></div>`;
}
// Put a task before or after another one (or at the end of a group) in the custom order. Only the moved task gets a
// new number unless its neighbours have none yet; then the whole group is numbered once. Dropped into another
// section, a task also takes that section's status or dropdown value.
function moveTask(id,targetId,after,grp){const t=task(id);if(!t)return;const G=groupOf(S.pgroup);
  if(!t.parent&&grp!==G.of(t)){if(S.pgroup==='status'&&grp==='done'&&subsOf(t.id).some(x=>x.status!=='done')){S.modal='parentDone';S.marg=t.id;renderMain();renderModal();return}G.set(t,grp);toast(`Moved to ${G.name(grp)}`)}
  const sib=sorted(D.tasks.filter(x=>x.id!==id&&(t.parent?x.parent===t.parent:x.project===t.project&&!x.parent&&G.of(x)===G.of(t))));
  let i=targetId?sib.findIndex(x=>x.id===targetId):-1;i=i<0?sib.length:i+(after?1:0);
  const prev=sib[i-1],next=sib[i];const placed=x=>!x||typeof x.sort==='number';
  if(placed(prev)&&placed(next)&&!(prev&&next&&next.sort-prev.sort<1e-6))t.sort=prev&&next?(prev.sort+next.sort)/2:prev?prev.sort+1024:next?next.sort-1024:1024;
  else{sib.splice(i,0,t);sib.forEach((x,j)=>{if(x.sort!==(j+1)*1024)x.sort=(j+1)*1024})}
  renderMain();schedule()}
// Put a project before or after another one, the same way tasks move: only the moved one gets a new number unless
// its neighbours have none yet.
function moveProject(id,targetId,after){const p=proj(id);if(!p)return;
  const sib=D.projects.filter(x=>x.id!==id).sort(projSort);let i=targetId?sib.findIndex(x=>x.id===targetId):-1;i=i<0?sib.length:i+(after?1:0);
  const prev=sib[i-1],next=sib[i];const placed=x=>!x||typeof x.sort==='number';
  if(placed(prev)&&placed(next)&&!(prev&&next&&next.sort-prev.sort<1e-6))p.sort=prev&&next?(prev.sort+next.sort)/2:prev?prev.sort+1024:next?next.sort-1024:1024;
  else{sib.splice(i,0,p);sib.forEach((x,j)=>{if(x.sort!==(j+1)*1024)x.sort=(j+1)*1024})}
  renderMain();schedule()}
// The arrow keys on a project's dots move it one place in the list it's in (the menu or the Projects page).
function nudgeProject(id,dir,el){const box=el.closest('[data-plist]');if(!box)return;const all=[...box.querySelectorAll('[data-pdrag]')];const i=all.findIndex(r=>r.dataset.pdrag===id);const n=all[i+dir];
  if(!n)return;moveProject(id,n.dataset.pdrag,dir>0);document.querySelector(`[data-plist="${box.dataset.plist}"] [data-pgrip="${id}"]`)?.focus()}
// The arrow keys on a task's handle move it one place among the tasks you can see.
function nudgeTask(id,dir){const r=document.querySelector(`.lrow[data-row="${id}"]`);if(!r)return;let n=r;
  do{n=dir<0?n.previousElementSibling:n.nextElementSibling}while(n&&!(n.matches('.lrow[data-row]')&&n.dataset.par===r.dataset.par));
  if(!n)return;moveTask(id,n.dataset.row,dir>0,r.dataset.grp);document.querySelector(`.grip[data-grip="${id}"]`)?.focus()}
const cCount=t=>{const n=D.comments.filter(c=>c.task===t.id).length;return n?`<span class="subn" title="${n} comment${n>1?'s':''}">${I('chat',12)} ${n}</span>`:''};
function card(t){const s=subsOf(t.id);const d=s.filter(x=>x.status==='done').length;
  return `<div class="card ${t.status==='done'?'isdone':''}" draggable="true" data-drag="${t.id}" data-act="openTask" data-id="${t.id}" role="button" tabindex="0"><div class="card-top"><div class="card-t">${esc(t.title)}</div>${taskMenu(t)}</div>${t.status==='done'?'':priTag(t)}${t.rock?`<span class="chip chip-rock sm">${I('star',10)} Rock</span>`:''}<div class="card-m">${av(t.owner)}${due(t)}${s.length?`<span class="subn">${I('sub',12)} ${d}/${s.length}</span>`:''}${cCount(t)}</div></div>`}
function boardView(ts){
  return `<div class="board-wrap"><div class="board">${['todo','doing','done'].map(st=>{const g=ts.filter(t=>t.status===st).sort(byDue);
    return `<section class="col" data-drop="${st}" aria-label="${ST[st]}"><header class="col-h"><span>${ST[st]}</span><span class="n">${g.length}</span></header>${g.map(card).join('')}<button class="addcard" data-act="addCard" data-st="${st}">${I('plus',14)} Add task</button></section>`}).join('')}</div></div><p class="hint">Drag a card to another column to change its status. On a phone, swipe between columns and open a card to change its status.</p>`;
}

// ---------------------------------------------------------------------------
// Views: EOS
// ---------------------------------------------------------------------------
function vVision(){
  const V=vto();const v=V.data;const P=curPlan();const lt=D.issues.filter(i=>i.status==='open'&&i.list==='longterm').length;
  const ta=(path,ph)=>`<textarea class="ed" rows="1" data-live="vto" data-change="vtoTouch" data-path="${path}" placeholder="${ph}" aria-label="${ph}">${esc(getP(v,path))}</textarea>`;
  const list=(path,ph)=>`<div class="vlist">${getP(v,path).map((x,i)=>`<div class="vli"><span class="star">${I('star',10)}</span><input class="ed" value="${esc(x)}" data-live="vtoItem" data-change="vtoTouch" data-path="${path}" data-i="${i}" aria-label="${ph} ${i+1}"><button class="iconbtn xs" data-act="vtoDel" data-path="${path}" data-i="${i}" aria-label="Remove">${I('x',14)}</button></div>`).join('')}<div class="vli add">${I('plus',14)}<input id="add-${path.replace('.','-')}" placeholder="Add ${ph}, then press Enter" data-enter="vtoAdd" data-path="${path}" aria-label="Add ${ph}" enterkeyhint="done"></div></div>`;
  const tile=(path,label)=>`<label class="tile"><span class="vl">${label}</span><textarea class="ed big" rows="1" placeholder="Add" data-live="vto" data-change="vtoTouch" data-path="${path}" aria-label="${label}">${esc(getP(v,path))}</textarea></label>`;
  const n=D.vtoVersions.length;
  return `<header class="ph"><div><div class="eyebrow">EOS · Vision</div><h1>Vision</h1><p class="sub">Where ${esc(CO())} is going. Click any text to change it. After each quarterly or annual planning day, save a version so History keeps the old one.</p></div><button class="btn btn-primary" data-act="saveVersion">Save a version</button></header>
  <p class="im meta">Last changed by ${esc(first(V.by))} on ${fmt(V.date,false)} · ${n} saved version${n===1?'':'s'} in <button class="link" data-act="go" data-v="history">History</button></p>
  <div class="vgrid">
    <section class="vcard"><h2 class="vh">Core values</h2>${list('values','a value')}</section>
    <section class="vcard"><h2 class="vh">Core focus</h2><div class="vf"><span class="vl">Purpose</span>${ta('purpose','Why we exist')}</div><div class="vf"><span class="vl">Niche</span>${ta('niche','What we do best')}</div></section>
    <section class="vcard"><h2 class="vh">10-year target</h2>${ta('tenYear','One big goal, ten years out')}</section>
    <section class="vcard"><h2 class="vh">Marketing strategy</h2><div class="vf"><span class="vl">Who we’re for</span>${ta('target','Target market')}</div><div class="vf"><span class="vl">Three uniques</span>${list('uniques','a unique')}</div><div class="vf"><span class="vl">Proven process</span>${ta('process','The steps every client goes through')}</div><div class="vf"><span class="vl">Guarantee</span>${ta('guarantee','Optional')}</div></section>
    <section class="vcard wide"><h2 class="vh">3-year picture</h2><div class="tiles">${tile('threeYear.date','By')}${tile('threeYear.revenue','Revenue')}${tile('threeYear.profit','Profit')}${tile('threeYear.measurables','Measurables')}</div><span class="vl">What it looks like</span>${list('threeYear.looks','what it looks like')}</section>
    ${isHidden('plan')?'':`<section class="vcard"><h2 class="vh">1-Year Plan</h2><p>${goalsOf(P.year).length} goals for ${P.year}.</p><button class="link" data-act="go" data-v="plan">Open the 1-Year Plan</button></section>`}
    ${isHidden('issues')?'':`<section class="vcard"><h2 class="vh">Long-term issues</h2><p>${lt} issue${lt===1?'':'s'} parked for the next planning day.</p><button class="link" data-act="ltIssues">See them</button></section>`}
  </div>`;
}

function vPlan(){
  const P=curPlan();const gs=goalsOf(P.year);
  const tile=(f,label)=>`<label class="tile"><span class="vl">${label}</span><textarea class="ed big" rows="1" placeholder="Add" data-live="plan" data-f="${f}" aria-label="${label}">${esc(P[f])}</textarea></label>`;
  return `<header class="ph"><div><div class="eyebrow">EOS · ${P.year} · ends Dec 31</div><h1>1-Year Plan</h1><p class="sub">The few goals that matter most this year. Every quarter’s Rocks link back to one of them. Click any text to change it.</p></div><div class="ph-act">${isAdmin()?`<button class="btn btn-ghost" data-act="modal" data-k="closeYear">Close out ${P.year}</button>`:''}</div></header>
  <div class="tiles">${tile('revenue','Revenue')}${tile('profit','Profit')}${tile('measurables','Measurables')}</div>
  <h2 class="sh">Goals for ${P.year} <span class="n">${gs.length}</span></h2>
  ${gs.length>7?'<p class="warn">EOS keeps this to seven goals or fewer. Consider merging some.</p>':''}
  <div>${gs.map(g=>{const rs=D.rocks.filter(r=>r.goal===g.id&&r.q.startsWith(String(P.year)));const now=rs.filter(r=>r.q===curQ());
    return `<div class="goalrow"><button class="pill rk-${g.status} pillbtn" data-act="cycleGoal" data-id="${g.id}" title="Click to change status">${g.status==='done'?I('check',11):''}${RK[g.status]}</button><div class="rr-tc"><input class="ed" value="${esc(g.text)}" data-live="goalText" data-id="${g.id}" aria-label="Goal"><div class="rr-sub">${rs.length?`${rs.length} Rock${rs.length===1?'':'s'} this year${now.length?`, ${now.length} this quarter: ${now.map(r=>esc(r.title)).join(' · ')}`:''}`:'No Rocks linked yet'}</div></div><select class="fin sm" data-change="goalOwner" data-id="${g.id}" aria-label="Owner">${ownerOpts(g.owner)}</select>${S.confirmDel===g.id?`<span class="row"><button class="btn btn-sm btn-danger" data-act="delGoal" data-id="${g.id}">Remove</button><button class="link" data-act="cancelDel">Keep</button></span>`:`<button class="iconbtn xs" data-act="askDelGoal" data-id="${g.id}" aria-label="Remove goal">${I('x',14)}</button>`}</div>`}).join('')||'<p class="empty">No goals yet. Add the first one below.</p>'}</div>
  <div class="addbar mt"><input id="add-goal" placeholder="Add a goal, then press Enter" aria-label="New goal" data-enter="addGoal" enterkeyhint="done"></div>
  <p class="hint">Past years are kept on the <button class="link" data-act="go" data-v="history">History</button> page.</p>`;
}

function rrow(r){const mc=msCount(r);const g=findGoal(r.goal);const draftQ=r.q!==curQ();const from=r.from&&rock(r.from);
  return `<div class="rrow">${draftQ?`<span class="pill rk-next">${qLabel(r.q)}</span>`:`<button class="pill rk-${r.status} pillbtn" data-act="cycleRock" data-id="${r.id}" title="Click to change status">${r.status==='done'?I('check',11):''}${RK[r.status]}</button>`}<div class="rr-tc"><button class="tlink rr-t" data-act="openRock" data-id="${r.id}">${esc(r.title)}</button>${g||from?`<div class="rr-sub">${g?`Serves: ${esc(g.text)}`:''}${g&&from?' · ':''}${from?`Carried over from ${qLabel(from.q)}`:''}</div>`:''}</div><span class="rr-ms">${mc.total?`${mc.done} of ${mc.total} milestones`:'No milestones yet'}</span><span class="lo">${av(r.owner)}<span>${esc(first(r.owner))}</span></span></div>`}
function vRocks(){
  const q=curQ();const cr=curRocks();const left=daysBetween(TODAY,qEnd(q));const good=cr.filter(r=>r.status!=='off').length;
  const comp=cr.filter(r=>r.type==='company');const ind=cr.filter(r=>r.type==='individual').sort((a,b)=>first(a.owner).localeCompare(first(b.owner)));
  const nx=D.rocks.filter(r=>r.q===nextQ(q));
  return `<header class="ph"><div><div class="eyebrow">EOS · ${qLabel(q)} · ${left>=0?left+' days left':'ended, time to close it out'}</div><h1>Rocks</h1><p class="sub">The few things that matter most this quarter.${cr.length?` ${good} of ${cr.length} are on track or done.`:''} Click a status to change it, or a Rock to see its milestones.</p></div><div class="ph-act">${isAdmin()&&cr.length?`<button class="btn btn-ghost" data-act="modal" data-k="closeQ">Close out ${qLabel(q)}</button>`:''}<button class="btn btn-primary" data-act="modal" data-k="rock">${I('plus',15)} Add a Rock</button></div></header>
  <h2 class="sh">Company Rocks <span class="n">${comp.length}</span></h2><div>${comp.map(rrow).join('')||'<p class="empty">No company Rocks yet.</p>'}</div>
  <h2 class="sh">Individual Rocks <span class="n">${ind.length}</span></h2><div>${ind.map(rrow).join('')||'<p class="empty">No individual Rocks yet.</p>'}</div>
  ${nx.length?`<h2 class="sh">Drafted for ${qLabel(nextQ(q))} <span class="n">${nx.length}</span></h2><div>${nx.map(rrow).join('')}</div>`:''}
  <p class="hint">Plan next quarter’s Rocks early with “Add a Rock.” Past quarters are kept on the <button class="link" data-act="go" data-v="history">History</button> page.</p>`;
}

function vScorecard(){
  const W=weeks();const act=D.metrics.filter(m=>!m.retired).sort((a,b)=>(a.sort||0)-(b.sort||0));const ret=D.metrics.filter(m=>m.retired);const L=W.length-1;
  return `<header class="ph"><div><div class="eyebrow">EOS · Weekly numbers</div><h1>Scorecard</h1><p class="sub">The handful of numbers that tell you how the week went, 13 weeks at a time. Click a box to type a number. Click a number’s name to change its owner or goal, or retire it.</p></div><button class="btn btn-primary" data-act="modal" data-k="metric">${I('plus',15)} Add a number</button></header>
  ${act.length?`<div class="legend"><span><i class="lg"></i>Hit the goal</span><span><i class="lg lg-miss"></i><b>White on red</b> means it missed</span><span><i class="lg lg-cur"></i>Last week, fill in now</span><span>A changed goal only applies from the week it starts</span></div>
  <div class="tablewrap sc-wrap"><table class="sc"><thead><tr><th class="sc-name" scope="col">Number</th><th scope="col">Owner</th><th scope="col">Goal</th>${W.map((w,i)=>`<th scope="col" class="wk ${i===L?'cur':''}">Week<br><span>${fmt(w,false)}</span></th>`).join('')}</tr></thead>
  <tbody>${act.map(m=>{const g=goalAt(m,W[L]);const gs=metricGoals(m);const lastFrom=gs.length>1?gs[gs.length-1].from:null;
    return `<tr><th scope="row" class="sc-name"><button class="tlink" data-act="editMetric" data-id="${m.id}">${esc(m.name)}</button>${m.how?`<div class="sc-how">${esc(m.how)}</div>`:''}</th><td><span class="lo">${av(m.owner)}<span>${esc(first(m.owner))}</span></span></td><td class="goal">${OPS[g.op]} ${g.goal}${esc(m.unit||'')}${lastFrom&&lastFrom>W[0]?`<span class="sc-gnote">since ${fmt(lastFrom,false)}</span>`:''}</td>${W.map((w,i)=>{const v=score(m,w);return `<td class="v ${cellCls(m,v,w)} ${i===L?'cur':''}"><input class="cell" inputmode="decimal" value="${v==null?'':esc(v)}" placeholder="–" aria-label="${esc(m.name)}, week ending ${fmt(w,false)}" data-change="metric" data-id="${m.id}" data-w="${w}"></td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`:'<p class="empty">No numbers yet. Add the first one with “Add a number.” Five to fifteen is the usual range.</p>'}
  ${ret.length?`<details class="donebox"><summary>Retired numbers <span class="n">${ret.length}</span></summary>${ret.map(m=>`<div class="trow"><span></span><div class="tmain"><span>${esc(m.name)}</span><span class="im">Owner ${esc(first(m.owner))}. Its past weeks are kept.</span></div><button class="link" data-act="restoreMetric" data-id="${m.id}">Bring it back</button></div>`).join('')}</details>`:''}`;
}
const cellCls=(m,v,w)=>{if(v==null||v===''||isNaN(v))return '';const g=goalAt(m,w);return meets(+v,g.op,g.goal)?'hit':'miss'};

function irow(i){const open=S.openIssue===i.id;const solved=i.status==='solved';const n=issueTasks(i).length;
  const lead=solved?`<span class="pri-done">${I('check',16)}</span>`:i.list==='weekly'?`<select class="prisel ${i.pri?'set':''}" data-change="pri" data-id="${i.id}" aria-label="Priority for ${esc(i.title)}">${[0,1,2,3].map(x=>`<option value="${x}" ${x===i.pri?'selected':''}>${x||'–'}</option>`).join('')}</select>`:`<span class="pri-lt" title="Long-term">LT</span>`;
  return `<div class="irow">${lead}<div><button class="tlink it" data-act="toggleIssue" data-id="${i.id}" aria-expanded="${open}">${esc(i.title)}</button><div class="im">Raised by ${esc(first(i.by))} · ${fmt(i.date,false)}${n?` · ${n} action${n===1?'':'s'}`:''}${solved?` · solved ${fmt(i.solvedOn,false)}`:''}</div>${solved&&i.decision&&!open?`<div class="idec"><b>Decided:</b> ${esc(i.decision)}</div>`:''}</div><button class="btn btn-sm btn-ghost" data-act="toggleIssue" data-id="${i.id}">${open?'Close':solved?'Open':'Work on it'}</button></div>${open?ipanel(i):''}`}
function ipanel(i){const dr=draft(i);const ts=issueTasks(i);const solved=i.status==='solved';
  return `<div class="solve">
    <label class="flabel" for="idt-${i.id}">Details</label><textarea id="idt-${i.id}" class="desc sm" data-live="idetail" data-id="${i.id}" placeholder="What’s going on? Add anything the team needs to know.">${esc(i.details)}</textarea>
    <div class="flabel">Actions <span class="n">${ts.length}</span></div>
    ${ts.map(t=>`<div class="srow ${t.status==='done'?'isdone':''}">${chk(t)}<button class="tlink" data-act="openTask" data-id="${t.id}">${esc(t.title)}</button>${av(t.owner)}${due(t)}</div>`).join('')||'<p class="im">No actions yet.</p>'}
    ${solved?'':`<div class="solve-f"><input id="ia-${i.id}" class="fin" placeholder="What needs to happen?" value="${esc(dr.title)}" data-live="idraft" data-f="title" data-id="${i.id}" data-enter="addAction" aria-label="New action" enterkeyhint="done"><select class="fin" data-change="idraft" data-f="owner" data-id="${i.id}" aria-label="Who does it">${ownerOpts(dr.owner)}</select><input type="date" class="fin" value="${dr.due}" data-change="idraft" data-f="due" data-id="${i.id}" aria-label="Due date"></div><div class="row"><button class="btn btn-ghost btn-sm" data-act="addAction" data-id="${i.id}">${I('plus',13)} Add action</button><span class="im">Actions become to-dos. The issue stays open until you mark it solved.</span></div>`}
    <label class="flabel" for="idc-${i.id}">What we decided</label><textarea id="idc-${i.id}" class="desc sm" data-live="idecision" data-id="${i.id}" placeholder="Write the decision so anyone can find it later">${esc(i.decision)}</textarea>
    <div class="row">${solved?`<button class="btn btn-ghost btn-sm" data-act="reopenIssue" data-id="${i.id}">Reopen</button>`:`<button class="btn btn-primary btn-sm" data-act="solveIssue" data-id="${i.id}">Mark solved</button><button class="btn btn-ghost btn-sm" data-act="moveIssue" data-id="${i.id}">${i.list==='weekly'?'Move to long-term':'Move to this week’s list'}</button>`}</div>
  </div>`}
const weeklyOpen=()=>D.issues.filter(i=>i.status==='open'&&i.list==='weekly').sort((a,b)=>(a.pri||9)-(b.pri||9)||a.date.localeCompare(b.date));
function vIssues(){
  const wk=weeklyOpen();const lt=D.issues.filter(i=>i.status==='open'&&i.list==='longterm');const solved=D.issues.filter(i=>i.status==='solved').sort((a,b)=>(b.solvedOn||'').localeCompare(a.solvedOn||''));const tab=S.issuesTab;
  const body=tab==='weekly'?`<div class="addbar"><input id="add-issue" placeholder="Add an issue, then press Enter" aria-label="New issue" data-enter="addIssue" data-list="weekly" enterkeyhint="done"></div>${wk.map(irow).join('')||'<div class="all-clear"><p><b>No open issues</b>Nothing to solve this week.</p></div>'}`
    :tab==='longterm'?`<p class="hint" style="margin:0 0 12px">Bigger questions parked for the quarterly or annual planning day.</p><div class="addbar"><input id="add-issue" placeholder="Add a long-term issue, then press Enter" aria-label="New long-term issue" data-enter="addIssue" data-list="longterm" enterkeyhint="done"></div>${lt.map(irow).join('')||'<p class="empty">Nothing parked.</p>'}`
    :solved.map(irow).join('')||'<p class="empty">Nothing solved yet.</p>';
  return `<header class="ph"><div><div class="eyebrow">EOS · Identify, discuss, solve</div><h1>Issues</h1><p class="sub">Anything in the way: a problem, an idea, a decision to make. In the weekly meeting, number the top three and work them in order. Write down what you decided before you mark one solved.</p></div></header>
  <div class="seg mb" role="group" aria-label="Show"><button aria-pressed="${tab==='weekly'}" data-act="itab" data-t="weekly">This week · ${wk.length}</button><button aria-pressed="${tab==='longterm'}" data-act="itab" data-t="longterm">Long-term · ${lt.length}</button><button aria-pressed="${tab==='solved'}" data-act="itab" data-t="solved">Solved · ${solved.length}</button></div>${body}`;
}

const STEPS=[['Segue',5,'Good news, one personal and one professional'],['Scorecard',5,'Each number is on or off. Misses go to Issues.'],['Rock review',5,'Each Rock is on track or off. Off goes to Issues.'],['Headlines',5,'Quick news about members and the team'],['To-do review',5,'To-dos since the last meeting: done or not done'],['IDS',60,'Identify, discuss and solve the top issues'],['Conclude',5,'New to-dos, who tells the team what, then rate the meeting']];
const dropBtn=(key,text)=>S.mt.dropped[key]?`<span class="added">${I('check',12)} In Issues</span>`:`<button class="btn btn-sm btn-ghost" data-act="drop" data-key="${key}" data-text="${esc(text)}">Add to Issues</button>`;
const todoBar=()=>`<div class="addbar mt"><select id="td-owner" class="bare" aria-label="Who">${ownerOpts(ME)}</select><input id="add-td" placeholder="Add a to-do, due in a week, then press Enter" aria-label="New to-do" data-enter="addTodo" enterkeyhint="done"></div>`;
const STEP_BODY=[
  ()=>`<p class="lead">Go around the room. Everyone shares one personal and one professional piece of good news from the past week.</p>`,
  ()=>{const W=weeks();const w=W[W.length-1];const ms=D.metrics.filter(m=>!m.retired);return `<p class="im">Week ending ${fmt(w,false)}.</p><div>${ms.map(m=>{const v=score(m,w);const g=goalAt(m,w);const has=v!=null;const ok=has&&meets(+v,g.op,g.goal);
    return `<div class="mrow">${av(m.owner)}<span>${esc(m.name)}</span><span class="mr-v"><span class="${has&&!ok?'missv':''}">${has?v+esc(m.unit||''):'Not entered'}</span> <span class="im">goal ${OPS[g.op]} ${g.goal}${esc(m.unit||'')}</span></span>${has&&!ok?dropBtn('m'+m.id,`${m.name} missed its goal`):`<span class="ok">${has?'On':''}</span>`}</div>`}).join('')||'<p class="im">No Scorecard numbers yet.</p>'}</div>`},
  ()=>`<div>${curRocks().map(r=>`<div class="mrow">${av(r.owner)}<span>${esc(r.title)}</span><select class="pill pill-sel rk-${r.status}" data-change="rockst" data-id="${r.id}" aria-label="Status of ${esc(r.title)}">${opts(RKNOW,r.status)}</select>${r.status==='off'?dropBtn('r'+r.id,`Rock off track: ${r.title}`):'<span></span>'}</div>`).join('')||'<p class="im">No Rocks this quarter yet.</p>'}</div>`,
  ()=>`<div>${S.mt.headlines.map(h=>`<div class="hrow">${av(h.by)}<span>${esc(h.text)}</span></div>`).join('')||'<p class="im">No headlines yet this week.</p>'}</div><div class="addbar mt"><select id="hl-by" class="bare" aria-label="Who">${ownerOpts(ME)}</select><input id="add-hl" placeholder="Add a headline, then press Enter" aria-label="Headline" data-enter="addHeadline" enterkeyhint="done"></div>`,
  ()=>{const tl=reviewList();const d=tl.filter(t=>t.status==='done').length;return `<p class="lead">${tl.length?`${d} of ${tl.length} done since the last meeting${D.meetings.length?` (${fmt(lastMeetingDate(),false)})`:''}. EOS aims for nine out of ten. Done ones drop off after today; open ones stay on the list.`:'No to-dos from last time.'}</p><div>${tl.map(t=>`<div class="trow ${t.status==='done'?'isdone':''}">${chk(t)}<div class="tmain"><span class="tt">${esc(t.title)}</span>${av(t.owner)}</div>${due(t)}</div>`).join('')}</div>${todoBar()}`},
  ()=>`<p class="lead">Number the top three, then work them in order. Add actions as you go, and write the decision before marking one solved.</p>${weeklyOpen().map(irow).join('')||'<p class="empty">No open issues.</p>'}<div class="addbar mt"><input id="add-issue" placeholder="Add an issue, then press Enter" aria-label="New issue" data-enter="addIssue" data-list="weekly" enterkeyhint="done"></div>${todoBar()}`,
  ()=>{const nt=D.tasks.filter(t=>t.newInMt);const r=Object.values(S.mt.ratings).map(Number).filter(Boolean);const avg=r.length?(r.reduce((a,b)=>a+b,0)/r.length).toFixed(1):null;
    return `<h3 class="dr-h">New to-dos from this meeting <span class="n">${nt.length}</span></h3>${nt.length?`<div>${nt.map(rowMine).join('')}</div>`:'<p class="im">None yet.</p>'}${todoBar()}
    <h3 class="dr-h">Cascading messages <span class="n">${S.mt.cascades.length}</span></h3><p class="im">What the rest of the team needs to hear, and who tells them. Each one becomes a to-do.</p>${S.mt.cascades.map(c=>`<div class="hrow">${av(c.by)}<span>${esc(c.text)}</span></div>`).join('')}<div class="addbar mt"><select id="cm-by" class="bare" aria-label="Who tells them">${ownerOpts(ME)}</select><input id="add-cm" placeholder="Add a message, then press Enter" aria-label="Message" data-enter="addCascade" enterkeyhint="done"></div>
    <h3 class="dr-h">Rate this meeting, 1 to 10</h3><div class="rate">${activePeople().map(p=>`<label class="rt">${av(p.id)}<span>${esc(p.name)}</span><select data-change="rate" data-id="${p.id}" class="fin sm" aria-label="${esc(p.name)}’s rating"><option value="">–</option>${[...Array(10)].map((_,i)=>`<option ${+S.mt.ratings[p.id]===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>`).join('')}</div><p class="lead">${avg?`Average so far: <b>${avg}</b>`:'Everyone gives a number. Anyone under 8 says why.'}</p>`}
];
const STEP_AREA=[null,'scorecard','rocks',null,null,'issues',null];
const stepBody=i=>isHidden(STEP_AREA[i])?`<p class="lead">${I('lock',15)} ${AREAS[STEP_AREA[i]]} ${STEP_AREA[i]==='issues'?'are':'is'} hidden for now while an admin works on ${STEP_AREA[i]==='issues'?'them':'it'}. Skip ahead.</p>${i===5?todoBar():''}`:STEP_BODY[i]();
function vMeeting(){const m=S.mt;
  if(!m.running)return `<header class="ph"><div><div class="eyebrow">EOS · Level 10 meeting</div><h1>Weekly meeting</h1><p class="sub">The same agenda every week. Your numbers, Rocks, to-dos and issues are already in it, so nobody prepares anything. Everything said is saved with the meeting.</p></div><button class="btn btn-primary" data-act="startMt">${I('play',13)} Start meeting</button></header>
  <h2 class="sh">Agenda <span class="n">90 minutes</span></h2><ol class="ag-list">${STEPS.map((s,i)=>`<li class="ag"><span class="ag-n">${i+1}</span><div><div class="ag-t">${s[0]}</div><div class="im">${s[2]}</div></div><span class="ag-m">${s[1]} min</span></li>`).join('')}</ol>
  ${D.meetings.length?`<h2 class="sh">Recent meetings</h2><div class="tablewrap"><table class="plain"><thead><tr><th>Date</th><th>Rating</th><th>To-dos made</th><th>Issues solved</th></tr></thead><tbody>${meetingsDesc().slice(0,3).map(meetRow).join('')}</tbody></table></div><p class="hint">Click a meeting to see everything from it. Every meeting is in <button class="link" data-act="go" data-v="history">History</button>.</p>`:''}`;
  const s=STEPS[m.step];
  return `<div class="mt-bar"><span class="eyebrow">Weekly meeting · in progress</span><span>Total <b id="mt-total">${clock(Date.now()-m.start)}</b> of 90:00</span><button class="btn btn-sm btn-ghost" data-act="endMt">End meeting</button></div>
  <div class="mt-grid"><nav class="mt-steps" aria-label="Agenda">${STEPS.map((x,i)=>`<button class="step ${i===m.step?'on':i<m.step?'past':''}" data-act="goStep" data-i="${i}" ${i===m.step?'aria-current="step"':''}><span class="ag-n">${i+1}</span><span>${x[0]}</span><span class="sm">${x[1]} min</span></button>`).join('')}</nav>
  <section class="mt-main"><div class="mt-head"><div><div class="eyebrow">Step ${m.step+1} of 7 · ${s[1]} minutes</div><h2 class="h2">${s[0]}</h2><p class="sub">${s[2]}</p></div><span class="timer" id="mt-step">${clock(Date.now()-m.stepStart)}</span></div>
  ${stepBody(m.step)}
  <div class="mt-nav">${m.step>0?`<button class="btn btn-ghost" data-act="goStep" data-i="${m.step-1}">Back</button>`:'<span></span>'}${m.step<6?`<button class="btn btn-primary" data-act="goStep" data-i="${m.step+1}">Next: ${STEPS[m.step+1][0]}</button>`:`<button class="btn btn-primary" data-act="endMt">End and save the meeting</button>`}</div></section></div>`;
}
const meetRow=x=>`<tr data-act="openMeeting" data-id="${x.id}" tabindex="0"><td>${fmtLong(x.date)}</td><td><b>${x.avg??'–'}</b></td><td>${(x.todos||[]).length}</td><td>${(x.solved||[]).length}</td></tr>`;

function vHistory(){
  const yrs=D.plans.filter(p=>p.status==='closed').sort((a,b)=>b.year-a.year);const solved=D.issues.filter(i=>i.status==='solved').length;const qs=closedQuarters();const vs=[...D.vtoVersions].sort((a,b)=>b.date.localeCompare(a.date));
  return `<header class="ph"><div><div class="eyebrow">EOS · Nothing gets deleted</div><h1>History</h1><p class="sub">Every past year, quarter, weekly meeting and saved Vision, kept for good. Closed quarters are locked. Fixing one takes a written reason, and the fix is shown here.</p></div></header>
  ${isHidden('plan')?'':`<h2 class="sh">Past years <span class="n">${yrs.length}</span></h2>
  ${yrs.map(p=>{const gs=goalsOf(p.year);const d=gs.filter(g=>g.status==='done').length;return `<section class="qcard"><header class="qc-h"><h3>${p.year}</h3><span class="qc-s"><b>${d} of ${gs.length}</b> goals done · target revenue ${esc(p.revenue||'–')} · profit ${esc(p.profit||'–')} · closed ${fmt(p.closedOn,false)} by ${esc(first(p.by))}</span></header>${gs.map(g=>`<div class="qrow"><span class="pill rk-${g.status}">${g.status==='done'?I('check',11):''}${RK[g.status]}</span><span>${esc(g.text)}</span><span class="lo">${av(g.owner)}<span>${esc(first(g.owner))}</span></span><span></span></div>`).join('')}</section>`}).join('')||'<p class="empty">No closed years yet.</p>'}`}
  ${isHidden('rocks')?'':`<h2 class="sh">Past quarters <span class="n">${qs.length}</span></h2>
  ${qs.map(q=>{const rs=D.rocks.filter(r=>r.q===q.id);const d=rs.filter(r=>r.status==='done').length;const ms=D.meetings.filter(m=>qOf(m.date)===q.id);
    return `<section class="qcard"><header class="qc-h"><h3>${qLabel(q.id)}</h3><span class="qc-s"><b>${d} of ${rs.length}</b> Rocks done · ${ms.length} meetings · average rating ${avgOf(ms)} · ${q.by?`closed ${fmt(q.closedOn,false)} by ${esc(first(q.by))}`:'imported from the planning doc'}</span></header>${rs.map(r=>`<div class="qrow"><span class="pill rk-${r.status}">${r.status==='done'?I('check',11):''}${RK[r.status]}</span><button class="tlink" data-act="openRock" data-id="${r.id}">${esc(r.title)}</button><span class="rr-ms">${r.closedMs?`${r.closedMs.done} of ${r.closedMs.total} milestones`:''}</span><span class="lo">${av(r.owner)}<span>${esc(first(r.owner))}</span></span></div>`).join('')}${(q.corrections||[]).map(c=>`<div class="corr"><b>Corrected ${fmt(c.date,false)} by ${esc(first(c.by))}:</b> “${esc(c.title)}” changed from ${RK[c.from]} to ${RK[c.to]}. Why: ${esc(c.why)}</div>`).join('')}</section>`}).join('')||'<p class="empty">No closed quarters yet. Close one from the Rocks page when it ends.</p>'}`}
  ${isHidden('meeting')?'':`<h2 class="sh">Weekly meetings <span class="n">${D.meetings.length}</span></h2>
  ${D.meetings.length?`<div class="tablewrap"><table class="plain"><thead><tr><th>Date</th><th>Rating</th><th>To-dos made</th><th>Issues solved</th></tr></thead><tbody>${meetingsDesc().map(meetRow).join('')}</tbody></table></div>`:'<p class="empty">No meetings saved yet.</p>'}`}
  ${isHidden('vision')?'':`<h2 class="sh">Saved Vision versions <span class="n">${vs.length}</span></h2>
  <div>${vs.map(v=>`<button class="vrow" data-act="openVersion" data-id="${v.id}"><span><b>${fmtLong(v.date)}</b> · ${esc(v.label)}</span><span class="im">${v.audience==='admins'?`<span class="chip chip-lock">${I('lock',11)} Admins only</span> `:''}saved by ${esc(first(v.by))}</span></button>`).join('')||'<p class="empty">No saved versions yet.</p>'}</div>`}
  ${isHidden('issues')?'':`<h2 class="sh">Solved issues</h2><p>${solved} solved, each with what was decided. <button class="link" data-act="histIssues">See them all</button></p>`}`;
}

function vTeam(){
  const adm=isAdmin();const act=D.people.filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name)),ina=D.people.filter(p=>!p.active);
  const row=p=>{const canEdit=adm||p.id===ME;return `<div class="tm">${av(p.id,'lg')}<div>${canEdit?`<input class="ed" value="${esc(p.name)}" data-live="pname" data-id="${p.id}" aria-label="Name">`:`<div class="nm">${esc(p.name)}</div>`}${adm?`<div class="addrs">${addrsOf(p).map(a=>`<span class="chip addr">${esc(a)}<button class="addr-x" data-act="rmAddr" data-id="${p.id}" data-a="${esc(a)}" aria-label="Remove ${esc(a)}" title="Remove this sign-in address">${I('x',11)}</button></span>`).join('')}<input class="addr-in" id="addr-${p.id}" placeholder="${addrsOf(p).length?'Add an address':'Add a sign-in address'}" data-enter="addAddr" data-id="${p.id}" aria-label="Add a sign-in address for ${esc(p.name)}" enterkeyhint="done"></div>`:`<div class="im">${addrsOf(p).length?esc(addrsOf(p).join(' · ')):'No sign-in address yet'}</div>`}<div class="im">${p.id===ME?'You · ':''}${p.lastLogin?(()=>{const[a,at]=p.lastLogin.split('|');return `Last signed in ${fmt(at.slice(0,10))} with ${esc(a)}`})():'Hasn’t signed in yet'}</div></div>${adm?`<input class="ed tm-s" value="${esc(p.seat||'')}" placeholder="Seat, e.g. Marketing" data-live="pseat" data-id="${p.id}" aria-label="Seat">`:`<span class="tm-s">${esc(p.seat||'')}</span>`}${p.active&&adm&&p.id!==ME?`<select class="fin sm" data-change="role" data-id="${p.id}" aria-label="Role for ${esc(p.name)}"><option ${p.role==='Admin'?'selected':''}>Admin</option><option ${p.role==='Member'?'selected':''}>Member</option></select>`:`<span class="tm-s">${p.active?esc(p.role):p.inactiveOn?'Inactive since '+fmt(p.inactiveOn,false):'Inactive'}</span>`}${adm&&p.id!==ME?(p.active?`<button class="link" data-act="deactivate" data-id="${p.id}">Deactivate</button>`:`<button class="link" data-act="reactivate" data-id="${p.id}">Reactivate</button>`):'<span></span>'}</div>`};
  return `<header class="ph"><div><div class="eyebrow">Settings</div><h1>Team</h1><p class="sub">Everyone who can use ${esc(CO())} HQ.</p></div></header>
  <div class="note">${I('users',18)}<span>Anyone with an <b>@${esc((CONFIG.domains||['yourcompany.com'])[0])}</b> Google account can sign in, and shows up here the first time they do. When someone leaves, an admin deactivates them: their open work goes to someone else, and their name stays on everything they did.</span></div>
  <div>${act.map(row).join('')}</div>
  ${adm?`<div class="addbar mt"><input id="add-person" placeholder="Add someone by first name, then press Enter" aria-label="New person’s first name" data-enter="addPerson" enterkeyhint="done"></div><p class="hint" style="margin-top:0">They can own tasks and Rocks right away. When they first sign in with Google, the app matches them by first name.</p>`:''}
  ${ina.length?`<details class="donebox archived-people"><summary>Archived <span class="n">${ina.length}</span> <span class="im">people who were deactivated. Their past work keeps their names.</span></summary><div>${ina.map(row).join('')}</div></details>`:''}
  ${adm?`<h2 class="sh">EOS pages</h2><p class="hint" style="margin-top:0">Hide a page from members while you work on it. They won’t see it in their menu, and none of it is sent to them. Admins always see every page.</p><div class="areas">${Object.entries(AREAS).map(([a,n])=>{const on=hiddenList().includes(a);return `<label class="area"><input type="checkbox" data-change="hideArea" data-a="${a}" ${on?'checked':''}><span class="area-n">${n}</span><span class="im">${on?`${I('lock',11)} Admins only`:'Everyone'}</span></label>`}).join('')}</div>`:''}
  <h2 class="sh">What each role can do</h2><div class="roles"><div><b>Member</b><p>Make projects and choose who sees them. Work in every project they’re on or that’s open to everyone. Add and edit tasks, Rocks, numbers, issues and the Vision, and run the weekly meeting.</p></div><div><b>Admin</b><p>Everything a member can do, plus see and manage every project, hide EOS pages while they’re being worked on, change roles, deactivate people and close out quarters and years.</p></div></div>`;
}

// ---------------------------------------------------------------------------
// Helpful links: every tool and page the team uses online, in one place
// ---------------------------------------------------------------------------
const LINK_GROUPS=['Team tools','For customers','Our websites'];
const linkHost=u=>{if(u.startsWith('/'))return location.host+u.replace(/\/$/,'');try{const x=new URL(u);return (x.host+x.pathname).replace(/\/$/,'')}catch{return u}};
function vLinks(){
  const ls=[...D.links].sort((a,b)=>(a.sort||0)-(b.sort||0)||(a.title||'').localeCompare(b.title||''));
  const gs=[...new Set(ls.map(l=>l.grp||'Other'))].sort((a,b)=>{const i=x=>{const n=LINK_GROUPS.indexOf(x);return n<0?99:n};return i(a)-i(b)||a.localeCompare(b)});
  return `<header class="ph"><div><div class="eyebrow">Resources</div><h1>Helpful links</h1><p class="sub">Everything the team uses online, in one place, with a line on what each one is for. Links open in a new tab.</p></div><button class="btn btn-primary" data-act="newLink">${I('plus',15)} Add a link</button></header>
  ${gs.map(g=>{const xs=ls.filter(l=>(l.grp||'Other')===g);return `<h2 class="sh">${esc(g)} <span class="n">${xs.length}</span></h2><div class="lkgrid">${xs.map(l=>`<div class="lk"><a class="lk-t" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title||linkHost(l.url))}${I('ext',14)}</a><div class="lk-u">${esc(linkHost(l.url||''))}</div>${l.about?`<p>${esc(l.about)}</p>`:''}<button class="link lk-e" data-act="editLink" data-id="${l.id}" aria-label="Edit ${esc(l.title)}">Edit</button></div>`).join('')}</div>`}).join('')||'<p class="empty">No links yet. Press “Add a link” to start the list.</p>'}`;
}
// A hidden page, for members: what it is and that it's coming. For admins: a note on top saying who can see it.
function vHidden(){return `<header class="ph"><div><div class="eyebrow">EOS</div><h1>${AREAS[S.view]}</h1></div></header><div class="note">${I('lock',18)}<span>An admin is still working on this page, so it’s hidden for now. It shows up here as soon as it’s ready.</span></div>`}
const hiddenBanner=v=>isAdmin()&&hiddenList().includes(v)?`<div class="note hidden-note">${I('lock',18)}<span><b>Only admins can see this page right now.</b> Members don’t see it in their menu, and none of it is sent to them.</span><button class="btn btn-sm btn-ghost" data-act="toggleHidden" data-a="${v}">Show it to everyone</button></div>`:'';
const VIEW={links:vLinks,mytasks:vMyTasks,projects:vProjects,project:vProject,vision:vVision,plan:vPlan,rocks:vRocks,scorecard:vScorecard,issues:vIssues,meeting:vMeeting,history:vHistory,team:vTeam};

// ---------------------------------------------------------------------------
// Drawers
// ---------------------------------------------------------------------------
function dTask(t){
  const subs=subsOf(t.id).sort(byDue);const parent=t.parent&&task(t.parent);const p=proj(t.project);const d=subs.filter(s=>s.status==='done').length;const iss=t.issue&&issue(t.issue);
  const crumb=parent?`<button class="link" data-act="openTask" data-id="${parent.id}">${I('back',14)} ${esc(parent.title)}</button>`:`<span class="crumb">${p?esc(p.name):t.todo?'Meeting to-do':t.rock?`${I('star',12)} Rock milestone`:'No project'}</span>`;
  return `<div class="scrim" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Task details" tabindex="-1">
  <div class="dr-top">${crumb}<span class="grow"></span><button class="btn btn-sm ${t.status==='done'?'btn-dark':'btn-ghost'}" data-act="toggleDone" data-id="${t.id}">${I('check',13)} ${t.status==='done'?'Done':'Mark done'}</button><button class="iconbtn" data-act="closeDrawer" aria-label="Close">${I('x')}</button></div>
  <div class="dr-body">
    <textarea id="d-title" class="dr-title" rows="1" data-live="title" data-change="refresh" data-id="${t.id}" aria-label="Task title">${esc(t.title)}</textarea>
    <dl class="fields">
      <dt>Status</dt><dd><select class="fin" data-change="tfield" data-f="status" data-id="${t.id}" aria-label="Status">${opts(ST,t.status)}</select></dd>
      <dt>Priority</dt><dd><select class="fin" data-change="tfield" data-f="priority" data-id="${t.id}" aria-label="Priority"><option value="" ${t.priority?'':'selected'}>None</option>${opts(PRI,String(t.priority||''))}</select></dd>
      <dt>Owner</dt><dd><select class="fin" data-change="towner" data-id="${t.id}" aria-label="Owner">${taskOwnerOpts(t)}</select></dd>
      <dt>Due date</dt><dd><input type="date" class="fin" value="${esc(t.due||'')}" data-change="tfield" data-f="due" data-id="${t.id}" aria-label="Due date"></dd>
      ${t.parent?'':`<dt>Project</dt><dd><select class="fin" data-change="tfield" data-f="project" data-id="${t.id}" aria-label="Project"><option value="">No project</option>${D.projects.filter(x=>!x.archived||x.id===t.project).map(x=>`<option value="${x.id}" ${x.id===t.project?'selected':''}>${esc(x.name||'Untitled project')}</option>`).join('')}</select></dd>
      ${isHidden('rocks')?'':`<dt>Rock</dt><dd><select class="fin" data-change="tfield" data-f="rock" data-id="${t.id}" aria-label="Linked Rock"><option value="">Not linked</option>${D.rocks.filter(r=>!isClosedQ(r.q)||r.id===t.rock).map(r=>`<option value="${r.id}" ${r.id===t.rock?'selected':''}>${esc(r.title)} (${qLabel(r.q)})</option>`).join('')}</select></dd>`}`}
    </dl>
    ${t.createdAt?`<p class="im">Added ${fmtLong(t.createdAt)}${t.createdBy?' by '+esc(first(t.createdBy)):''}${t.status==='done'&&t.doneAt?` · done ${esc(fmtLong(t.doneAt))}`:''}</p>`:''}
    ${iss?`<p class="im">Action from the issue <button class="link" data-act="openIssue" data-id="${iss.id}">${esc(iss.title)}</button></p>`:''}
    <label class="flabel" for="d-desc">Description</label>
    <textarea id="d-desc" class="desc" data-live="desc" data-id="${t.id}" placeholder="Add details, links or notes">${esc(t.desc)}</textarea>
    ${t.parent?'':`<h3 class="dr-h">Subtasks <span class="n">${d}/${subs.length}</span></h3><div>${subs.map(s=>`<div class="srow ${s.status==='done'?'isdone':''}">${chk(s)}<button class="tlink" data-act="openTask" data-id="${s.id}">${esc(s.title)}</button>${av(s.owner)}${due(s)}</div>`).join('')}<div class="subadd">${I('plus',15)}<input id="d-sub" placeholder="Add a subtask, then press Enter" aria-label="New subtask" data-enter="addSub" data-id="${t.id}" enterkeyhint="done"></div></div>`}
    ${commentsBox(t)}
  </div>
  <div class="dr-foot">${S.confirmDel===t.id?`<span>Delete this task${subs.length?' and its subtasks':''}?</span><button class="btn btn-sm btn-danger" data-act="delTask" data-id="${t.id}">Delete</button><button class="btn btn-sm btn-ghost" data-act="cancelDel">Keep it</button>`:`<button class="btn btn-sm btn-ghost" data-act="dupTask" data-id="${t.id}">${I('copy',14)} Duplicate</button><span class="grow"></span><button class="link danger" data-act="askDel" data-id="${t.id}">${I('trash',14)} Delete task</button>`}</div>
  </aside>`;
}
const linkify=s=>String(s||'').split(/(https?:\/\/[^\s<>"']+)/i).map((p,i)=>i%2?`<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p.replace(/^https?:\/\/(www\.)?/,'').slice(0,48))}${p.length>56?'…':''}</a>`:esc(p)).join('');
// Comments: the back-and-forth on a task. Anyone who can open the task can read and add them; only who wrote one can
// edit it, and they or an admin can delete it. Oldest first, with the box to write in at the bottom.
const commentsOf=id=>D.comments.filter(c=>c.task===id).sort((a,b)=>(a.at||'').localeCompare(b.at||''));
function when(iso){if(!iso)return'';const d=new Date(iso);if(isNaN(d))return'';const day=d.toLocaleDateString('en-CA');const tm=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});return (day===TODAY?'Today':fmt(day,false))+', '+tm}
function commentsBox(t){const cs=commentsOf(t.id);const dr=(S.cdraft||={})[t.id]||'';
  const one=c=>{const mine=c.by===ME;const edit=S.cedit===c.id;
    return `<div class="cm" id="cm-${c.id}">${av(c.by)}<div class="cm-main"><div class="cm-top"><b>${esc(first(c.by)||'Someone')}</b><span class="im">${when(c.at)}${c.edited?' · edited':''}</span>${!edit&&(mine||isAdmin())?`<span class="cm-act">${mine?`<button class="link" data-act="cEdit" data-id="${c.id}">Edit</button>`:''}${S.cdel===c.id?`<span>Delete it?</span><button class="link danger" data-act="cDel" data-id="${c.id}">Delete</button><button class="link" data-act="cKeep">Keep</button>`:`<button class="link" data-act="cAsk" data-id="${c.id}">Delete</button>`}</span>`:''}</div>
      ${edit?`<textarea id="c-edit" class="fin cm-in" rows="3" maxlength="5000" aria-label="Edit comment">${esc(c.body)}</textarea><div class="row"><button class="btn btn-sm btn-primary" data-act="cSave" data-id="${c.id}">Save</button><button class="btn btn-sm btn-ghost" data-act="cCancel">Cancel</button></div>`:`<div class="cm-body">${linkify(c.body)}</div>`}</div></div>`};
  return `<h3 class="dr-h">${I('chat',14)} Comments <span class="n">${cs.length||''}</span></h3><div class="cms">${cs.map(one).join('')||'<p class="im">No comments yet. Ask a question or leave an update here, and everyone on this task can see it.</p>'}</div>
  <div class="cm-new">${av(ME)}<textarea id="c-new" class="fin cm-in" rows="2" maxlength="5000" placeholder="Write a comment…" aria-label="Write a comment" data-live="cdraft" data-id="${t.id}">${esc(dr)}</textarea></div>
  <div class="cm-send"><span class="im">⌘ + Enter to send</span><button class="btn btn-sm btn-primary" data-act="cPost" data-id="${t.id}">Comment</button></div>`}
function postComment(id){const el=document.getElementById('c-new');const v=(el?.value||'').trim();if(!v)return;
  D.comments.push({id:uid('c'),task:id,by:ME,body:v.slice(0,5000),at:new Date().toISOString(),edited:null});delete S.cdraft[id];renderDrawer();renderMain();
  document.getElementById('c-new')?.focus();const box=document.querySelector('.cms');if(box)box.lastElementChild?.scrollIntoView({block:'nearest'})}
// A deleted task's comments go with it on the server; here they're simply dropped, never sent as deletions.
function dropComments(ids){const gone=D.comments.filter(c=>ids.includes(c.task));D.comments=D.comments.filter(c=>!ids.includes(c.task));gone.forEach(c=>SNAP.comments?.delete(c.id))}
function dRock(r){
  const closed=isClosedQ(r.q);const ms=milestones(r).sort(byDue);const d=ms.filter(t=>t.status==='done').length;const g=findGoal(r.goal);const qrec=D.quarters.find(x=>x.id===r.q);
  const msRows=ms.map(t=>`<div class="srow ${t.status==='done'?'isdone':''}">${chk(t)}<button class="tlink" data-act="openTask" data-id="${t.id}">${esc(t.title)}</button>${av(t.owner)}${due(t)}</div>`).join('');
  const top=`<div class="scrim" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Rock details" tabindex="-1"><div class="dr-top"><span class="crumb">${I('star',12)} ${r.type==='company'?'Company Rock':'Individual Rock'} · ${qLabel(r.q)}${closed?' · closed':r.q!==curQ()?' · drafted early':''}</span><span class="grow"></span><button class="iconbtn" data-act="closeDrawer" aria-label="Close">${I('x')}</button></div>`;
  if(closed){
    const cs=(qrec?.corrections||[]).filter(c=>c.rockId===r.id);
    return top+`<div class="dr-body"><h2 class="dr-title">${esc(r.title)}</h2>
    <div class="lock">${I('lock',16)}<span>${qLabel(r.q)} is closed, so this Rock is locked. That keeps the quarter’s score honest.${isAdmin()?' If the result was recorded wrong, correct it below and say why.':' If the result is wrong, ask an admin to correct it.'}</span></div>
    <dl class="fields"><dt>Result</dt><dd>${rpill(r)}</dd><dt>Owner</dt><dd><span class="lo">${av(r.owner)}<span>${esc(first(r.owner))}</span></span></dd>${g?`<dt>Served goal</dt><dd>${esc(g.text)}</dd>`:''}<dt>At close</dt><dd>${r.closedMs?`${r.closedMs.done} of ${r.closedMs.total} milestones done`:'–'}</dd></dl>
    ${r.desc?`<p>${esc(r.desc)}</p>`:''}
    ${ms.length?`<h3 class="dr-h">Milestones that stayed with it <span class="n">${d}/${ms.length}</span></h3><div>${msRows}</div>`:''}
    ${cs.map(c=>`<div class="corr"><b>Corrected ${fmt(c.date,false)} by ${esc(first(c.by))}:</b> ${RK[c.from]} to ${RK[c.to]}. Why: ${esc(c.why)}</div>`).join('')}
    </div>${isAdmin()?`<div class="dr-foot">${S.correcting===r.id?`<div style="display:flex;flex-direction:column;gap:8px;width:100%"><label class="flabel" for="corr-to">Correct result to</label><select id="corr-to" class="fin">${opts({done:'Done',missed:'Not done'},r.status==='done'?'missed':'done')}</select><label class="flabel" for="corr-why">Why</label><textarea id="corr-why" class="desc sm" placeholder="What was recorded wrong, and how you know"></textarea><div class="row"><button class="btn btn-primary btn-sm" data-act="saveCorrection" data-id="${r.id}">Save correction</button><button class="link" data-act="cancelCorrection">Cancel</button></div></div>`:`<button class="link" data-act="correctRock" data-id="${r.id}">Correct the record</button>`}</div>`:''}</aside>`;
  }
  const P=curPlan();
  return top+`<div class="dr-body">
    <textarea id="d-title" class="dr-title" rows="1" data-live="rtitle" data-change="refresh" data-id="${r.id}" aria-label="Rock">${esc(r.title)}</textarea>
    <dl class="fields">
      <dt>Status</dt><dd><select class="fin" data-change="rfield" data-f="status" data-id="${r.id}" aria-label="Status">${opts(RKNOW,r.status)}</select></dd>
      <dt>Owner</dt><dd><select class="fin" data-change="rfield" data-f="owner" data-id="${r.id}" aria-label="Owner">${ownerOpts(r.owner)}</select></dd>
      <dt>Type</dt><dd><select class="fin" data-change="rfield" data-f="type" data-id="${r.id}" aria-label="Type">${opts({company:'Company',individual:'Individual'},r.type)}</select></dd>
      ${isHidden('plan')?'':`<dt>Serves goal</dt><dd><select class="fin" data-change="rfield" data-f="goal" data-id="${r.id}" aria-label="1-Year goal"><option value="">None</option>${goalsOf(P.year).map(x=>`<option value="${x.id}" ${x.id===r.goal?'selected':''}>${esc(x.text)}</option>`).join('')}</select></dd>`}
      <dt>Due</dt><dd>${fmtLong(qEnd(r.q))}, the end of the quarter</dd>
    </dl>
    ${r.from&&rock(r.from)?`<p class="im">Carried over from ${qLabel(rock(r.from).q)}. <button class="link" data-act="openRock" data-id="${esc(r.from)}">See the original</button></p>`:''}
    <label class="flabel" for="d-desc">What done looks like</label>
    <textarea id="d-desc" class="desc" data-live="rdesc" data-id="${r.id}" placeholder="Describe the finish line, so anyone can tell whether it’s done">${esc(r.desc)}</textarea>
    <h3 class="dr-h">Milestones <span class="n">${d}/${ms.length}</span></h3>
    <p class="im">Tasks linked to this Rock. Any task in any project can be linked from the task itself.</p>
    ${HIDDEN.ms[r.id]?`<p class="im">${I('lock',12)} Plus ${HIDDEN.ms[r.id].total} in private projects you’re not on, ${HIDDEN.ms[r.id].done} of them done.</p>`:''}
    <div>${msRows}<div class="subadd">${I('plus',15)}<input id="d-sub" placeholder="Add a milestone, then press Enter" aria-label="New milestone" data-enter="addMilestone" data-id="${r.id}" enterkeyhint="done"></div></div>
  </div>
  <div class="dr-foot">${S.confirmDel===r.id?`<span>Delete this Rock? Its tasks stay.</span><button class="btn btn-sm btn-danger" data-act="delRock" data-id="${r.id}">Delete</button><button class="btn btn-sm btn-ghost" data-act="cancelDel">Keep it</button>`:`<button class="link danger" data-act="askDel" data-id="${r.id}">${I('trash',14)} Delete Rock</button>`}</div>
  </aside>`;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
const fld=(label,ctrl)=>`<label class="mf"><span>${label}</span>${ctrl}</label>`;
const MODALS={
  field:{title:()=>{const d=S.fdraft;return !d.type?'Add a column':d.id?`Edit “${esc(d.name||'column')}”`:`New ${FTYPES[d.type].label.toLowerCase()} column`},
    get submit(){const d=S.fdraft;return d?.type?(d.id?'Save':'Create'):null},
    body:()=>{const d=S.fdraft;
      if(!d.type)return `<p class="im">Choose what goes in it. Everyone on this project sees the column and can fill it in.</p><div class="ftypes">${Object.entries(FTYPES).map(([k,x])=>`<button type="button" class="ftype" data-act="fieldType" data-t="${k}">${I(x.icon,18)}<span><b>${x.label}</b><span class="im">${x.sub}</span></span></button>`).join('')}</div><div class="m-actions"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button></div>`;
      const ph={select:'Stage, Vendor, Studio area…',number:'Budget, Hours, Count…',text:'Notes, Link, Contact…'}[d.type];
      return `${d.id?`<p class="im">${I(FTYPES[d.type].icon,13)} ${FTYPES[d.type].label} column</p>`:`<button type="button" class="link fback" data-act="fieldBack">${FTYPES[d.type].label} · change type</button>`}${fld('Column name',`<input class="fin" name="name" required maxlength="60" value="${esc(d.name)}" data-live="fdraft" data-k="name" placeholder="${ph}">`)}
      ${d.type==='select'?`<h3>Options</h3><div class="fopts">${d.opts.map((o,i)=>`<div class="fopt"><button type="button" class="fdot" style="background:${o.color}" data-act="optColor" data-o="${i}" aria-label="Change the color of ${esc(o.name||'option '+(i+1))}" title="Change color"></button><input class="fin" value="${esc(o.name)}" placeholder="Option ${i+1}" maxlength="60" data-live="fdraft" data-o="${i}" data-enter="optAdd" aria-label="Option ${i+1}"><button type="button" class="iconbtn xs" data-act="optDel" data-o="${i}" aria-label="Remove ${esc(o.name||'option '+(i+1))}" title="Remove">${I('x',14)}</button></div>`).join('')}<button type="button" class="link fadd" data-act="optAdd">${I('plus',14)} Add option</button></div>`:''}`},
    save:()=>{const d=S.fdraft,p=proj(S.projectId);const name=d.name.trim();if(!name){toast('Give the column a name');return}
      let opts=null;if(d.type==='select'){opts=d.opts.map(o=>({...o,name:o.name.trim()})).filter(o=>o.name);if(!opts.length){toast('Add at least one option');return}}
      const f={id:d.id||uid('f'),name,type:d.type,...(opts?{opts}:{})};const fs=fieldsOf(p);p.fields=d.id?fs.map(x=>x.id===d.id?f:x):[...fs,f];
      // An option that was removed is cleared from the tasks that had it.
      if(opts){const keep=new Set(opts.map(o=>o.id));D.tasks.forEach(t=>{const v=t.extra?.[f.id];if(t.project===p.id&&v!=null&&!keep.has(v)){const x={...t.extra};delete x[f.id];t.extra=Object.keys(x).length?x:null}})}
      S.modal=null;S.fdraft=null;render();toast(d.id?'Column saved':`“${name}” added. Click a cell to fill it in.`)}},
  editProject:{title:'Edit project',submit:'Save',body:()=>{const p=proj(S.projectId);const open=projStats(p).open.length;const who=D.people.filter(x=>(x.active||x.id===p.owner)&&canSeeP(p,x.id)).sort((a,b)=>a.name.localeCompare(b.name));return fld('Name',`<input class="fin" name="name" required value="${esc(p.name)}">`)+fld('Owner',`<select class="fin" name="owner">${who.map(x=>`<option value="${x.id}" ${x.id===p.owner?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`)+(isPrivate(p)?'<p class="im">Only people on this project can own it. Add someone with Share first.</p>':'')+fld('Due date (optional)',`<input class="fin" type="date" name="due" value="${esc(p.due||'')}">`)+fld('What it’s for',`<textarea class="fin" name="desc" rows="3">${esc(p.desc)}</textarea>`)+(p.archived||!canManage(p)?'':`<div class="mdanger">${open?`<span>${open} task${open===1?' is':'s are'} still open.</span>`:'<span>Every task is done.</span>'}<button type="button" class="link danger" data-act="archiveProject">Archive this project</button></div>`)},
    save:f=>{const p=proj(S.projectId);p.name=f.get('name').trim();p.owner=f.get('owner');p.due=f.get('due')||null;p.desc=f.get('desc').trim();S.modal=null;render();toast('Saved')}},
  share:{title:()=>`Who can see “${esc(proj(S.projectId)?.name||'this project')}”`,closeOnly:true,wide:true,body:()=>{const p=proj(S.projectId);const mg=canManage(p);const priv=isPrivate(p);
    const ms=membersOf(p.id).sort((a,b)=>(a.level==='manage'?0:1)-(b.level==='manage'?0:1)||first(a.person).localeCompare(first(b.person)));const out=activePeople().filter(x=>!memberOf(p.id,x.id));const mgrs=managersOf(p).map(m=>esc(first(m.person)));
    const radio=(v,label,sub)=>`<label class="vis-opt ${(p.visibility||'everyone')===v?'on':''}"><input type="radio" name="vis" value="${v}" ${(p.visibility||'everyone')===v?'checked':''} ${mg?'':'disabled'} data-change="pvis"><span><b>${label}</b><span class="im">${sub}</span></span></label>`;
    return `<div class="vis">${radio('members','Only people on this project','It shows up in their menu. Nobody else sees it, apart from admins.')}${radio('everyone',`Everyone at ${esc(CO())}`,'Anyone on the team can open it and work in it.')}</div>
    <h3>People on this project <span class="n">${ms.length}</span></h3>
    <div>${ms.map(m=>{const x=person(m.person);const nm=esc(first(m.person));return `<div class="mem">${av(m.person)}<span class="mem-n">${nm}${m.person===ME?' (you)':''}${x&&!x.active?' <span class="im">(archived)</span>':''}${m.person===p.owner?' <span class="im">· owns it</span>':''}</span>${mg?`<select class="fin sm" data-change="plevel" data-id="${m.id}" aria-label="What ${nm} can do">${opts({manage:'Can manage',edit:'Can edit'},m.level)}</select><button type="button" class="iconbtn xs" data-act="pRemove" data-id="${m.id}" aria-label="Remove ${nm}" title="Remove from this project">${I('x',14)}</button>`:`<span class="im">${m.level==='manage'?'Can manage':'Can edit'}</span>`}</div>`}).join('')||'<p class="im">Nobody yet.</p>'}</div>
    ${mg?(out.length?`<div class="mem-add"><select id="mem-who" class="fin" aria-label="Person to add">${out.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button type="button" class="btn btn-sm btn-primary" data-act="pAdd">${I('plus',13)} Add</button></div>`:'<p class="im">Everyone on the team is on this project.</p>'):`<p class="im">Only people who manage this project can change this.${mgrs.length?` Ask ${mgrs.join(' or ')}.`:''}</p>`}
    <p class="im mem-legend"><b>Can manage:</b> change who sees it, add and remove people, archive it. <b>Can edit:</b> add and change tasks.${priv?' Admins can always see private projects.':''}</p>`}},
  saveVersion:{title:'Save a version of the Vision',submit:'Save version',body:()=>fld('Name it (optional)','<input class="fin" name="label" placeholder="e.g. Q1 planning day">')+fld('Who can see it',`<select class="fin" name="audience">${opts({everyone:'Everyone',admins:'Admins only'},'everyone')}</select>`)+'<p class="im">An admins-only version never reaches members. Use it for a draft you’re not ready to share.</p>',
    save:f=>{S.modal=null;renderModal();pushVersion(f.get('audience'),f.get('label').trim())}},
  rock:{title:'Add a Rock',submit:'Add Rock',body:()=>{const q=curQ();return fld('The Rock','<input class="fin" name="title" required placeholder="e.g. Launch the spring intro offer">')+fld('Owner',`<select class="fin" name="owner">${ownerOpts(ME)}</select>`)+fld('Type',`<select class="fin" name="type">${opts({company:'Company Rock',individual:'Individual Rock'},'company')}</select>`)+fld('Quarter',`<select class="fin" name="q"><option value="${q}">${qLabel(q)} (this quarter)</option><option value="${nextQ(q)}">${qLabel(nextQ(q))} (draft it early)</option></select>`)+(isHidden('plan')?'':fld('Serves which 1-Year goal',`<select class="fin" name="goal"><option value="">None</option>${goalsOf(curPlan().year).map(g=>`<option value="${g.id}">${esc(g.text)}</option>`).join('')}</select>`))+fld('What done looks like','<textarea class="fin" name="desc" rows="3"></textarea>')},
    save:f=>{const r={id:uid('r'),q:f.get('q'),goal:f.get('goal')||null,title:f.get('title').trim(),owner:f.get('owner'),type:f.get('type'),status:'on',desc:f.get('desc').trim(),from:null,closedMs:null};D.rocks.push(r);S.modal=null;render();toast(r.q===curQ()?'Rock added':`Rock drafted for ${qLabel(r.q)}`)}},
  closeQ:{title:()=>`Close out ${qLabel(curQ())}`,submit:'Close the quarter',wide:true,body:()=>{const q=curQ();const nx=qLabel(nextQ(q));const drafts=D.rocks.filter(r=>r.q===nextQ(q)).length;
    return `<p class="im">Score each Rock as done or not done. Tick “carry over” for anything that continues into ${nx}; its unfinished milestones move with it. After you close, ${qLabel(q)} is locked and saved in History.${drafts?` ${drafts} Rock${drafts===1?'':'s'} already drafted for ${nx} become active.`:''}</p>`+curRocks().map(r=>{const ms=milestones(r);const open=ms.filter(t=>t.status!=='done').length;return `<div class="cq"><div class="cq-t">${esc(r.title)} <span class="im">· ${esc(first(r.owner))} · ${ms.length-open} of ${ms.length} milestones</span></div><div class="row"><select class="fin sm" name="res_${r.id}" aria-label="Result for ${esc(r.title)}"><option value="done" ${r.status==='done'?'selected':''}>Done</option><option value="missed" ${r.status!=='done'?'selected':''}>Not done</option></select><label class="cq-c"><input type="checkbox" name="carry_${r.id}"> Carry over into ${nx}${open?` with ${open} open milestone${open===1?'':'s'}`:''}</label></div></div>`}).join('')},
    save:f=>{const cur=curQ(),nx=nextQ(cur);if(isClosedQ(cur))return;let carried=0;
      curRocks().forEach(r=>{const was=r.status;const ms=milestones(r);r.closedMs={done:ms.filter(t=>t.status==='done').length,total:ms.length};r.status=f.get('res_'+r.id);
        if(r.status==='missed'&&f.get('carry_'+r.id)){const nr={id:uid('r'),q:nx,goal:r.goal,title:r.title,owner:r.owner,type:r.type,status:was==='off'?'off':'on',desc:r.desc,from:r.id,closedMs:null};D.rocks.push(nr);ms.filter(t=>t.status!=='done').forEach(t=>t.rock=nr.id);carried++}});
      D.quarters.push({id:cur,closedOn:TODAY,by:ME,corrections:[]});setSetting('quarter',nx);S.modal=null;renderModal();go('history');
      toast(`${qLabel(cur)} is closed and locked in History.${carried?` ${carried} Rock${carried===1?'':'s'} carried into ${qLabel(nx)}.`:''}`)}},
  closeYear:{title:()=>`Close out ${curPlan().year}`,submit:'Close the year',wide:true,body:()=>{const P=curPlan();return `<p class="im">Score each goal for ${P.year}. Tick “carry over” for anything that continues into ${P.year+1}. ${P.year} is then saved in History, and ${P.year+1} starts with the goals you carried. Revenue, profit and measurables for ${P.year+1} start blank.</p>`+goalsOf(P.year).map(g=>`<div class="cq"><div class="cq-t">${esc(g.text)} <span class="im">· ${esc(first(g.owner))}</span></div><div class="row"><select class="fin sm" name="res_${g.id}" aria-label="Result"><option value="done" ${g.status==='done'?'selected':''}>Done</option><option value="missed" ${g.status!=='done'?'selected':''}>Not done</option></select><label class="cq-c"><input type="checkbox" name="carry_${g.id}"> Carry into ${P.year+1}</label></div></div>`).join('')},
    save:f=>{const P=curPlan();if(P.status!=='open')return;const ny=P.year+1;let n=0;goalsOf(P.year).forEach((g,i)=>{g.status=f.get('res_'+g.id);if(g.status==='missed'&&f.get('carry_'+g.id)){D.goals.push({id:uid('g'),year:ny,text:g.text,owner:g.owner,status:'on',from:g.id,sort:i});n++}});
      P.status='closed';P.closedOn=TODAY;P.by=ME;if(!D.plans.some(p=>p.year===ny))D.plans.push({id:String(ny),year:ny,status:'open',revenue:'',profit:'',measurables:'',closedOn:null,by:null});S.modal=null;renderModal();go('plan');toast(`${P.year} is saved in History. ${ny} has started with ${n} carried goal${n===1?'':'s'}.`)}},
  metric:{title:'Add a number',submit:'Add number',body:()=>fld('What you measure','<input class="fin" name="name" required placeholder="e.g. Sales calls booked">')+fld('How it’s counted','<input class="fin" name="how" placeholder="e.g. From the CRM, Monday to Sunday">')+fld('Owner',`<select class="fin" name="owner">${ownerOpts(ME)}</select>`)+fld('Good means',`<select class="fin" name="op"><option value=">=">At least the goal</option><option value="<=">At most the goal</option></select>`)+fld('Goal','<input class="fin" name="goal" required inputmode="decimal" placeholder="e.g. 40">')+fld('Shown as',`<select class="fin" name="unit"><option value="">A count</option><option value="%">A percent</option></select>`),
    save:f=>{const g=parseFloat(f.get('goal'));if(isNaN(g)){toast('Type the goal as a number, like 40');return}D.metrics.push({id:uid('m'),name:f.get('name').trim(),how:f.get('how').trim(),owner:f.get('owner'),unit:f.get('unit'),retired:0,goals:[{from:'0000-01-01',op:f.get('op'),goal:g}],sort:D.metrics.length});S.modal=null;render();toast('Number added')}},
  editMetric:{title:'Edit number',submit:'Save',body:()=>{const m=D.metrics.find(x=>x.id===S.marg);const W=weeks();const g=goalAt(m,W[W.length-1]);
    return fld('What you measure',`<input class="fin" name="name" required value="${esc(m.name)}">`)+fld('How it’s counted',`<input class="fin" name="how" value="${esc(m.how)}">`)+fld('Owner',`<select class="fin" name="owner">${ownerOpts(m.owner)}</select>`)+fld('Good means',`<select class="fin" name="op">${opts({'>=':'At least the goal','<=':'At most the goal'},g.op)}</select>`)+fld('Goal',`<input class="fin" name="goal" required inputmode="decimal" value="${esc(g.goal)}">`)+fld('If the goal changes, it counts from the week ending',`<select class="fin" name="from">${W.map((w,i)=>`<option value="${w}" ${i===W.length-1?'selected':''}>${fmtLong(w)}</option>`).join('')}</select>`)+`<p class="im">Weeks before that keep the goal they had, so past colors don’t change.</p><div class="mdanger"><span>No longer tracking this?</span><button type="button" class="link danger" data-act="retireMetric" data-id="${m.id}">Retire this number</button></div>`},
    save:f=>{const m=D.metrics.find(x=>x.id===S.marg);const goal=parseFloat(f.get('goal'));if(isNaN(goal)){toast('Type the goal as a number, like 40');return}const op=f.get('op'),from=f.get('from');const W=weeks();const cur=goalAt(m,W[W.length-1]);
      m.name=f.get('name').trim();m.how=f.get('how').trim();m.owner=f.get('owner');
      if(cur.goal!==goal||cur.op!==op){const gs=metricGoals(m).filter(x=>x.from<from);if(!gs.length)gs.push({from:'0000-01-01',op:cur.op,goal:cur.goal});gs.push({from,op,goal});m.goals=gs}
      S.modal=null;render();toast('Saved')}},
  deactivate:{title:()=>`Deactivate ${esc(first(S.marg))}`,submit:'Deactivate and hand over',body:()=>{const id=S.marg;const c=handoverCounts(id);const others=activePeople().filter(p=>p.id!==id);
    return `<p class="im">${esc(first(id))} keeps their name on everything they already did. Their open work moves to the person you pick:</p><ul>${c.map(([n,l])=>`<li><b>${n}</b> ${l}</li>`).join('')||'<li>Nothing open</li>'}</ul>`+fld('Hand it all to',`<select class="fin" name="to">${others.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`)+`<p class="im">You can reassign single items afterwards.</p>`+(()=>{const p=person(id);const as=addrsOf(p);if(!as.length)return '';return `<h3>Their sign-in addresses</h3><p class="im">Shared studio inboxes usually go to whoever does the job next.</p>`+as.map((a,i)=>`<div class="cq"><div class="cq-t">${esc(a)}</div><select class="fin sm" name="addr_${i}" aria-label="What happens to ${esc(a)}">${opts({free:'Free it up for whoever’s next',move:'Move it to the person taking over',off:'Turn it off with them'},sharedInbox(p,a)?'free':'off')}</select></div>`).join('')})()},
    save:f=>{const id=S.marg,to=f.get('to');const leaving=person(id);const as=addrsOf(leaving);const keep=[],give=[];as.forEach((a,i)=>{const c=f.get('addr_'+i)||'off';if(c==='off')keep.push(a);else if(c==='move')give.push(a)});if(!to){toast('Pick who takes over');return}D.tasks.forEach(t=>{if(t.owner===id&&t.status!=='done'){t.owner=to;const tp=taskProj(t);if(tp&&!canSeeP(tp,to))addMember(tp,to)}});D.projects.forEach(p=>{if(p.owner===id&&!p.archived){p.owner=to;if(!canSeeP(p,to))addMember(p,to,'manage')}});D.rocks.forEach(r=>{if(r.owner===id&&!isClosedQ(r.q))r.owner=to});D.metrics.forEach(m=>{if(m.owner===id&&!m.retired)m.owner=to});goalsOf(curPlan().year).forEach(g=>{if(g.owner===id)g.owner=to});
      const p=person(id);setAddrs(p,keep);if(give.length&&to){const t=person(to);setAddrs(t,[...addrsOf(t),...give])}p.active=0;p.inactiveOn=TODAY;S.modal=null;render();toast(`${p.name} is inactive. Their open work is now ${first(to)}’s.${give.length?` ${give.join(', ')} moved too.`:''}`)}},
  link:{title:()=>S.marg?'Edit link':'Add a link',submit:'Save',body:()=>{const l=D.links.find(x=>x.id===S.marg)||{};const gs=[...new Set([...LINK_GROUPS,...D.links.map(x=>x.grp).filter(Boolean)])];
    return fld('Name',`<input class="fin" name="title" required value="${esc(l.title)}" placeholder="e.g. Shared drive">`)+fld('Address',`<input class="fin" name="url" required value="${esc(l.url)}" placeholder="https://drive.google.com" inputmode="url" autocomplete="off">`)+fld('What it’s for',`<textarea class="fin" name="about" rows="3" placeholder="One line: what it does and who signs in">${esc(l.about)}</textarea>`)+fld('Section',`<input class="fin" name="grp" list="lk-groups" value="${esc(l.grp||'Team tools')}"><datalist id="lk-groups">${gs.map(g=>`<option value="${esc(g)}">`).join('')}</datalist>`)+(l.id?`<div class="mdanger"><span>Not needed any more?</span><button type="button" class="link danger" data-act="delLink" data-id="${l.id}">Remove this link</button></div>`:'')},
    save:f=>{let url=f.get('url').trim();if(!/^[a-z]+:/i.test(url)&&!url.startsWith('/'))url='https://'+url;if(!/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(url)){toast('That address doesn’t look right. Start it with https://');return}
      const v={title:f.get('title').trim(),url,about:f.get('about').trim(),grp:f.get('grp').trim()||'Other'};const l=D.links.find(x=>x.id===S.marg);
      if(l)Object.assign(l,v);else D.links.push({id:uid('l'),...v,sort:0,createdBy:ME,createdAt:TODAY});S.modal=null;render();toast(l?'Saved':'Link added')}},
  parentDone:{title:'Subtasks are still open',body:()=>{const t=task(S.marg);const open=subsOf(t.id).filter(s=>s.status!=='done');
    return `<p>“${esc(t.title)}” has ${open.length} open subtask${open.length===1?'':'s'}:</p><ul>${open.map(s=>`<li>${esc(s.title)} · ${esc(first(s.owner))}${isOD(s)?' · <b>overdue</b>':''}</li>`).join('')}</ul><div class="m-actions"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button type="button" class="btn btn-ghost" data-act="parentOnly">Only this task</button><button type="button" class="btn btn-primary" data-act="parentAll">Mark them all done</button></div>`}},
  meetingRec:{title:()=>{const m=D.meetings.find(x=>x.id===S.marg);return `Weekly meeting, ${fmtLong(m.date)}`},closeOnly:true,wide:true,body:()=>{const m=D.meetings.find(x=>x.id===S.marg);const rs=Object.entries(m.ratings||{});const L=(a)=>a||[];
    return `<p class="im">Average rating <b>${m.avg??'–'}</b>${rs.length?' · '+rs.map(([k,v])=>`${esc(first(k))} ${v}`).join(' · '):''}</p>
    <h3>Headlines</h3>${L(m.headlines).length?`<ul>${m.headlines.map(h=>`<li>${esc(first(h.by))}: ${esc(h.text)}</li>`).join('')}</ul>`:'<p class="im">None recorded.</p>'}
    <h3>To-dos made</h3>${L(m.todos).length?`<ul>${m.todos.map(x=>`<li>${esc(x.title)} · ${esc(first(x.owner))}</li>`).join('')}</ul>`:'<p class="im">None.</p>'}
    <h3>Issues solved</h3>${L(m.solved).length?`<ul>${m.solved.map(x=>`<li><b>${esc(x.title)}.</b> Decided: ${esc(x.decision||'not written down')}</li>`).join('')}</ul>`:'<p class="im">None.</p>'}
    <h3>Cascading messages</h3>${L(m.cascades).length?`<ul>${m.cascades.map(c=>`<li>${esc(first(c.by))} tells the team: ${esc(c.text)}</li>`).join('')}</ul>`:'<p class="im">None.</p>'}`}},
  vtoVersion:{title:()=>{const v=D.vtoVersions.find(x=>x.id===S.marg);return `Vision, ${fmtLong(v.date)}`},closeOnly:true,wide:true,body:()=>{const v=D.vtoVersions.find(x=>x.id===S.marg);const s=Object.assign(EMPTY_VTO(),v.snap||{});const ty=Object.assign(EMPTY_VTO().threeYear,s.threeYear||{});
    return `<p class="im">${esc(v.label)} · saved by ${esc(first(v.by))}</p><h3>Core values</h3><ul>${s.values.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Core focus</h3><p>${esc(s.purpose)}${s.niche?'. '+esc(s.niche):''}</p><h3>10-year target</h3><p>${esc(s.tenYear)}</p><h3>Marketing strategy</h3><p>${esc(s.target)}</p><ul>${s.uniques.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>3-year picture${ty.date?', '+esc(ty.date):''}</h3><p>Revenue ${esc(ty.revenue||'–')} · profit ${esc(ty.profit||'–')} · ${esc(ty.measurables)}</p><ul>${ty.looks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}}
};
function pushVersion(audience,label){D.vtoVersions.push({id:uid('v'),date:TODAY,by:ME,label:label||'Saved from the Vision page',snap:clone(vto().data),audience});renderMain();toast(audience==='admins'?'Version saved for admins only. Find it in History.':'Version saved. Find it in History.')}
function handoverCounts(id){const n=[[D.tasks.filter(t=>t.owner===id&&t.status!=='done').length,'open tasks'],[D.projects.filter(p=>p.owner===id&&!p.archived).length,'projects'],[D.rocks.filter(r=>r.owner===id&&!isClosedQ(r.q)).length,'Rocks'],[D.metrics.filter(m=>m.owner===id&&!m.retired).length,'Scorecard numbers'],[goalsOf(curPlan().year).filter(g=>g.owner===id).length,'1-Year goals']];return n.filter(([c])=>c>0)}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const root=document.getElementById('root'),dw=document.getElementById('drawer-wrap'),mw=document.getElementById('modal-wrap');
const grow=el=>{if(!el)return;el.style.height='auto';el.style.height=el.scrollHeight+'px'};
// Titles are sized before the web font arrives and before the window changes width; size them again then.
const regrow=()=>document.querySelectorAll('textarea.ed,textarea.ph-title,textarea.dr-title').forEach(grow);
document.fonts?.ready.then(regrow);let regrowT;addEventListener('resize',()=>{clearTimeout(regrowT);regrowT=setTimeout(regrow,120)});
function renderMain(){
  if(S.view==='signin'||!D){root.innerHTML=vSignin();mountGoogle();return}
  const fresh=S.resetScroll;const keep=fresh?0:(document.getElementById('main')?.scrollTop||0);const keepX=fresh?0:(document.querySelector('.lwrap')?.scrollLeft||0);S.resetScroll=false;
  root.innerHTML=`<div class="app ${S.navOpen?'navopen':''}">${side()}<div class="navscrim" data-act="nav"></div><main id="main">${mtop()}<div class="page${S.view==='project'?' page-wide':''}">${isHidden(S.view)?vHidden():hiddenBanner(S.view)+VIEW[S.view]()}</div></main>${tabbar()}</div>`;
  document.getElementById('main').scrollTop=keep;
  const lw=root.querySelector('.lwrap');if(lw){lw.scrollLeft=keepX;lw.classList.toggle('scrolled',lw.scrollLeft>0)}pinPops();
  root.querySelectorAll('textarea.ed,textarea.ph-title').forEach(grow);
  root.querySelectorAll('.savest').forEach(paintSave);
  root.querySelectorAll('.page h1').forEach(h=>{const t=h.textContent.trim();const i=t.lastIndexOf(' ');h.innerHTML=(i>0?esc(t.slice(0,i))+' ':'')+'<span class="hl">'+esc(t.slice(i+1))+'</span>'});
  if(fresh&&S.view==='scorecard'){const w=root.querySelector('.sc-wrap');if(w)w.scrollLeft=w.scrollWidth}
}
function renderDrawer(){
  if(!S.drawer||!D){dw.innerHTML='';return}
  const{kind,id}=S.drawer;const x=kind==='task'?task(id):rock(id);
  if(!x){S.drawer=null;dw.innerHTML='';return}
  dw.innerHTML=kind==='task'?dTask(x):dRock(x);grow(dw.querySelector('textarea.dr-title'));
}
function renderModal(){
  if(!S.modal||!D){mw.innerHTML='';return}
  const m=MODALS[S.modal];
  const foot=m.submit?`<div class="m-actions"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">${m.submit}</button></div>`:m.closeOnly?`<div class="m-actions"><button type="button" class="btn btn-primary" data-act="closeModal">Close</button></div>`:'';
  mw.innerHTML=`<div class="scrim mscrim" data-act="closeModal"></div><div class="modal ${m.wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="m-h" tabindex="-1"><form data-form="${S.modal}"><h2 id="m-h">${typeof m.title==='function'?m.title():m.title}</h2>${m.body()}${foot}</form></div>`;
  const f=mw.querySelector('input:not([type=checkbox]),select,textarea');(m.submit&&f&&matchMedia('(min-width:861px)').matches?f:mw.querySelector('.modal')).focus();
}
function render(){renderMain();renderDrawer();renderModal()}
function go(v){S.view=v;S.navOpen=false;S.drawer=null;S.menu=null;S.resetScroll=true;S.confirmDel=null;history.replaceState(null,'','#'+v);renderMain();renderDrawer()}
function openDrawer(kind,id,isNew){
  if(!S.drawer)lastFocus=document.activeElement;
  S.drawer={kind,id};S.confirmDel=null;S.correcting=null;renderDrawer();
  const tt=document.getElementById('d-title');
  if(isNew&&tt){tt.focus();tt.select()}else dw.querySelector('.drawer')?.focus();
}
const refocus=id=>document.getElementById(id)?.focus();

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
const ACT={
  go:a=>go(a.dataset.v),
  nav:()=>{S.navOpen=!S.navOpen;renderMain()},
  signout:async()=>{if(diff().length&&!inflight)await commit();if(inflight||diff().length){toast('Some changes haven’t saved yet. Check your connection, then sign out again.');return}await fetch('/auth/signout',{method:'POST'});signedOut()},
  retrySave:()=>commit(),
  pgrip:()=>{},
  newProject:()=>{const p={id:uid('p'),name:'',owner:ME,due:null,archived:0,desc:'',createdAt:TODAY,visibility:'members',createdBy:ME,sort:Math.max(0,...D.projects.map(x=>x.sort||0))+1024};D.projects.push(p);addMember(p,ME,'manage');S.projectId=p.id;S.tab='list';S.pwho='all';go('project');refocus('p-title')},
  openProject:a=>{S.projectId=a.dataset.id;S.pwho='all';S.vopts=false;go('project')},
  projTab:a=>{S.projTab=a.dataset.t;renderMain()},
  restoreProject:a=>{proj(a.dataset.id).archived=0;render();toast('Project restored')},
  askArchive:()=>{S.confirmArchive=S.projectId;renderMain()},
  cancelArchive:()=>{S.confirmArchive=null;renderMain()},
  archiveProject:()=>{S.confirmArchive=null;const p=proj(S.projectId);p.archived=1;S.modal=null;renderModal();S.projTab='active';go('projects');toast(`${p.name||'Project'} archived. Find it under Archived.`)},
  tab:a=>{S.tab=a.dataset.t;renderMain()},
  openTask:a=>openDrawer('task',a.dataset.id),
  openRock:a=>openDrawer('rock',a.dataset.id),
  openIssue:a=>{const i=issue(a.dataset.id);if(!i)return;S.issuesTab=i.status==='solved'?'solved':i.list;go('issues');S.openIssue=i.id;renderMain()},
  closeDrawer:()=>{S.drawer=null;S.confirmDel=null;S.correcting=null;renderDrawer();renderMain();if(lastFocus&&document.contains(lastFocus))lastFocus.focus()},
  toggleDone:a=>{const t=task(a.dataset.id);
    if(t.status!=='done'&&!t.parent&&subsOf(t.id).some(s=>s.status!=='done')){S.modal='parentDone';S.marg=t.id;renderModal();return}
    setStatus(t,t.status==='done'?'todo':'done');if(t.status==='done')toast(`Done: ${t.title}`);render()},
  parentOnly:()=>{setStatus(task(S.marg),'done');S.modal=null;render();toast('Done. Its subtasks stay open.')},
  parentAll:()=>{const t=task(S.marg);setStatus(t,'done');subsOf(t.id).forEach(s=>{if(s.status!=='done')setStatus(s,'done')});S.modal=null;render();toast('Done, with all its subtasks')},
  expand:a=>{S.open[a.dataset.id]=!S.open[a.dataset.id];renderMain()},
  addCard:a=>{const t=newTask({project:S.projectId,status:a.dataset.st});renderMain();openDrawer('task',t.id,true)},
  quickTask:()=>{const w=S.who||ME;const t=newTask({owner:w==='none'?null:w});renderMain();openDrawer('task',t.id,true)},
  askDel:a=>{S.confirmDel=a.dataset.id;renderDrawer()},
  cancelDel:()=>{S.confirmDel=null;renderDrawer();renderMain()},
  delTask:a=>{const id=a.dataset.id;const t=task(id);dropComments([id,...subsOf(id).map(x=>x.id)]);D.tasks=D.tasks.filter(x=>x.id!==id&&x.parent!==id);if(S.drawer?.id===id)S.drawer=t.parent?{kind:'task',id:t.parent}:null;if(S.drawer?.kind==='task'&&!task(S.drawer.id))S.drawer=null;S.confirmDel=null;S.modal=null;S.menu=S.menuDel=null;toast('Task deleted');render()},
  navSec:a=>{const k=a.dataset.k;NAVSHUT[k]=!NAVSHUT[k];try{localStorage.setItem('hq-nav-shut',JSON.stringify(NAVSHUT))}catch{}renderMain()},
  newLink:()=>{S.modal='link';S.marg=null;renderModal()},
  editLink:a=>{S.modal='link';S.marg=a.dataset.id;renderModal()},
  delLink:a=>{const l=D.links.find(x=>x.id===a.dataset.id);D.links=D.links.filter(x=>x!==l);S.modal=null;render();toast(`${l.title} removed`)},
  openLink:a=>{const l=D.links.find(x=>x.id===a.dataset.id);if(l)window.open(l.url,'_blank','noopener')},
  // A copy for repeat work: same details and subtasks, back to To do, so only the title or date needs changing.
  dupTask:a=>{S.menu=S.menuDel=null;const t=task(a.dataset.id);const keep=({title,desc,owner,due,project,parent,rock,todo,priority})=>({title,desc,owner,due,project,parent,rock,todo,priority});
    const c=newTask(keep(t));c.desc=t.desc||'';if(t.extra)c.extra={...t.extra};subsOf(t.id).forEach(s=>{const n=newTask({...keep(s),parent:c.id,project:c.project});n.desc=s.desc||''});
    if(t.parent)S.open[t.parent]=true;renderMain();openDrawer('task',c.id,true);toast(`Copy made${subsOf(c.id).length?` with ${subsOf(c.id).length} subtasks`:''}. Rename it or change the date.`)},
  sortBy:a=>{const k=a.dataset.k;S.sort=S.sort.k===k?{k,dir:-S.sort.dir}:{k,dir:SORT_DIR[k]??1};renderMain()},
  delRock:a=>{const id=a.dataset.id;D.rocks=D.rocks.filter(r=>r.id!==id);D.tasks.forEach(t=>{if(t.rock===id)t.rock=null});S.drawer=null;S.confirmDel=null;toast('Rock deleted');render()},
  cycleRock:a=>{const r=rock(a.dataset.id);r.status={on:'off',off:'done',done:'on'}[r.status]||'on';renderMain()},
  correctRock:a=>{S.correcting=a.dataset.id;renderDrawer();refocus('corr-why')},
  cancelCorrection:()=>{S.correcting=null;renderDrawer()},
  saveCorrection:a=>{const r=rock(a.dataset.id);const to=val('corr-to'),why=val('corr-why').trim();if(!why){toast('Say why the result is changing');refocus('corr-why');return}if(to===r.status){toast('That’s already the result');return}
    const q=D.quarters.find(x=>x.id===r.q);q.corrections=[...(q.corrections||[]),{date:TODAY,by:ME,rockId:r.id,title:r.title,from:r.status,to,why}];r.status=to;S.correcting=null;render();toast('Corrected. The change and the reason show in History.')},
  modal:a=>{S.modal=a.dataset.k;renderModal()},
  closeModal:()=>{S.modal=null;renderModal()},
  editMetric:a=>{S.modal='editMetric';S.marg=a.dataset.id;renderModal()},
  retireMetric:a=>{D.metrics.find(m=>m.id===a.dataset.id).retired=1;S.modal=null;render();toast('Retired. Its past weeks are kept.')},
  restoreMetric:a=>{D.metrics.find(m=>m.id===a.dataset.id).retired=0;renderMain();toast('Back on the Scorecard')},
  itab:a=>{S.issuesTab=a.dataset.t;S.openIssue=null;renderMain()},
  ltIssues:()=>{S.issuesTab='longterm';go('issues')},
  histIssues:()=>{S.issuesTab='solved';go('issues')},
  toggleIssue:a=>{S.openIssue=S.openIssue===a.dataset.id?null:a.dataset.id;renderMain()},
  addAction:a=>{const i=issue(a.dataset.id);const dr=draft(i);const title=dr.title.trim();if(!title){toast('Write what needs to happen first');refocus('ia-'+i.id);return}
    const t=newTask({title,owner:dr.owner,due:dr.due||null,todo:true,issue:i.id,newInMt:S.mt.running});delete S.drafts[i.id];renderMain();toast(`To-do added for ${first(t.owner)}. The issue is still open.`)},
  solveIssue:a=>{const i=issue(a.dataset.id);if(!(i.decision||'').trim()){toast('Write what you decided first, so it can be found later');refocus('idc-'+i.id);return}
    i.status='solved';i.solvedOn=TODAY;i.pri=0;if(S.mt.running)S.mt.solved.push(i.id);S.openIssue=null;renderMain();toast('Solved. The decision is saved with it.')},
  reopenIssue:a=>{const i=issue(a.dataset.id);i.status='open';i.solvedOn=null;if(S.view==='issues')S.issuesTab=i.list;renderMain();toast('Reopened')},
  moveIssue:a=>{const i=issue(a.dataset.id);i.list=i.list==='weekly'?'longterm':'weekly';i.pri=0;S.openIssue=null;renderMain();toast(i.list==='longterm'?'Moved to the long-term list':'Moved to this week’s list')},
  startMt:()=>{Object.assign(S.mt,{running:true,step:0,start:Date.now(),stepStart:Date.now(),dropped:{},ratings:{},headlines:[],cascades:[],solved:[]});S.resetScroll=true;renderMain()},
  goStep:a=>{S.mt.step=+a.dataset.i;S.mt.stepStart=Date.now();S.resetScroll=true;renderMain()},
  endMt:()=>{if(!S.mt.running)return;const r=Object.values(S.mt.ratings).map(Number).filter(Boolean);const made=D.tasks.filter(t=>t.newInMt);
    D.meetings.push({id:uid('mt'),date:TODAY,avg:r.length?+(r.reduce((a,b)=>a+b,0)/r.length).toFixed(1):null,ratings:Object.fromEntries(Object.entries(S.mt.ratings).filter(([,v])=>v).map(([k,v])=>[k,+v])),todos:made.map(t=>({id:t.id,title:t.title,owner:t.owner,project:taskProj(t)?.id||null})),solved:S.mt.solved.filter(issue).map(id=>({id,title:issue(id).title,decision:issue(id).decision})),headlines:[...S.mt.headlines],cascades:[...S.mt.cascades]});
    made.forEach(t=>t.newInMt=0);S.mt.running=false;S.resetScroll=true;renderMain();toast(`Meeting saved with ${made.length} new to-do${made.length===1?'':'s'}. Open it any time from History.`)},
  drop:a=>{newIssue(a.dataset.text);S.mt.dropped[a.dataset.key]=1;toast('Added to Issues');renderMain()},
  openMeeting:a=>{S.modal='meetingRec';S.marg=a.dataset.id;renderModal()},
  openVersion:a=>{S.modal='vtoVersion';S.marg=a.dataset.id;renderModal()},
  saveVersion:()=>{if(isAdmin()){S.modal='saveVersion';renderModal();return}pushVersion('everyone')},
  vtoDel:a=>{getP(vto().data,a.dataset.path).splice(+a.dataset.i,1);touchVto();renderMain()},
  cycleGoal:a=>{const g=findGoal(a.dataset.id);g.status={on:'off',off:'done',done:'on'}[g.status]||'on';renderMain()},
  askDelGoal:a=>{S.confirmDel=a.dataset.id;renderMain()},
  delGoal:a=>{const id=a.dataset.id;D.goals=D.goals.filter(g=>g.id!==id);D.rocks.forEach(r=>{if(r.goal===id&&!isClosedQ(r.q))r.goal=null});S.confirmDel=null;renderMain();toast('Goal removed')},
  deactivate:a=>{S.modal='deactivate';S.marg=a.dataset.id;renderModal()},
  rmAddr:a=>{const p=person(a.dataset.id);const v=a.dataset.a;setAddrs(p,addrsOf(p).filter(x=>x!==v));renderMain();toast(addrsOf(p).length?`${v} removed from ${p.name}`:`${v} removed. ${p.name} has no sign-in address now.`)},
  pAdd:()=>{const p=proj(S.projectId);const who=val('mem-who');if(!who||!canManage(p))return;addMember(p,who);renderModal();renderMain();toast(`${first(who)} is on ${p.name||'this project'} now`)},
  pRemove:a=>{const m=D.projectMembers.find(x=>x.id===a.dataset.id);if(!m)return;const p=proj(m.project);
    if(m.level==='manage'&&managersOf(p).length<2&&!isAdmin()){toast('A project needs at least one person who manages it. Make someone else a manager first');return}
    if(isPrivate(p)&&m.person===p.owner&&person(m.person)?.role!=='Admin'){toast(`${first(m.person)} owns this project. Give it a new owner first`);return}
    D.projectMembers=D.projectMembers.filter(x=>x!==m);unassignOutsiders(p);
    if(m.person===ME&&!canSeeP(p,ME)){S.modal=null;renderModal();S.projTab='active';go('projects');toast(`You left ${p.name||'the project'}`);setTimeout(()=>refresh(true),1500)}else{renderModal();renderMain();toast(`${first(m.person)} was removed`)}},
  toggleHidden:a=>{const v=a.dataset.a;const l=hiddenList();setSetting('hidden',(l.includes(v)?l.filter(x=>x!==v):[...l,v]).join(','));renderMain();toast(hiddenList().includes(v)?`${AREAS[v]} is hidden from members`:`${AREAS[v]} is visible to everyone`)},
  menu:a=>{const id=a.dataset.id;S.menu=S.menu===id?null:id;S.menuDel=null;renderMain();document.querySelector(`.rmenu.open .mpop button`)?.focus()},
  menuAskDel:a=>{S.menuDel=a.dataset.id;renderMain();document.querySelector('.rmenu.open .btn-danger')?.focus()},
  fieldNew:()=>{S.fdraft={type:null,name:'',opts:[]};S.menu=null;S.modal='field';renderMain();renderModal()},
  fieldEdit:a=>{const f=fieldsOf(proj(S.projectId)).find(x=>x.id===a.dataset.f);if(!f)return;S.fdraft={id:f.id,type:ftype(f),name:f.name,opts:(f.opts||[]).map(o=>({...o}))};S.menu=null;S.modal='field';renderMain();renderModal()},
  fieldType:a=>{const d=S.fdraft;d.type=a.dataset.t;if(d.type==='select'&&!d.opts.length)d.opts=[{id:uid('o'),name:'',color:FCOLORS[0]},{id:uid('o'),name:'',color:FCOLORS[5]}];renderModal()},
  fieldBack:()=>{S.fdraft.type=null;renderModal()},
  optAdd:()=>{const o=S.fdraft.opts;o.push({id:uid('o'),name:'',color:FCOLORS[(o.length*3)%FCOLORS.length]});renderModal();[...document.querySelectorAll('.fopt .fin')].pop()?.focus()},
  optDel:a=>{S.fdraft.opts.splice(+a.dataset.o,1);renderModal()},
  optColor:a=>{const o=S.fdraft.opts[+a.dataset.o];o.color=FCOLORS[(FCOLORS.indexOf(o.color)+1)%FCOLORS.length];renderModal();document.querySelector(`.fdot[data-o="${a.dataset.o}"]`)?.focus()},
  fieldAsk:a=>{S.colDel=a.dataset.f;renderMain()},
  fieldKeep:()=>{S.colDel=null;renderMain()},
  fieldDel:a=>{const p=proj(S.projectId),id=a.dataset.f;p.fields=fieldsOf(p).filter(f=>f.id!==id);
    D.tasks.forEach(t=>{if(t.project===p.id&&t.extra&&id in t.extra){const x={...t.extra};delete x[id];t.extra=Object.keys(x).length?x:null}});
    delete CP.w['f:'+id];delete CP.off['f:'+id];saveCols();if(S.sort.k==='f:'+id)S.sort={k:'order',dir:1};if(S.pgroup==='f:'+id)S.pgroup='status';S.colDel=null;renderMain();toast('Column deleted')},
  cPost:a=>postComment(a.dataset.id),
  cEdit:a=>{S.cedit=a.dataset.id;S.cdel=null;renderDrawer();const el=document.getElementById('c-edit');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},
  cCancel:()=>{S.cedit=null;renderDrawer()},
  cSave:a=>{const c=D.comments.find(x=>x.id===a.dataset.id);const v=(document.getElementById('c-edit')?.value||'').trim();if(c&&v&&v!==c.body){c.body=v.slice(0,5000);c.edited=new Date().toISOString()}S.cedit=null;renderDrawer()},
  cAsk:a=>{S.cdel=a.dataset.id;renderDrawer()},
  cKeep:()=>{S.cdel=null;renderDrawer()},
  cDel:a=>{D.comments=D.comments.filter(x=>x.id!==a.dataset.id);S.cdel=null;renderDrawer();renderMain()},
  colsReset:()=>{for(const k in CP.w)delete CP.w[k];saveCols();sizeCols()},
  menuClose:()=>{const id=S.menu;S.menu=S.menuDel=null;renderMain();document.querySelector(`.dots[data-id="${id}"]`)?.focus()},
  clearFilt:a=>{const k=a.dataset.k;if(k==='pwho'||k==='all')S.pwho='all';if(k==='sort'||k==='all')S.sort={k:'order',dir:1};if(k==='pgroup'||k==='all')S.pgroup='status';renderMain()},
  reactivate:a=>{const p=person(a.dataset.id);p.active=1;p.inactiveOn=null;renderMain();toast(`${p.name} is active again`)}
};
const CH={
  pgroup:el=>{S.pgroup=el.value;renderMain()},
  refresh:()=>renderMain(),
  who:el=>{S.who=el.value;S.resetScroll=true;renderMain()},
  pwho:el=>{S.pwho=el.value;renderMain()},
  tpri:el=>{const t=task(el.dataset.id);t.priority=+el.value||null;renderMain();renderDrawer();toast(t.priority?`${PRI[t.priority]} priority`:'Priority removed')},
  tdue:el=>{const t=task(el.dataset.id);t.due=el.value||null;renderMain();renderDrawer();toast(t.due?`Due ${fmt(t.due)}`:'Due date removed')},
  towner:el=>{const t=task(el.dataset.id);const adding=el.value.startsWith('add:');setOwner(t,el.value);renderMain();renderDrawer();if(!adding)toast(t.owner?`${first(t.owner)} owns it now`:'No owner now')},
  fval:el=>{const t=task(el.dataset.id);if(!t)return;const f=fieldsOf(proj(t.project)).find(x=>x.id===el.dataset.f);const x={...(t.extra||{})},raw=el.value.trim();let v=raw||null;
    if(v!=null&&f&&ftype(f)==='number'){v=Number(raw);if(!Number.isFinite(v))v=null}
    if(v==null)delete x[el.dataset.f];else x[el.dataset.f]=v;t.extra=Object.keys(x).length?x:null;if(f&&ftype(f)==='select')renderMain()},
  colOn:el=>{CP.off[el.dataset.k]=!el.checked;saveCols();renderMain();document.querySelector(`.colopt input[data-k="${el.dataset.k}"]`)?.focus()},
  status:el=>{setStatus(task(el.dataset.id),el.value);render()},
  tfield:el=>{const t=task(el.dataset.id);const f=el.dataset.f;if(f==='status')setStatus(t,el.value);else if(f==='priority')t.priority=+el.value||null;else t[f]=el.value||null;if(f==='project'){subsOf(t.id).forEach(s=>s.project=t.project);fitOwners(t)}render()},
  rfield:el=>{rock(el.dataset.id)[el.dataset.f]=el.value||null;render()},
  metric:el=>{const m=D.metrics.find(x=>x.id===el.dataset.id);const w=el.dataset.w;const raw=el.value.trim().replace(/[,%$]/g,'');
    if(raw!==''&&!/^-?\d+(\.\d+)?$/.test(raw)){toast('Numbers only, like 42. Leave it empty if there’s no number yet.');const v=score(m,w);el.value=v??'';return}
    const v=raw===''?null:parseFloat(raw);setScore(m,w,v);el.value=v??'';const td=el.parentElement;td.classList.remove('hit','miss');const c=cellCls(m,v,w);if(c)td.classList.add(c)},
  pri:el=>{const n=+el.value;if(n)D.issues.forEach(i=>{if(i.pri===n&&i.status==='open')i.pri=0});issue(el.dataset.id).pri=n;renderMain()},
  idraft:el=>{draft(issue(el.dataset.id))[el.dataset.f]=el.value},
  rockst:el=>{rock(el.dataset.id).status=el.value;renderMain()},
  rate:el=>{S.mt.ratings[el.dataset.id]=el.value;renderMain()},
  role:el=>{const p=person(el.dataset.id);p.role=el.value;toast(`${p.name} is now ${el.value==='Admin'?'an Admin':'a Member'}`)},
  vtoTouch:()=>touchVto(),
  pvis:el=>{const p=proj(S.projectId);if(!canManage(p))return;p.visibility=el.value;if(isPrivate(p)){if(p.owner&&!canSeeP(p,p.owner))addMember(p,p.owner);unassignOutsiders(p)}renderModal();renderMain();toast(isPrivate(p)?'Only the people on this project can see it now':'Everyone on the team can see it now')},
  plevel:el=>{const m=D.projectMembers.find(x=>x.id===el.dataset.id);const p=proj(m.project);if(m.level==='manage'&&el.value!=='manage'&&managersOf(p).length<2&&!isAdmin()){toast('A project needs at least one person who manages it');el.value='manage';return}m.level=el.value;renderModal()},
  hideArea:el=>{const a=el.dataset.a;const l=hiddenList().filter(x=>x!==a);if(el.checked)l.push(a);setSetting('hidden',l.join(','));renderMain();toast(el.checked?`${AREAS[a]} is hidden from members`:`${AREAS[a]} is visible to everyone`)},
  goalOwner:el=>{findGoal(el.dataset.id).owner=el.value}
};
const LIVE={
  cdraft:el=>{(S.cdraft||={})[el.dataset.id]=el.value},
  fdraft:el=>{if(!S.fdraft)return;if(el.dataset.k==='name')S.fdraft.name=el.value;else if(S.fdraft.opts[+el.dataset.o])S.fdraft.opts[+el.dataset.o].name=el.value},
  title:el=>{task(el.dataset.id).title=el.value;grow(el)},
  desc:el=>{task(el.dataset.id).desc=el.value},
  rtitle:el=>{rock(el.dataset.id).title=el.value;grow(el)},
  rdesc:el=>{rock(el.dataset.id).desc=el.value},
  ptitle:el=>{proj(el.dataset.id).name=el.value;grow(el)},
  idetail:el=>{issue(el.dataset.id).details=el.value},
  idecision:el=>{issue(el.dataset.id).decision=el.value},
  idraft:el=>{draft(issue(el.dataset.id))[el.dataset.f]=el.value},
  vto:el=>{setP(vto().data,el.dataset.path,el.value);if(el.tagName==='TEXTAREA')grow(el)},
  vtoItem:el=>{getP(vto().data,el.dataset.path)[+el.dataset.i]=el.value},
  plan:el=>{curPlan()[el.dataset.f]=el.value;grow(el)},
  goalText:el=>{findGoal(el.dataset.id).text=el.value},
  pname:el=>{person(el.dataset.id).name=el.value},
  pseat:el=>{person(el.dataset.id).seat=el.value},
  search:el=>{S.q=el.value;const box=document.getElementById('qres');box.innerHTML=searchResults();box.hidden=!S.q.trim()}
};
const ENTER={
  optAdd:()=>ACT.optAdd(),
  addTask:el=>{const v=el.value.trim();if(!v)return;const t=newTask({project:S.projectId,title:v});if(S.pgroup!=='status'&&S.tab==='list'){const G=groupOf(S.pgroup),k=G.keys([])[0];if(k)G.set(t,k)}renderMain();refocus('add-task')},
  addSub:el=>{const v=el.value.trim();if(!v)return;const p=task(el.dataset.id);newTask({project:p.project,parent:p.id,title:v,owner:p.owner});S.open[p.id]=true;render();refocus('d-sub')},
  addMilestone:el=>{const v=el.value.trim();if(!v)return;const r=rock(el.dataset.id);newTask({rock:r.id,title:v,owner:r.owner});render();refocus('d-sub')},
  addIssue:el=>{const v=el.value.trim();if(!v)return;newIssue(v,el.dataset.list);renderMain();refocus('add-issue');toast('Issue added')},
  addAction:el=>ACT.addAction(el),
  addTodo:el=>{const v=el.value.trim();if(!v)return;const t=newTask({title:v,owner:val('td-owner'),due:addDays(TODAY,7),todo:true,newInMt:S.mt.running});renderMain();refocus('add-td');toast(`To-do added for ${first(t.owner)}`)},
  addHeadline:el=>{const v=el.value.trim();if(!v)return;S.mt.headlines.push({by:val('hl-by'),text:v});renderMain();refocus('add-hl')},
  addCascade:el=>{const v=el.value.trim();if(!v)return;const by=val('cm-by');S.mt.cascades.push({by,text:v});newTask({title:'Tell the team: '+v,owner:by,due:addDays(TODAY,2),todo:true,newInMt:true});renderMain();refocus('add-cm')},
  addGoal:el=>{const v=el.value.trim();if(!v)return;const P=curPlan();D.goals.push({id:uid('g'),year:P.year,text:v,owner:ME,status:'on',from:null,sort:goalsOf(P.year).length});renderMain();refocus('add-goal')},
  addAddr:el=>{const v=el.value.trim().toLowerCase();if(!v)return;const p=person(el.dataset.id);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){toast('That doesn’t look like an email address');return}
    if(!(CONFIG.domains||[]).includes(v.split('@')[1])){toast(`Only @${(CONFIG.domains||['yourcompany.com'])[0]} addresses can sign in`);return}
    const prev=ownerOfAddr(v);if(prev&&prev.id===p.id){el.value='';return}
    if(prev)setAddrs(prev,addrsOf(prev).filter(a=>a!==v));setAddrs(p,[...addrsOf(p),v]);renderMain();refocus('addr-'+p.id);
    toast(prev?`${v} moved from ${prev.name} to ${p.name}`:`${p.name} can now sign in with ${v}`)},
  addPerson:el=>{const v=el.value.trim();if(!v)return;const C=['#1B1714','#234E96','#4a433b','#6E6658','#7A4B0C','#2F5D50','#5B3E8A'];D.people.push({id:uid('u'),name:v,email:null,seat:'',role:'Member',active:1,inactiveOn:null,color:C[D.people.length%C.length],createdAt:TODAY});renderMain();refocus('add-person');toast(`${v} added`)},
  vtoAdd:el=>{const v=el.value.trim();if(!v)return;const path=el.dataset.path;getP(vto().data,path).push(v);touchVto();renderMain();refocus('add-'+path.replace('.','-'))}
};
document.addEventListener('click',e=>{if(e.target.classList?.contains('due-in')){try{e.target.showPicker()}catch{}return}const a=e.target.closest('[data-act]');if(!a||!D&&a.dataset.act!=='go')return;const f=ACT[a.dataset.act];if(!f)return;e.preventDefault();
  if(a.closest('.qres')){S.q='';const q=document.getElementById('q');if(q)q.value='';const b=document.getElementById('qres');if(b)b.hidden=true;S.navOpen=false}
  f(a,e);schedule()});
document.addEventListener('toggle',e=>{if(S&&e.target.classList?.contains('vopts'))S.vopts=e.target.open},true);
document.addEventListener('click',e=>{if(S?.menu&&!e.target.closest('.rmenu.open')){S.menu=null;document.querySelectorAll('.rmenu.open').forEach(m=>{m.classList.remove('open');m.querySelector('.mpop')?.remove()})}},true);
document.addEventListener('click',e=>{if(S?.vopts&&!e.target.closest('.vopts')){S.vopts=false;document.querySelectorAll('details.vopts[open]').forEach(d=>d.open=false)}},true);
document.addEventListener('change',e=>{const el=e.target;if(D&&el.dataset&&CH[el.dataset.change]){CH[el.dataset.change](el);schedule()}});
document.addEventListener('input',e=>{const el=e.target;if(D&&el.dataset&&LIVE[el.dataset.live]){LIVE[el.dataset.live](el);if(el.dataset.live!=='search'&&el.dataset.live!=='idraft')schedule(900)}});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.dataset.auth)return authSubmit(f);const m=MODALS[f.dataset.form];if(m&&m.save){m.save(new FormData(f));schedule()}});
document.addEventListener('keydown',e=>{
  const el=e.target;
  if(el.classList?.contains('rsz')&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();const k=el.dataset.col;CP.w[k]=Math.max(colById(k).min,Math.round(drawnW(k))+(e.key==='ArrowLeft'?-16:16));sizeCols();saveCols();return}
  if(el.dataset?.pgrip&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();nudgeProject(el.dataset.pgrip,e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:1,el);return}
  if(el.dataset?.grip&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();if(el.classList.contains('off'))sortNote();else nudgeTask(el.dataset.grip,e.key==='ArrowUp'?-1:1);return}
  if(e.key==='Enter'&&el.classList?.contains('fcell')){e.preventDefault();el.blur();return}
  if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&(el.id==='c-new'||el.id==='c-edit')){e.preventDefault();if(el.id==='c-new')postComment(S.drawer?.id);else document.querySelector('[data-act="cSave"]')?.click();return}
  if(e.key==='Enter'&&!e.isComposing){
    if(el.dataset?.enter){e.preventDefault();ENTER[el.dataset.enter](el);schedule();return}
    if(el.classList?.contains('dr-title')||el.classList?.contains('ph-title')){e.preventDefault();el.blur();return}
    if(el.matches?.('[data-act][tabindex]')){e.preventDefault();el.click();return}
  }
  if(e.key===' '&&el.matches?.('[data-act][tabindex]')){e.preventDefault();el.click();return}
  if(e.key==='Escape'&&S?.menu){ACT.menuClose();return}
  if(e.key==='Escape'&&S){if(el.id==='q'&&S.q){S.q='';el.value='';document.getElementById('qres').hidden=true;return}if(S.modal)ACT.closeModal();else if(S.drawer)ACT.closeDrawer();else if(S.navOpen)ACT.nav()}
});
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('[data-drag]');if(!c)return;e.dataTransfer.setData('text/plain',c.dataset.drag);e.dataTransfer.effectAllowed='move';c.classList.add('dragging')});
document.addEventListener('dragend',()=>{document.querySelectorAll('.dragging,.col.over').forEach(x=>x.classList.remove('dragging','over'))});
document.addEventListener('dragover',e=>{const col=e.target.closest?.('[data-drop]');if(!col)return;e.preventDefault();document.querySelectorAll('.col.over').forEach(c=>{if(c!==col)c.classList.remove('over')});col.classList.add('over')});
document.addEventListener('drop',e=>{const col=e.target.closest?.('[data-drop]');if(!col||!D)return;e.preventDefault();const t=task(e.dataTransfer.getData('text/plain'));if(t&&t.status!==col.dataset.drop){if(col.dataset.drop==='done'&&subsOf(t.id).some(s=>s.status!=='done')){S.modal='parentDone';S.marg=t.id;renderMain();renderModal();return}setStatus(t,col.dataset.drop);toast(`Moved to ${ST[t.status]}`)}renderMain();schedule()});
// Resize a column by dragging the line at the right of its heading; double-click the line to reset that column.
let rsz=null;
const drawnW=k=>k==='name'?(nameW()||document.querySelector('.lhead .lname')?.getBoundingClientRect().width||280):colW(colById(k));
const sortNote=()=>{toast('This list is sorted. Clear “Sorted by…” at the top to drag tasks into your own order.')};
document.addEventListener('pointerdown',e=>{
  const pg=e.target.closest?.('.pgrip');if(pg){pg.closest('[data-pdrag]').draggable=true;return}
  const g=e.target.closest?.('.grip');if(g){if(g.classList.contains('off'))sortNote();else g.closest('.lrow').draggable=true;return}
  const h=e.target.closest?.('.rsz');if(!h)return;e.preventDefault();
  rsz={c:colById(h.dataset.col),x:e.clientX,h,w:drawnW(h.dataset.col)};h.setPointerCapture?.(e.pointerId);h.classList.add('on');document.body.classList.add('resizing')});
document.addEventListener('pointermove',e=>{if(!rsz)return;CP.w[rsz.c.k]=Math.max(rsz.c.min,Math.round(rsz.w+e.clientX-rsz.x));sizeCols()});
const endRsz=()=>{if(!rsz)return;rsz.h.classList.remove('on');document.body.classList.remove('resizing');rsz=null;saveCols()};
document.addEventListener('pointerup',()=>{endRsz();document.querySelectorAll('.lrow[draggable="true"]:not(.dragging),[data-pdrag][draggable="true"]:not(.dragging)').forEach(r=>r.draggable=false)});
document.addEventListener('pointercancel',endRsz);
document.addEventListener('dblclick',e=>{const h=e.target.closest?.('.rsz');if(!h)return;delete CP.w[h.dataset.col];sizeCols();saveCols()});
document.addEventListener('scroll',e=>{const t=e.target;if(t.classList?.contains('lwrap'))t.classList.toggle('scrolled',t.scrollLeft>0);if(S?.menu)pinPops()},true);
addEventListener('resize',()=>{if(S?.menu)pinPops()});
// Drag a task by its handle (there while the list is in custom order) to put it where you want it. Everyone on the
// project sees the same order. Grouped by status, dropping a task into another group also changes its status.
let lDrag=null;
function dropAt(e){if(!lDrag)return null;const ok=g=>g===lDrag.grp||!lDrag.par;
  const r=e.target.closest?.('.lrow[data-row]');
  if(r){if(r.dataset.row===lDrag.id||r.dataset.par!==lDrag.par||!ok(r.dataset.grp))return null;const b=r.getBoundingClientRect();return{el:r,id:r.dataset.row,after:e.clientY>b.top+b.height/2,grp:r.dataset.grp}}
  const sec=e.target.closest?.('section[data-sec]');if(!sec||lDrag.par||!ok(sec.dataset.sec))return null;
  return{el:sec,id:null,after:true,grp:sec.dataset.sec}}
const unmark=()=>document.querySelectorAll('.drop-before,.drop-after,.drop-in,.drop-left,.drop-right').forEach(x=>x.classList.remove('drop-before','drop-after','drop-in','drop-left','drop-right'));
document.addEventListener('dragstart',e=>{const r=e.target.closest?.('.lrow[data-row]');if(!r||!r.draggable)return;lDrag={id:r.dataset.row,par:r.dataset.par,grp:r.dataset.grp};e.dataTransfer.setData('text/plain',lDrag.id);e.dataTransfer.effectAllowed='move';r.classList.add('dragging')});
document.addEventListener('dragover',e=>{if(!lDrag)return;const at=dropAt(e);unmark();if(!at)return;e.preventDefault();at.el.classList.add(at.id?(at.after?'drop-after':'drop-before'):'drop-in')});
document.addEventListener('drop',e=>{if(!lDrag)return;const at=dropAt(e),d=lDrag;lDrag=null;unmark();if(!at)return;e.preventDefault();moveTask(d.id,at.id,at.after,at.grp)});
document.addEventListener('dragend',()=>{lDrag=null;unmark();document.querySelectorAll('.lrow[draggable="true"]').forEach(r=>{r.draggable=false;r.classList.remove('dragging')})});
// Drag a project by its dots, in the menu or on the Projects page. Cards side by side drop to the left or right.
let pDrag=null;
function pDropAt(e){if(!pDrag)return null;const r=e.target.closest?.('[data-pdrag]');if(!r||r.dataset.pdrag===pDrag.id||r.closest('[data-plist]')?.dataset.plist!==pDrag.list)return null;
  const b=r.getBoundingClientRect();const across=pDrag.list!=='nav'&&getComputedStyle(r.parentElement).gridTemplateColumns.split(' ').length>1;
  const after=across?e.clientX>b.left+b.width/2:e.clientY>b.top+b.height/2;return{el:r,id:r.dataset.pdrag,after,cls:across?(after?'drop-right':'drop-left'):(after?'drop-after':'drop-before')}}
document.addEventListener('dragstart',e=>{const r=e.target.closest?.('[data-pdrag]');if(!r||!r.draggable)return;pDrag={id:r.dataset.pdrag,list:r.closest('[data-plist]')?.dataset.plist};e.dataTransfer.setData('text/plain',pDrag.id);e.dataTransfer.effectAllowed='move';r.classList.add('dragging')});
document.addEventListener('dragover',e=>{if(!pDrag)return;const at=pDropAt(e);unmark();if(!at)return;e.preventDefault();at.el.classList.add(at.cls)});
document.addEventListener('drop',e=>{if(!pDrag)return;const at=pDropAt(e),d=pDrag;pDrag=null;unmark();if(!at)return;e.preventDefault();moveProject(d.id,at.id,at.after)});
document.addEventListener('dragend',()=>{pDrag=null;unmark();document.querySelectorAll('[data-pdrag][draggable="true"]').forEach(r=>{r.draggable=false;r.classList.remove('dragging')})});
setInterval(()=>{if(!S||!S.mt.running||S.view!=='meeting')return;const a=document.getElementById('mt-total'),b=document.getElementById('mt-step');if(a)a.textContent=clock(Date.now()-S.mt.start);if(b){const ms=Date.now()-S.mt.stepStart;b.textContent=clock(ms);b.classList.toggle('over',ms>STEPS[S.mt.step][1]*60000)}},1000);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot(){
  initState();
  const err=new URLSearchParams(location.search).get('signin_error');if(err){S.signinError=err;history.replaceState(null,'','/')}
  let r;try{r=await fetch('/api/me',{headers:{'X-HQ':'1'}})}catch{root.innerHTML='<div class="loading">Can’t reach HQ. Check your connection and reload.</div>';return}
  const j=await r.json().catch(()=>({}));CONFIG=j.config||{};document.title=CO()+' HQ';
  if(r.status!==200){D=null;S.view='signin';renderMain();return}
  ME=j.me.id;
  const d=await fetch('/api/data',{headers:{'X-HQ':'1'}}).then(x=>x.json());
  lastServer=JSON.stringify([d.data,d.hidden]);load(d.data,d.hidden);applyOutbox();ensureBasics();restoreMeeting();
  const h=location.hash.slice(1);S.view=VIEW[h]&&h!=='project'?h:'mytasks';
  render();schedule(50);
}
boot();
