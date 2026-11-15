const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const axeSource = fs.readFileSync(path.join(__dirname, 'axe.min.js'), 'utf8');
const OUT = path.join(ROOT, 'design', 'review');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync('/tmp/.X11-unix', { recursive: true });
try { fs.chmodSync('/tmp/.X11-unix', 0o1777); } catch (e) {}

const DISPLAY = ':150';
const PORT = 9333;
const HOME = '/tmp/wf-home-' + process.pid;
const PROFILE = '/tmp/wf-profile-' + process.pid;
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
const chrome = spawn('google-chrome', [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-crash-reporter',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT,
  '--kiosk', '--window-size=1440,900', '--window-position=0,0', 'about:blank'
], {
  env: Object.assign({}, process.env, {
    DISPLAY: DISPLAY,
    HOME: HOME,
    XDG_CONFIG_HOME: path.join(HOME, '.config'),
    XDG_CACHE_HOME: path.join(HOME, '.cache'),
    XDG_RUNTIME_DIR: path.join(HOME, '.run')
  }),
  stdio: ['ignore', 'ignore', 'ignore']
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForEndpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      if (list.length) return list;
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('Chrome debugging endpoint did not start');
}

let ws;
let nextId = 1;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.method + ': ' + msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.text + (d.exception && d.exception.description ? ': ' + d.exception.description : ''));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map(a => a.value || a.description || '').join(' '));
  }
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (res.exceptionDetails) {
    throw new Error('Evaluation failed: ' + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
  }
  return res.result ? res.result.value : undefined;
}

async function waitFor(expression, timeout) {
  const deadline = Date.now() + (timeout || 8000);
  while (Date.now() < deadline) {
    try { if (await evaluate(expression)) return; } catch (e) {}
    await sleep(100);
  }
  throw new Error('Timed out waiting for: ' + expression);
}

async function navigate(url) {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete" && !!window.WeekformLogic && !!document.querySelector(".plan-row, #emptyState:not([hidden])")', 10000);
  await evaluate('document.fonts.ready.then(function(){ return true; })');
  await sleep(120);
}

async function screenshot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(res.data, 'base64'));
}

const snapshotExpr = [
  '(function(){',
  '  var selected = document.querySelector(".plan-row.selected");',
  '  var inspector = document.getElementById("inspector");',
  '  return {',
  '    title: document.title,',
  '    rows: document.querySelectorAll(".plan-row").length,',
  '    total: document.getElementById("totalCount").textContent,',
  '    meta: document.getElementById("resultsMeta").textContent.trim(),',
  '    selectedRank: selected ? selected.querySelector(".rank").textContent.trim() : null,',
  '    selectedDays: document.getElementById("selectedDaysLabel").textContent.trim(),',
  '    badge: document.getElementById("inspectorBadgeText").textContent.trim(),',
  '    limitHidden: document.getElementById("limitNote").hidden,',
  '    limit: document.getElementById("limitText").textContent.trim(),',
  '    emptyHidden: document.getElementById("emptyState").hidden,',
  '    fixLabel: document.getElementById("fixSessions").hidden ? null : document.getElementById("fixSessions").textContent.trim(),',
  '    inspectorHidden: inspector.hidden,',
  '    inspectorParent: inspector.parentElement ? (inspector.parentElement.id || inspector.parentElement.tagName) : null,',
  '    inspectorInSelectedRow: !!(selected && selected.closest("li") && inspector.parentElement === selected.closest("li")),',
  '    mode: (function(){ var b = document.querySelector(".mode[aria-pressed=\\"true\\"]"); return b ? b.getAttribute("data-mode") : null; })(),',
  '    forbidden: document.getElementById("inspectorForbidden").textContent.trim(),',
  '    forbiddenHidden: document.getElementById("inspectorForbiddenWrap").hidden,',
  '    satHeader: document.querySelector(".week-head span[data-day=\\"5\\"]").classList.contains("is-forbidden"),',
  '    satNode: (function(){ var n = document.querySelector(".plan-row.selected .week .cell:nth-child(6) .mnode"); return n ? n.className : null; })(),',
  '    satDayState: document.querySelector(".day[data-day=\\"5\\"]").getAttribute("data-state"),',
  '    satDayLabel: document.querySelector(".day[data-day=\\"5\\"]").getAttribute("aria-label"),',
  '    emptySecondary: document.getElementById("emptySecondary").textContent.trim(),',
  '    url: location.search,',
  '    width: innerWidth,',
  '    overflow: document.documentElement.scrollWidth > innerWidth + 1',
  '  };',
  '})()'
].join('\n');

async function snapshot(label) {
  const s = await evaluate(snapshotExpr);
  console.log('--- ' + label, JSON.stringify(s));
  return s;
}

(async function main() {
  try {
    const list = await waitForEndpoint();
    const page = list.find(t => t.type === 'page') || list[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', ev => handleMessage(ev.data));
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const file = 'file://' + path.join(ROOT, 'dist', 'index.html');
    await navigate(file);
    let s = await snapshot('desktop default');
    assert.equal(s.rows, 15);
    assert.equal(s.total, '15');
    assert.match(s.meta, /3 full recovery/);
    assert.equal(s.selectedRank, '01');
    assert.equal(s.selectedDays, 'Tue · Thu · Sun');
    assert.equal(s.badge, 'Full recovery');
    assert.equal(s.limitHidden, true);
    assert.equal(s.inspectorParent, 'workspace');
    assert.equal(s.overflow, false);
    await screenshot('desktop.png');

    await sleep(400);
    await evaluate(axeSource);
    const axeViolations = await evaluate("axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }).then(function(r){ return r.violations.map(function(v){ return { id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(function(n){ return n.target.join(' '); }) }; }); })");
    console.log('AXE VIOLATIONS', JSON.stringify(axeViolations, null, 2));
    assert.deepEqual(axeViolations, []);

    // Forbidden day: forbid mode, unavailable column and ring node, copy output.
    await evaluate('document.querySelector(\'.mode[data-mode="forbidden"]\').click()');
    await evaluate('document.querySelector(\'.day[data-day="5"]\').click()');
    await waitFor('document.getElementById("totalCount").textContent === "10"');
    s = await snapshot('forbidden Saturday');
    assert.equal(s.rows, 10);
    assert.match(s.meta, /3 full recovery/);
    assert.equal(s.limitHidden, true);
    assert.equal(s.mode, 'forbidden');
    assert.equal(s.forbiddenHidden, false);
    assert.equal(s.forbidden, 'Saturday');
    assert.equal(s.satHeader, true);
    assert.ok(s.satNode.includes('forbidden'));
    assert.equal(s.satDayState, 'forbidden');
    assert.match(s.satDayLabel, /unavailable/);
    await sleep(350);
    await screenshot('forbidden.png');

    await sleep(400);
    console.log('FORBIDDEN STYLES', JSON.stringify(await evaluate("(function(){ var pin=document.querySelector('.mode[data-mode=\"fixed\"]'); var act=document.querySelector('.mode[data-mode=\"forbidden\"]'); var ins=document.getElementById('inspector'); var dt=document.querySelector('.ins-stats dt'); function cs(el){ var s=getComputedStyle(el); return {color:s.color,bg:s.backgroundColor,opacity:s.opacity,fontSize:s.fontSize,animation:s.animationName}; } return {pin:cs(pin),act:cs(act),ins:cs(ins),dt:cs(dt),body:getComputedStyle(document.body).backgroundColor,paper:getComputedStyle(document.documentElement).getPropertyValue('--paper'),soft:getComputedStyle(document.documentElement).getPropertyValue('--soft'),muted:getComputedStyle(document.documentElement).getPropertyValue('--muted')}; })()")));
    const axeForbidden = await evaluate("axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }).then(function(r){ return r.violations.map(function(v){ return { id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(function(n){ return n.target.join(' '); }) }; }); })");
    console.log('AXE FORBIDDEN', JSON.stringify(axeForbidden));
    assert.deepEqual(axeForbidden, []);

    await evaluate('window.__copied = ""; document.execCommand = function(cmd){ if(cmd === "copy"){ window.__copied = document.activeElement.value; return true; } return false; };');
    await evaluate('document.getElementById("copyBtn").click()');
    await sleep(120);
    const forbiddenCopy = await evaluate('window.__copied');
    assert.match(forbiddenCopy, /Saturday  Unavailable/);
    assert.match(forbiddenCopy, /Unavailable days: Saturday/);

    // Forbidding a pinned day clears the pin; one day cannot be both.
    await evaluate('document.querySelector(\'.day[data-day="6"]\').click()');
    await waitFor('document.getElementById("inspectorPinned").textContent.trim() === "None" && document.getElementById("inspectorForbidden").textContent.includes("Sunday")');
    s = await snapshot('forbidden overrides pinned');
    assert.equal(s.mode, 'forbidden');
    assert.equal(s.forbidden, 'Saturday, Sunday');
    assert.equal(s.total, '10');

    await navigate(file);

    // UI controls: radio label, fixed-day toggle, clear and immediate update.
    await evaluate('document.querySelector(\'label[for="s4"]\').click()');
    await waitFor('document.getElementById("totalCount").textContent === "20"');
    s = await snapshot('ui four sessions with sunday');
    assert.equal(s.rows, 20);
    assert.match(s.limit, /At most 3 sessions can be separated/);

    await evaluate('document.querySelector(\'.day[data-day="0"]\').click()');
    await waitFor('document.getElementById("totalCount").textContent === "10"');
    s = await snapshot('ui sunday and monday pinned');
    assert.equal(s.rows, 10);
    assert.match(s.limit, /Sunday–Monday/);

    await evaluate('document.getElementById("clearFixed").click()');
    await waitFor('document.getElementById("totalCount").textContent === "35"');
    s = await snapshot('ui cleared fixed');
    assert.equal(s.rows, 35);
    assert.equal(await evaluate('document.getElementById("clearFixed").disabled'), true);

    await evaluate('document.querySelector(\'label[for="s5"]\').click()');
    await waitFor('document.getElementById("totalCount").textContent === "21"');
    s = await snapshot('ui five sessions');
    assert.equal(s.rows, 21);

    await navigate(file + '?sessions=4&fixed=');
    s = await snapshot('four sessions');
    assert.equal(s.rows, 35);
    assert.match(s.meta, /at the minimum/);
    assert.equal(s.limitHidden, false);
    assert.match(s.limit, /At most 3 sessions can be separated/);
    assert.match(s.badge, /Minimum overlap/);

    await navigate(file + '?sessions=3&fixed=mon,tue,fri');
    s = await snapshot('scenario D');
    assert.equal(s.rows, 1);
    assert.equal(s.selectedDays, 'Mon · Tue · Fri');
    assert.match(s.badge, /Minimum overlap/);
    assert.match(s.limit, /Monday–Tuesday/);
    assert.equal(s.limitHidden, false);

    await navigate(file + '?sessions=5&fixed=');
    s = await snapshot('scenario C');
    assert.equal(s.rows, 21);
    assert.match(s.meta, /14.* at the minimum/);
    assert.match(s.limit, /At most 3 sessions can be separated/);
    await screenshot('scenario-c.png');

    await navigate(file + '?sessions=5&fixed=&forbidden=mon,tue,wed');
    s = await snapshot('too many unavailable');
    assert.equal(s.rows, 0);
    assert.equal(s.emptyHidden, false);
    assert.equal(s.fixLabel, 'Use 4 sessions');
    assert.equal(s.emptySecondary, 'Allow all days');
    assert.match(s.limit, /^$/);
    assert.match(await evaluate('document.getElementById("emptyText").textContent'), /leaving 4 for 5 sessions/);
    await screenshot('forbidden-empty.png');
    await evaluate('document.getElementById("fixSessions").click()');
    await waitFor('document.getElementById("emptyState").hidden === true');
    s = await snapshot('fixed forbidden sessions');
    assert.equal(s.total, '1');
    assert.equal(s.rows, 1);

    await navigate(file + '?sessions=5&fixed=&forbidden=mon,tue,wed');
    await evaluate('document.getElementById("emptySecondary").click()');
    await waitFor('document.getElementById("totalCount").textContent === "21"');
    s = await snapshot('allowed all days');
    assert.equal(s.rows, 21);

    await navigate(file + '?sessions=3&fixed=mon,tue,wed,thu');
    s = await snapshot('impossible');
    assert.equal(s.rows, 0);
    assert.equal(s.emptyHidden, false);
    assert.equal(s.fixLabel, 'Use 4 sessions');
    await screenshot('impossible.png');
    await evaluate('document.getElementById("fixSessions").click()');
    await waitFor('document.getElementById("emptyState").hidden === true');
    s = await snapshot('fixed to 4 sessions');
    assert.equal(s.rows, 1);
    assert.equal(s.total, '1');

    await evaluate('document.getElementById("methodToggle").click()');
    assert.equal(await evaluate('document.getElementById("methodPanel").hidden'), false);
    assert.equal(await evaluate('document.getElementById("methodToggle").getAttribute("aria-expanded")'), 'true');
    await evaluate('document.getElementById("methodToggle").click()');
    assert.equal(await evaluate('document.getElementById("methodPanel").hidden'), true);

    await navigate(file + '?sessions=1&fixed=');
    s = await snapshot('one session');
    assert.equal(s.rows, 7);
    assert.equal(s.selectedDays, 'Mon');
    assert.match(s.badge, /Full recovery/);
    await screenshot('one-session.png');

    await navigate(file + '?sessions=6&fixed=');
    s = await snapshot('six sessions');
    assert.equal(s.rows, 7);
    assert.match(s.meta, /at the minimum/);
    assert.match(s.limit, /At most 3 sessions can be separated/);
    await screenshot('six-sessions.png');

    await navigate(file + '?sessions=7&fixed=');
    s = await snapshot('seven sessions');
    assert.equal(s.rows, 1);
    assert.match(s.badge, /No rest days/);
    assert.match(s.limit, /All seven days are workouts/);
    await screenshot('all-seven.png');

    await navigate(file + '?sessions=3&fixed=sat');
    s = await snapshot('scenario B');
    assert.equal(s.rows, 15);
    assert.match(s.meta, /3 full recovery/);

    await navigate(file + '?sessions=3&fixed=sun');
    await evaluate('window.__copied = ""; document.execCommand = function(cmd){ if(cmd === "copy"){ window.__copied = document.activeElement.value; return true; } return false; };');
    await evaluate('document.getElementById("copyBtn").click()');
    await sleep(120);
    assert.equal(await evaluate('document.getElementById("copyLabel").textContent'), 'Copied');
    const copied = await evaluate('window.__copied');
    assert.match(copied, /WEEKFORM — weekly training plan/);
    assert.match(copied, /Tuesday +Workout/);
    assert.match(copied, /Sunday +Workout \(pinned\)/);

    await evaluate('document.querySelectorAll(".plan-row")[1].focus()');
    assert.equal(await evaluate('document.activeElement.tagName'), 'BUTTON');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label").indexOf("Plan 2 of 15") === 0'), true);
    await evaluate('document.querySelectorAll(".plan-row")[1].click()');
    await sleep(120);
    s = await snapshot('second row selected');
    assert.equal(s.selectedRank, '02');

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState === "complete" && !!document.querySelector(".plan-row")', 10000);
    await evaluate('document.fonts.ready.then(function(){ return true; })');
    await sleep(200);
    s = await snapshot('mobile');
    assert.equal(s.width, 390);
    assert.equal(s.overflow, false, 'mobile must not overflow horizontally');
    assert.equal(s.inspectorInSelectedRow, true, 'inspector should sit in the selected row on mobile');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("ringWrap")).display'), 'none');
    await screenshot('mobile.png');

    await evaluate('document.getElementById("ringToggle").click()');
    await sleep(150);
    assert.notEqual(await evaluate('getComputedStyle(document.getElementById("ringWrap")).display'), 'none');
    assert.equal(await evaluate('document.getElementById("ringToggle").getAttribute("aria-expanded")'), 'true');
    await screenshot('mobile-ring.png');
    await evaluate('document.getElementById("ringToggle").click()');

    await evaluate('document.querySelectorAll(".plan-row")[2].click()');
    await sleep(150);
    s = await snapshot('mobile after selecting row 3');
    assert.equal(s.selectedRank, '03');
    assert.equal(s.inspectorInSelectedRow, true);

    await navigate(file + '?sessions=3&fixed=sun&forbidden=sat');
    s = await snapshot('mobile forbidden');
    assert.equal(s.width, 390);
    assert.equal(s.overflow, false);
    assert.equal(s.inspectorInSelectedRow, true);
    assert.equal(s.forbidden, 'Saturday');
    assert.equal(s.satDayState, 'forbidden');
    assert.equal(s.satHeader, true);
    assert.equal(await evaluate('getComputedStyle(document.getElementById("ringWrap")).display'), 'none');
    await screenshot('mobile-forbidden.png');

    await navigate(file);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState === "complete" && !!document.querySelector(".plan-row")', 10000);
    await sleep(150);
    s = await snapshot('desktop restored');
    assert.equal(s.inspectorParent, 'workspace');
    assert.equal(s.overflow, false);

    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState === "complete" && !!document.querySelector(".plan-row")', 10000);
    await sleep(150);
    s = await snapshot('tablet 1024');
    assert.equal(s.width, 1024);
    assert.equal(s.overflow, false);
    assert.equal(s.inspectorParent, 'workspace');

    await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
    await send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState === "complete" && !!document.querySelector(".plan-row")', 10000);
    await sleep(150);
    s = await snapshot('tablet 768');
    assert.equal(s.width, 768);
    assert.equal(s.overflow, false);
    assert.equal(s.inspectorInSelectedRow, true);
    await screenshot('tablet-768.png');

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
    await send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState === "complete" && !!document.querySelector(".plan-row")', 10000);
    await sleep(150);
    s = await snapshot('small mobile 320');
    assert.equal(s.width, 320);
    assert.equal(s.overflow, false);
    assert.equal(s.inspectorInSelectedRow, true);
    await screenshot('mobile-320.png');

    assert.deepEqual(exceptions, []);
    assert.deepEqual(consoleErrors, []);
    console.log('BROWSER TESTS PASSED');
  } catch (err) {
    console.error('BROWSER TEST FAILED:', err && err.stack || err);
    if (exceptions.length) console.error('Exceptions:', exceptions);
    if (consoleErrors.length) console.error('Console errors:', consoleErrors);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { chrome.kill('SIGTERM'); } catch (e) {}
    try { xvfb.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  }
})();