const assert = require('node:assert/strict');
const W = require('../dist/logic.js');

function checkShape(r, k, fixed) {
  assert.equal(r.impossible, false, 'expected feasible');
  assert.equal(r.total, r.schedules.length);
  assert.equal(r.schedules.length, r.schedules.length);
  const masks = new Set();
  for (const s of r.schedules) {
    assert.equal(s.count, k, 'exact count');
    for (const d of fixed) assert.ok(s.days.includes(d), 'fixed day included: ' + d);
    assert.ok(!masks.has(s.mask), 'unique mask ' + s.mask);
    masks.add(s.mask);
  }
  for (let i = 1; i < r.schedules.length; i++) {
    const a = r.schedules[i - 1], b = r.schedules[i];
    assert.ok(a.pairs <= b.pairs, 'pairs sorted');
    if (a.pairs === b.pairs) assert.ok(a.variance <= b.variance + 1e-9, 'variance sorted within pairs');
  }
}

// Scenario A: 3 sessions, Sunday pinned
let a = W.generateSchedules({ sessions: 3, fixed: [6] });
checkShape(a, 3, [6]);
assert.equal(a.total, 15);
assert.equal(a.fullCount, 3);
assert.equal(a.minPairs, 0);
assert.deepEqual(a.schedules.slice(0, 3).map(s => s.days), [[1,3,6],[1,4,6],[2,4,6]]);
assert.equal(a.schedules[0].gaps.join(','), '1,2,1');

// Scenario B: 3 sessions, Saturday pinned
let b = W.generateSchedules({ sessions: 3, fixed: [5] });
checkShape(b, 3, [5]);
assert.equal(b.total, 15);
assert.equal(b.fullCount, 3);
assert.deepEqual(b.schedules.slice(0, 3).map(s => s.days), [[0,2,5],[0,3,5],[1,3,5]]);

// Scenario C: 5 sessions, no fixed
let c = W.generateSchedules({ sessions: 5, fixed: [] });
checkShape(c, 5, []);
assert.equal(c.total, 21);
assert.equal(c.fullCount, 0);
assert.equal(c.minPairs, 3);
assert.equal(c.minimumCount, 14);
assert.equal(c.moreCount, 7);

// Scenario D: 3 sessions, Mon/Tue/Fri pinned
let d = W.generateSchedules({ sessions: 3, fixed: [0,1,4] });
checkShape(d, 3, [0,1,4]);
assert.equal(d.total, 1);
assert.equal(d.schedules[0].pairs, 1);
assert.equal(d.schedules[0].tier, 'minimum');
assert.equal(d.schedules[0].tierLabel, 'Minimum overlap');

// Single session
let one = W.generateSchedules({ sessions: 1, fixed: [] });
checkShape(one, 1, []);
assert.equal(one.total, 7);
assert.equal(one.fullCount, 7);
assert.deepEqual(one.schedules[0].gaps, [6]);
assert.match(W.formatScheduleText(one.schedules[0], one.fixed), /^WEEKFORM — weekly training plan\n1 session · full recovery/);

// Six and seven sessions
let six = W.generateSchedules({ sessions: 6, fixed: [] });
checkShape(six, 6, []);
assert.equal(six.total, 7);
assert.equal(six.minPairs, 5);
assert.equal(six.schedules[0].tierLabel, 'Minimum overlap');
let seven = W.generateSchedules({ sessions: 7, fixed: [] });
checkShape(seven, 7, []);
assert.equal(seven.total, 1);
assert.equal(seven.schedules[0].pairs, 7);
assert.deepEqual(seven.schedules[0].gaps, [0,0,0,0,0,0,0]);
assert.equal(seven.schedules[0].tierLabel, 'No rest days');

// Four sessions (unavoidable overlap)
let four = W.generateSchedules({ sessions: 4, fixed: [] });
checkShape(four, 4, []);
assert.equal(four.total, 35);
assert.equal(four.fullCount, 0);
assert.equal(four.minPairs, 1);
assert.ok(four.minimumCount > 0);
assert.ok(four.moreCount > 0);

// Impossible
let bad = W.generateSchedules({ sessions: 3, fixed: [0,1,2,3] });
assert.equal(bad.impossible, true);
assert.equal(bad.reason, 'too-many-fixed');
assert.equal(bad.total, 0);

// Cyclic adjacency: Sun + Mon must count as adjacent
let cyc = W.generateSchedules({ sessions: 2, fixed: [0,6] });
checkShape(cyc, 2, [0,6]);
assert.equal(cyc.total, 1);
assert.equal(cyc.schedules[0].pairs, 1);

// Copy output
const copy = W.formatScheduleText(a.schedules[0], a.fixed);
assert.ok(copy.includes('WEEKFORM'));
assert.ok(copy.includes('Tuesday   Gym'));
assert.ok(copy.includes('Monday    Rest'));
assert.ok(copy.includes('Sunday    Gym (pinned)'));
assert.ok(copy.includes('Adjacent training-day pairs: 0'));
assert.ok(copy.includes('Sunday and Monday are consecutive'));

// Forbidden days are never scheduled and still consume rest-day space.
let forb = W.generateSchedules({ sessions: 3, fixed: [6], forbidden: [5] });
assert.equal(forb.impossible, false);
assert.equal(forb.total, 10);
assert.equal(forb.fullCount, 3);
assert.equal(forb.maxIndependent, 3);
for (const sched of forb.schedules) {
  assert.ok(!sched.days.includes(5), 'forbidden Saturday never scheduled');
  assert.ok(sched.days.includes(6), 'fixed Sunday included');
}
const forbCopy = W.formatScheduleText(forb.schedules[0], forb.fixed, forb.forbidden);
assert.ok(forbCopy.includes('Saturday  Forbidden'));
assert.ok(forbCopy.includes('Forbidden days: Saturday'));

// A day cannot be both fixed and forbidden.
let conflict = W.generateSchedules({ sessions: 3, fixed: [0], forbidden: [0] });
assert.equal(conflict.impossible, true);
assert.equal(conflict.reason, 'day-conflict');

// Too many unavailable days for the requested frequency.
let noRoom = W.generateSchedules({ sessions: 5, fixed: [], forbidden: [0, 1, 2] });
assert.equal(noRoom.impossible, true);
assert.equal(noRoom.reason, 'not-enough-days');
assert.equal(noRoom.availableDays, 4);

// Forbidden days can make full recovery impossible even at three sessions.
let tight = W.generateSchedules({ sessions: 3, fixed: [], forbidden: [1, 2, 3, 4] });
assert.equal(tight.total, 1);
assert.equal(tight.fullCount, 0);
assert.equal(tight.maxIndependent, 2);
assert.equal(tight.schedules[0].pairs, 2);
assert.equal(tight.schedules[0].tierLabel, 'Minimum overlap');

console.log('All logic tests passed');
console.log('A', a.total, a.fullCount, a.schedules[0].days.join(','));
console.log('B', b.total, b.fullCount, b.schedules[0].days.join(','));
console.log('C', c.total, 'min', c.minPairs, 'minCount', c.minimumCount, 'more', c.moreCount);
console.log('D', d.schedules[0].days.join(','), d.schedules[0].tierLabel);
console.log('4', four.total, 'minCount', four.minimumCount, 'more', four.moreCount);
const counts = { gym: 2, running: 1, cycling: 1, swimming: 1 };

function verifyExhaustive(options, total) {
  const result = W.generateSchedules({ sessions: 5, sportCounts: counts, ...options });
  const symbols = ['-', ...W.SPORTS.map(sport => sport.key)];
  const expected = new Set();
  for (let code = 0; code < symbols.length ** 7; code++) {
    const week = Array.from({ length: 7 }, (_, day) => symbols[Math.floor(code / symbols.length ** day) % symbols.length]);
    if ((options.fixed || []).some(day => week[day] === '-')) continue;
    if ([...(options.rest || []), ...(options.forbidden || [])].some(day => week[day] !== '-')) continue;
    if (Object.entries(counts).every(([sport, count]) => week.filter(key => key === sport).length === count)) {
      expected.add(week.join(','));
    }
  }
  assert.equal(result.total, total);
  assert.deepEqual(new Set(result.schedules.map(schedule => schedule.id)), expected);
  assert.equal(result.total, expected.size);
  for (const schedule of result.schedules) {
    assert.equal(schedule.sportByDay.map(key => key || '-').join(','), schedule.id);
  }
  return result.schedules[0];
}

const mixed = verifyExhaustive({ fixed: [0], rest: [1], forbidden: [2] }, 60);
verifyExhaustive({}, 1260);
assert.match(W.formatScheduleText(mixed), /Monday    Gym \(pinned\)\nTuesday   Mandatory rest\nWednesday Forbidden/);
assert.equal(W.generateSchedules({ sessions: 3, sportCounts: { running: 2 } }).reason, 'sport-total-mismatch');
assert.equal(W.generateSchedules({ sessions: 3, sportCounts: { gym: 3, running: 0.5 } }).reason, 'invalid-sport-counts');
assert.equal(W.generateSchedules({ sessions: 3, rest: [1], forbidden: [1] }).reason, 'day-conflict');
assert.equal(W.generateSchedules({ sessions: 3, rest: [1], fixed: [1] }).reason, 'day-conflict');
assert.equal(W.generateSchedules({ sessions: 6, rest: [1], forbidden: [2] }).reason, 'not-enough-days');
