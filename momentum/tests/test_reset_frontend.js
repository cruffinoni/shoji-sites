const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const listeners = {};
let fakeNow=Date.now();
class FakeDate extends Date { constructor(...args){super(...(args.length?args:[fakeNow]));} static now(){return fakeNow;} }
const storage = new Map();
const requests = [];
let tasks = [
  {id:'a',title:'Alpha',group:'Home',estimate:'S',planned_date:'2026-04-05',completed:false},
  {id:'b',title:'Beta',group:'Work',estimate:'M',planned_date:'2026-04-05',completed:false},
];
let failNext = false;
let deferredPatch = null;
let deferredGet = null;
const elements = {};
let currentCreateForm = null;
let activeElement = null;
function makeCreateForm() {
  const fields = {};
  for (const name of ['title','group','estimate']) {
    fields[name] = {name,value:'',selectionStart:0,selectionEnd:0,form:null,focus(){activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
  }
  const form = {id:'create-form',elements:fields,contains(element){return Object.values(fields).includes(element);}};
  Object.values(fields).forEach(field=>field.form=form);
  return form;
}
for (const id of ['app','date','zone','clock-date','clock','sync-status','theme-toggle','timer-remaining','timer-phase','timer-state','timer-start','timer-pause','timer-next','timer-count','timer-task','timer-progress','timer-settings-dialog','timer-settings','timer-work','timer-short','timer-long','timer-interval']) elements[id] = {
  id, innerHTML:'', textContent:'', dataset:{}, attributes:{}, listeners:{}, style:{}, disabled:false, open:false,
  addEventListener(type,fn){this.listeners[type]=fn;}, querySelectorAll(){return [];}, closest(){return null;},
  setAttribute(k,v){this.attributes[k]=v;}, getAttribute(k){return this.attributes[k];},
  showModal(){this.open=true;}, close(){this.open=false;}
};
let appMarkup='';
Object.defineProperty(elements.app,'innerHTML',{get(){return appMarkup;},set(markup){if(currentCreateForm?.contains(activeElement))activeElement=null;appMarkup=markup;currentCreateForm=markup.includes('<form id="create-form"')?makeCreateForm():null;}});
const nav = ['today','focus'].map(view=>({dataset:{view},attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,fn){this.listeners[type]=fn;}}));
const root = {dataset:{},setAttribute(){}};
const context = {
  document:{getElementById:id=>id==='create-form'?currentCreateForm:elements[id],querySelectorAll:selector=>selector==='.view-nav [data-view]'?nav:[],documentElement:root,get activeElement(){return activeElement;}},
  window:{matchMedia:()=>({matches:false}),setInterval(fn,ms){(listeners.intervals ||= []).push({fn,ms});}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  Intl,Date:FakeDate,JSON,Map,Set,encodeURIComponent,FormData:class{constructor(form){this.form=form;}get(k){return this.form.values[k]??'';}},
  fetch:async(url,opts={})=>{
    requests.push({url,opts});
    if(failNext){failNext=false;return {ok:false,status:503};}
    if(url.startsWith('api/tasks?')){
      if(deferredGet){const gate=deferredGet;deferredGet=null;return gate.promise;}
      return {ok:true,json:async()=>({tasks:tasks.map(t=>({...t}))})};
    }
    if(url==='api/tasks'&&opts.method==='POST'){const t={id:'c',...JSON.parse(opts.body),completed:false};tasks.push(t);return {ok:true,json:async()=>({task:t})};}
    if(opts.method==='PATCH'){
      if(deferredPatch){const gate=deferredPatch;deferredPatch=null;return gate.promise;}
      const t=tasks.find(x=>x.id===decodeURIComponent(url.split('/').pop()));Object.assign(t,JSON.parse(opts.body));return {ok:true,json:async()=>({task:t})};
    }
    if(opts.method==='DELETE'){tasks=tasks.filter(x=>x.id!==decodeURIComponent(url.split('/').pop()));return {ok:true,json:async()=>({})};}
    if(url.includes('/reorder')){const ids=JSON.parse(opts.body).task_ids;tasks=ids.map(id=>tasks.find(t=>t.id===id));return {ok:true,json:async()=>({})};}
    return {ok:false,status:404};
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/timer.js'),'utf8'),context);
context.window.PomodoroTimer=context.PomodoroTimer;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);
const tick=()=>new Promise(r=>setImmediate(r));
const settle=async()=>{await tick();await tick();};
const action=(name,id,extras={})=>({dataset:{action:name,...extras},closest(selector){return selector==='[data-action]'?this:selector==='[data-id]'?{dataset:{id}}:null;}});
const click=async(target)=>{if(target.dataset?.view)nav.find(b=>b.dataset.view===target.dataset.view).listeners.click();else if(target===elements['theme-toggle'])target.listeners.click();else elements.app.listeners.click({target});await settle();};
const submit=async(form)=>{const handler=form.id==='timer-settings'?elements['timer-settings'].listeners.submit:elements.app.listeners.submit;handler({target:form,preventDefault(){}});await settle();};
const change=async(id,checked)=>{const target={dataset:{action:'complete'},checked,closest:()=>({dataset:{id}})};elements.app.listeners.change({target});await settle();};

(async()=>{
  await settle();
  assert.match(elements.app.innerHTML,/Alpha/);
  currentCreateForm.elements.title.value='Draft I have not added';
  currentCreateForm.elements.group.value='Personal';
  currentCreateForm.elements.estimate.value='M';
  currentCreateForm.elements.title.focus();
  currentCreateForm.elements.title.setSelectionRange(5,5);
  tasks[0].title='Alpha changed remotely';
  listeners.intervals.find(i=>i.ms===5000).fn(); await settle();
  assert.equal(currentCreateForm.elements.title.value,'Draft I have not added','polling preserves an unsubmitted task title');
  assert.equal(currentCreateForm.elements.group.value,'Personal','polling preserves the draft group');
  assert.equal(currentCreateForm.elements.estimate.value,'M','polling preserves the draft estimate');
  assert.equal(activeElement,currentCreateForm.elements.title,'polling keeps the title field focused');
  assert.deepEqual([activeElement.selectionStart,activeElement.selectionEnd],[5,5],'polling restores the caret position');
  await click({dataset:{view:'focus'}});
  await click({dataset:{view:'today'}});
  assert.equal(currentCreateForm.elements.title.value,'Draft I have not added','draft survives a view switch');
  assert.equal(activeElement,null,'returning from Focus does not unexpectedly steal focus');
  const parisDateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(fakeNow));
  const parisDate=`${parisDateParts.find(p=>p.type==='year').value}-${parisDateParts.find(p=>p.type==='month').value}-${parisDateParts.find(p=>p.type==='day').value}`;
  assert.equal(elements.clock.textContent,new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(fakeNow)),'clock is fixed to 24-hour Europe/Paris time');
  assert.equal(elements['clock-date'].textContent,new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(fakeNow)),'date sits under the Paris clock');
  assert.ok(requests.some(r=>r.url===`api/tasks?date=${parisDate}`),'Today API query follows the Europe/Paris calendar date');
  assert.match(elements.app.innerHTML,new RegExp(`name="planned_date" value="${parisDate}"`),'new tasks use the Europe/Paris calendar date');
  const headerHtml=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  assert.match(headerHtml,/<title>Momentum<\/title>/,'document title uses the project name');
  assert.match(headerHtml,/<h1>Momentum<\/h1>/,'main heading uses the project name');
  assert.match(headerHtml,/class="clock"[\s\S]*id="clock"[\s\S]*id="clock-date"/,'date is placed in the right-hand clock block');
  assert.doesNotMatch(headerHtml,/A quieter way to get things done|LOCAL TIME|clock-zone/);
  assert.match(headerHtml,/<dialog id="timer-settings-dialog"/,'timer settings are in a static modal dialog');
  assert.doesNotMatch(headerHtml,/<dialog id="timer-settings-dialog"[^>]*open/,'settings dialog is closed by default');
  assert.match(headerHtml,/name="workMinutes"[\s\S]*name="shortBreakMinutes"[\s\S]*name="longBreakMinutes"[\s\S]*name="longBreakInterval"/,'all four timer inputs are inside the dialog');
  assert.match(headerHtml,/aria-label="Save timer settings"[\s\S]*<svg/,'save control is an accessible icon button');
  tasks[0].title='Alpha changed remotely';
  listeners.intervals.find(i=>i.ms===5000).fn(); await settle();
  assert.match(elements.app.innerHTML,/Alpha changed remotely/,'poll refresh displays remotely changed task data');
  const form={id:'create-form',values:{title:'   ',group:'',estimate:'',planned_date:parisDate}};
  const postsBeforeInvalid=requests.filter(r=>r.opts.method==='POST').length;
  await submit(form);
  assert.equal(requests.filter(r=>r.opts.method==='POST').length,postsBeforeInvalid,'blank task titles are rejected without an API request');
  assert.match(elements.app.innerHTML,/Task title is required/,'blank titles show an inline validation message');
  form.values={title:' alpha   changed remotely ',group:'',estimate:'',planned_date:'2026-04-05'};
  await submit(form);
  assert.equal(requests.filter(r=>r.opts.method==='POST').length,postsBeforeInvalid,'duplicate task titles are rejected without an API request');
  assert.match(elements.app.innerHTML,/already exists for this date/,'duplicate titles show an inline validation message');
  form.values={title:'Gamma',group:'Home',estimate:'L',planned_date:parisDate};
  await submit(form);
  assert.equal(tasks.at(-1).title,'Gamma');
  assert.equal(currentCreateForm.elements.title.value,'','successful creation clears the task title');
  assert.equal(activeElement,currentCreateForm.elements.title,'successful creation returns focus to the title input');
  assert.match(elements.app.innerHTML,/<option value="S" data-size="S">S/,'small estimate choice carries its color key');
  assert.match(elements.app.innerHTML,/<option value="M" data-size="M">M/,'medium estimate choice carries its color key');
  assert.match(elements.app.innerHTML,/<option value="L" data-size="L">L/,'large estimate choice carries its color key');
  const effortCss=fs.readFileSync(path.join(__dirname,'../web/styles.css'),'utf8');
  assert.match(effortCss,/\.effort\s*\{[^}]*border-radius:\s*999px/,'effort labels render as chips');
  assert.match(effortCss,/\.effort\[data-size="L"\]\s*\{[^}]*background:\s*var\(--urgent-soft\)/,'large effort uses a light red chip');
  assert.match(effortCss,/\.effort\[data-size="M"\]\s*\{[^}]*background:\s*var\(--gold-soft\)/,'medium effort uses an orange-yellow chip');
  assert.match(effortCss,/\.effort\[data-size="S"\]\s*\{[^}]*background:\s*var\(--accent-soft\)/,'small effort uses a light green chip');
  assert.match(effortCss,/select option\[data-size="L"\][^}]*background:\s*var\(--urgent-soft\)/,'large choice is colored in the size dropdown');
  assert.ok(requests.some(r=>r.opts.method==='POST'));
  await click(action('edit','a'));
  assert.match(elements.app.innerHTML,/edit-form/,'edit opens inline form');
  assert.doesNotMatch(elements.app.innerHTML,/prompt\(/);
  const edit={id:'edit-form',dataset:{id:'a'},values:{title:'Alpha updated',group:'Team',estimate:'M'}};
  await submit(edit);
  assert.deepEqual(JSON.parse(requests.filter(r=>r.opts.method==='PATCH').at(-1).opts.body),{title:'Alpha updated',group:'Team',estimate:'M'});
  await change('a',true); assert.equal(tasks.find(t=>t.id==='a').completed,true);
  await change('a',false); assert.equal(tasks.find(t=>t.id==='a').completed,false);
  assert.match(elements.app.innerHTML,/class="drag-handle"[^>]*draggable="true"[^>]*aria-label="Reorder task/,'tasks expose an accessible draggable handle');
  assert.doesNotMatch(elements.app.innerHTML,/data-action="(?:up|down)"/,'move arrows are replaced by drag handles');
  const rowA={dataset:{id:'a'},closest(selector){return selector==='.task-row[data-id]'?this:null;}};
  const rowB={dataset:{id:'b'},closest(selector){return selector==='.task-row[data-id]'?this:null;}};
  const source={closest(selector){return selector==='.drag-handle'?this:selector==='.task-row[data-id]'?rowA:null;}};
  const destination={closest(selector){return selector==='.task-row[data-id]'?rowB:null;}};
  let dragId='';
  elements.app.listeners.dragstart({target:source,dataTransfer:{setData(_type,value){dragId=value;},effectAllowed:''},preventDefault(){}});
  elements.app.listeners.dragover({target:destination,preventDefault(){}});
  elements.app.listeners.drop({target:destination,dataTransfer:{getData(){return dragId;}},preventDefault(){}});
  await settle();
  assert.equal(tasks[0].id,'b','dropping a task handle reorders tasks');
  assert.deepEqual(JSON.parse(requests.filter(r=>r.url.includes('/reorder')&&r.opts.method==='PUT').at(-1).opts.body).task_ids,['b','a','c']);
  await click({dataset:{view:'focus'}});
  assert.match(elements.app.innerHTML,/Focus/);
  assert.match(elements.app.innerHTML,/data-action="timer-settings-open"[^>]*aria-haspopup="dialog"/,'settings trigger stays beside the timer heading');
  assert.match(elements.app.innerHTML,/data-action="timer-settings-open"[\s\S]*?<span class="settings-emoji" aria-hidden="true">⚙️<\/span>/,'Focus timer settings use the gear emoji');
  assert.match(elements.app.innerHTML,/class="timer-dial"[\s\S]*id="timer-progress"[\s\S]*id="timer-remaining"/,'countdown is centered inside the circular timer dial');
  assert.match(elements.app.innerHTML,/aria-label="Start timer"[\s\S]*<svg/);
  assert.match(elements.app.innerHTML,/aria-label="Pause timer"[\s\S]*<svg/);
  assert.match(elements.app.innerHTML,/aria-label="Reset timer"[\s\S]*<svg/);
  const controls=elements.app.innerHTML.match(/<div class="timer-controls">([\s\S]*?)<\/div>/)[1];
  assert.doesNotMatch(controls,/>\s*(Start|Pause|Reset|Next phase)\s*</,'timer controls display icons rather than text labels');
  assert.match(elements.app.innerHTML,/aria-label="Completed work sessions: 0"[\s\S]*timer-count/,'completed sessions use an accessible flame counter');
  const timerCss=fs.readFileSync(path.join(__dirname,'../web/styles.css'),'utf8');
  assert.match(timerCss,/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,'timer settings fields use one four-column row');
  assert.match(timerCss,/\.timer-settings-grid label \{[^}]*font-size:14px;/,'timer settings labels use readable 14px type');
  assert.match(timerCss,/@media\(max-width:620px\)[\s\S]*?\.timer-settings-grid label \{ font-size:13px; \}/,'timer settings labels stay readable on mobile');
  await click(action('focus','b')); assert.equal(storage.get('day-reset-focus-v1'),'b');
  assert.match(elements.app.innerHTML,/Pomodoro timer/,'timer is only rendered in Focus');
  const timerPatches=requests.filter(r=>r.opts.method==='PATCH').length;
  await click(action('timer-start'));
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-state-v1')).taskId,'b','work start snapshots selected focus task');
  assert.equal(requests.filter(r=>r.opts.method==='PATCH').length,timerPatches,'starting timer does not call task API');
  await click(action('timer-pause'));
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-state-v1')).status,'paused');
  await click(action('timer-settings-open'));
  assert.equal(elements['timer-settings-dialog'].open,true,'Settings opens the modal');
  assert.equal(elements['timer-work'].value,25,'opening settings reflects the saved timer configuration');
  elements['timer-settings-dialog'].listeners.click({target:elements['timer-settings-dialog']});
  assert.equal(elements['timer-settings-dialog'].open,false,'clicking the backdrop closes settings');
  await click(action('timer-settings-open'));
  assert.equal(elements['timer-settings-dialog'].open,true,'settings can be reopened after backdrop close');
  elements['timer-work'].value='31';
  listeners.intervals.find(i=>i.ms===5000).fn(); await settle();
  assert.equal(elements['timer-settings-dialog'].open,true,'task polling does not dismiss the settings dialog');
  assert.equal(elements['timer-work'].value,'31','task polling preserves unsaved settings input');
  const settings={id:'timer-settings',values:{workMinutes:'30',shortBreakMinutes:'6',longBreakMinutes:'16',longBreakInterval:'3'}};
  await submit(settings);
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-config-v1')).workMinutes,30,'settings persist independently');
  assert.equal(elements['timer-settings-dialog'].open,false,'Save closes the settings modal');
  await click(action('timer-reset'));
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-state-v1')).taskId,null);
  await click(action('timer-start'));
  const timerEnd=JSON.parse(storage.get('day-reset-pomodoro-state-v1')).endsAt;
  fakeNow=timerEnd+1;
  listeners.intervals.filter(i=>i.ms===1000).at(-1).fn();
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-state-v1')).status,'finished','timer expiry is persisted without a task mutation');
  assert.equal(JSON.parse(storage.get('day-reset-pomodoro-state-v1')).completedWork,1);
  assert.equal(elements['timer-remaining'].textContent,'00:00','expired countdown remains visible in the ring center');
  assert.equal(elements['timer-count'].textContent,'1','flame counter increments on work completion');
  assert.ok(Number(elements['timer-progress'].attributes['stroke-dashoffset'])>0,'ring fills as countdown expires');
  assert.equal(requests.filter(r=>r.opts.method==='PATCH').length,timerPatches,'timer finish never completes or patches a task');
  fakeNow=Date.now();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/timer.js'),'utf8'),context);
context.window.PomodoroTimer=context.PomodoroTimer;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context); await settle();
  await click({dataset:{view:'focus'}}); assert.match(elements.app.innerHTML,/Beta/,'focus selection survives reload');
  await click({dataset:{view:'today'}});
  await change('b',true); assert.notEqual(storage.get('day-reset-focus-v1'),'b','completing focus falls back to an open task');
  await click(action('delete','a')); assert.equal(tasks.some(t=>t.id==='a'),false); assert.notEqual(storage.get('day-reset-focus-v1'),'a','deleting focus falls back to an open task');
  await click(elements['theme-toggle']);
  assert.equal(elements['theme-toggle'].attributes['aria-pressed'],'true');
  assert.equal(storage.get('day-reset-theme-v1'),'dark');
  assert.match(fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8'),/<svg[\s\S]*moon[\s\S]*<svg[\s\S]*sun/i);
  const before=requests.filter(r=>r.url.startsWith('api/tasks?')).length;
  listeners.intervals.find(i=>i.ms===5000).fn(); await settle();
  assert.equal(requests.filter(r=>r.url.startsWith('api/tasks?')).length,before+1);
  failNext=true; await click(action('delete','b'));
  assert.match(elements['sync-status'].textContent,/Offline/);
  await click({dataset:{view:'today'}});
  tasks=[];
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  assert.match(elements.app.innerHTML,/Nothing planned for today/,'successful empty response shows an empty Today view');
  failNext=true;
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  assert.match(elements.app.innerHTML,/Could not load today’s tasks/,'failed refresh shows a load error');
  assert.match(elements['sync-status'].textContent,/Offline/,'failed refresh shows offline sync status');
  await click({dataset:{view:'focus'}});
  assert.match(elements.app.innerHTML,/Could not load today’s tasks/,'switching to Focus preserves the load error');
  assert.doesNotMatch(elements.app.innerHTML,/Your list is clear/,'unknown task state must not be reported as an empty list');
  await click(action('retry'));
  assert.doesNotMatch(elements.app.innerHTML,/Could not load today’s tasks/,'successful retry clears the load error');
  assert.match(elements.app.innerHTML,/Your list is clear/,'successful empty retry reports the confirmed empty state');
  tasks=[{id:'cached',title:'Cached task',group:'Home',estimate:'S',planned_date:'2026-04-05',completed:false}];
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  failNext=true;
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  assert.match(elements.app.innerHTML,/Cached task/,'later load failure preserves cached tasks');
  assert.match(elements['sync-status'].textContent,/Offline/,'later load failure shows offline sync status');

  tasks=[
    {id:'a',title:'Alpha confirmed',group:'Home',estimate:'S',planned_date:'2026-04-05',completed:false},
    {id:'b',title:'Beta confirmed',group:'Work',estimate:'M',planned_date:'2026-04-05',completed:false},
  ];
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  let resolvePatch;
  deferredPatch={promise:new Promise(resolve=>{resolvePatch=resolve;})};
  const patchCount=requests.filter(r=>r.opts.method==='PATCH').length;
  const first={dataset:{action:'complete'},checked:true,closest:()=>({dataset:{id:'a'}})};
  elements.app.listeners.change({target:first}); await settle();
  assert.equal(elements.app.attributes['aria-busy'],'true','pending save is exposed as busy');
  const second={dataset:{action:'complete'},checked:true,closest:()=>({dataset:{id:'b'}})};
  elements.app.listeners.change({target:second}); await settle();
  assert.equal(second.checked,false,'interaction during a pending save is restored to confirmed state');
  assert.equal(requests.filter(r=>r.opts.method==='PATCH').length,patchCount+1,'second interaction is not silently discarded');
  resolvePatch({ok:true,json:async()=>{tasks.find(t=>t.id==='a').completed=true;return {task:tasks.find(t=>t.id==='a')};}});
  await settle();
  assert.equal(elements.app.attributes['aria-busy'],'false','controls leave busy state after save');
  assert.equal(tasks.find(t=>t.id==='a').completed,true);

  failNext=true;
  await click({dataset:{view:'today'}});
  const failedCheckbox={dataset:{action:'complete'},checked:false,closest:()=>({dataset:{id:'a'}})};
  elements.app.listeners.change({target:failedCheckbox}); await settle();
  assert.equal(failedCheckbox.checked,true,'failed checkbox write restores the server-confirmed input state');
  assert.equal(elements.app.attributes['aria-busy'],'false','failed save leaves controls enabled');
  assert.match(elements.app.innerHTML,/Alpha confirmed/);
  assert.match(elements.app.innerHTML,/task-row done/,'failed checkbox write restores the server-confirmed row');
  assert.match(elements.app.innerHTML,/checked/,'failed checkbox write restores the server-confirmed checkbox');
  assert.match(elements['sync-status'].textContent,/Offline/);
  assert.match(elements.app.innerHTML,/1 \/ 2/,'failed checkbox write keeps confirmed progress count');
  const focusPreference='b';
  tasks=[{id:'b',title:'Beta restored',group:'Work',estimate:'M',planned_date:'2026-04-05',completed:false}];
  storage.set('day-reset-focus-v1',focusPreference);
  failNext=true;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/timer.js'),'utf8'),context);
context.window.PomodoroTimer=context.PomodoroTimer;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);
  await settle();
  assert.equal(storage.get('day-reset-focus-v1'),focusPreference,'initial outage must not erase saved Focus preference');
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  assert.equal(storage.get('day-reset-focus-v1'),focusPreference);
  await click({dataset:{view:'focus'}});
  assert.match(elements.app.innerHTML,/Beta restored/,'saved Focus selection returns once task state loads');

  let resolveOldGet;
  deferredGet={promise:new Promise(resolve=>{resolveOldGet=resolve;})};
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  tasks=[{id:'b',title:'Beta newer from server',group:'Work',estimate:'M',planned_date:'2026-04-05',completed:false}];
  listeners.intervals.filter(i=>i.ms===5000).at(-1).fn(); await settle();
  assert.match(elements.app.innerHTML,/Beta newer from server/);
  resolveOldGet({ok:true,json:async()=>({tasks:[{id:'b',title:'Beta stale response',group:'Work',estimate:'M',planned_date:'2026-04-05',completed:false}]})});
  await settle();
  assert.match(elements.app.innerHTML,/Beta newer from server/,'older GET response cannot replace newer server state');

  console.log('frontend delegated interactions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
