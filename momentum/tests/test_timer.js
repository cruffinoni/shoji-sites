const assert = require('node:assert/strict');
const Timer = require('../web/timer.js');

let now = 1_000_000;
const clock = () => now;
const config = Timer.DEFAULT_CONFIG;

assert.deepEqual({...config}, {workMinutes:25, shortBreakMinutes:5, longBreakMinutes:15, longBreakInterval:4});
assert.equal(Timer.validateConfig({...config, workMinutes:0}).valid, false);
assert.equal(Timer.validateConfig({...config, longBreakInterval:1.5}).valid, false);
assert.equal(Timer.validateConfig({...config, shortBreakMinutes:8}).config.shortBreakMinutes, 8);

let state = Timer.createState();
state = Timer.start(state, {now:clock(), config, selectedTaskId:'task-A'});
assert.equal(state.status, 'running');
assert.equal(state.taskId, 'task-A');
assert.equal(Timer.remainingMs(state, now), 25*60_000);
now += 10*60_000;
assert.equal(Timer.remainingMs(state, now), 15*60_000, 'remaining derives from absolute end timestamp');
state = Timer.pause(state, now);
const paused = Timer.remainingMs(state, now);
now += 60*60_000;
assert.equal(Timer.remainingMs(state, now), paused, 'paused time does not elapse');
state = Timer.start(state,{now,config,selectedTaskId:'changed-focus'});
assert.equal(state.taskId,'task-A','resuming a paused work session preserves its original task association');
state = Timer.pause(state,now);
state = Timer.resume(state, now);
assert.equal(Timer.remainingMs(state, now), paused);
assert.equal(Timer.pause(state,state.endsAt).status,'finished','pausing at expiry records completion rather than freezing an expired timer');
state = Timer.reset(state);
assert.equal(state.status, 'idle');
assert.equal(state.taskId, null);

now = 2_000_000;
state = Timer.start(Timer.createState(), {now, config, selectedTaskId:'task-B'});
state = Timer.recover(state, now + 25*60_000, config);
assert.equal(state.status, 'finished');
assert.equal(state.completedWork, 1);
assert.equal(state.taskId, 'task-B');
assert.equal(Timer.recover(state, now + 30*60_000, config).completedWork, 1, 'expiry recovery counts once');
assert.equal(Timer.nextPhase(state, config).phase, 'short');
assert.equal(Timer.nextPhase(state, config).status, 'idle', 'next phase is selected but not started');
assert.equal(Timer.nextPhase(state, config).taskId, null);

now += 26*60_000;
state = Timer.start(Timer.nextPhase(state, config), {now, config, selectedTaskId:'task-C'});
assert.equal(Timer.recover(state, now + 5*60_000, config).completedWork, 1, 'break expiry does not increment work count');
let work = Timer.createState();
for (let i=1;i<=4;i++) {
  work=Timer.start(work,{now,config,selectedTaskId:`task-${i}`});
  work=Timer.recover(work,now+25*60_000,config);
  const next=Timer.nextPhase(work,config);
  assert.equal(next.phase,i===4?'long':'short');
  assert.equal(next.status,'idle');
  work=Timer.start(next,{now,config,selectedTaskId:'ignored-on-break'});
  assert.equal(work.taskId,null,'breaks are not associated with the selected task');
  work=Timer.recover(work,now+(i===4?15:5)*60_000,config);
  work=Timer.nextPhase(work,config);
}
assert.equal(work.phase,'work');
assert.equal(work.status,'idle');

const stored = Timer.serialize({state,config});
const restored = Timer.deserialize(stored, now, clock);
assert.equal(restored.state.endsAt, state.endsAt, 'running state remains timestamp-based after reload');
assert.equal(Timer.remainingMs(restored.state, now), Timer.remainingMs(state, now));
const expiredRestored = Timer.deserialize(Timer.serialize({state:Timer.start(Timer.createState(),{now,config,selectedTaskId:'task-D'}),config}),now+25*60_000,()=>now+25*60_000);
assert.equal(expiredRestored.state.completedWork,1,'reload after expiry counts completion exactly once');
assert.equal(Timer.deserialize(Timer.serialize(expiredRestored),now+26*60_000,()=>now+26*60_000).state.completedWork,1);
assert.equal(Timer.deserialize('{broken',now,clock).state.status,'idle');

const zeroDuration = {phase:'short',status:'running',startedAt:now,endsAt:now,remainingMs:null,completedWork:3,taskId:'stale-task'};
const zeroDurationRecovered = Timer.recover(zeroDuration,now);
assert.equal(zeroDurationRecovered.status,'idle','zero-duration running state resets safely at its end timestamp');
assert.equal(zeroDurationRecovered.phase,'short');
assert.equal(zeroDurationRecovered.completedWork,3,'zero-duration recovery does not count a work completion');
assert.equal(zeroDurationRecovered.taskId,null,'zero-duration recovery clears task association');

for (const endsAt of [null, NaN, Infinity]) {
  const malformed = {phase:'short',status:'running',startedAt:now,endsAt,remainingMs:null,completedWork:3,taskId:'stale-task'};
  const recovered = Timer.recover(malformed,now+1_000_000);
  assert.equal(recovered.status,'idle','running state without a finite end timestamp resets safely');
  assert.equal(recovered.phase,'short');
  assert.equal(recovered.completedWork,3,'malformed running state does not count accidental completion');
  assert.equal(recovered.taskId,null);
  assert.deepEqual(Timer.recover(recovered,now+1_000_000),recovered,'malformed-state recovery is idempotent');
}
for (const remainingMs of [null, NaN, Infinity]) {
  const malformed = {phase:'work',status:'paused',startedAt:null,endsAt:null,remainingMs,completedWork:2,taskId:'task-E'};
  const recovered = Timer.recover(malformed,now);
  assert.equal(recovered.status,'idle','paused state without finite remaining time resets safely');
  assert.equal(Timer.resume(recovered,now).status,'idle','malformed paused state cannot resume as a zero-duration run');
  assert.equal(recovered.completedWork,2);
  assert.equal(recovered.taskId,null);
}
const malformedStored = JSON.stringify({version:1,state:{phase:'long',status:'running',startedAt:now,endsAt:null,completedWork:5,taskId:'stale'},config});
const malformedRestored = Timer.deserialize(malformedStored,now+60_000);
assert.equal(malformedRestored.state.status,'idle','reload safely normalizes malformed running timestamps');
assert.equal(malformedRestored.state.phase,'long');
assert.equal(malformedRestored.state.completedWork,5);
assert.deepEqual(Timer.deserialize(Timer.serialize(malformedRestored),now+120_000).state,malformedRestored.state,'serialized recovery remains stable after reload');

console.log('timer engine behavior passed');
