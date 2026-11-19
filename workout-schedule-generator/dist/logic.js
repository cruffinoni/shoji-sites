/* Weekform schedule logic — pure functions, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeekformLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAYS = [
    { index: 0, key: 'mon', short: 'MON', name: 'Monday' },
    { index: 1, key: 'tue', short: 'TUE', name: 'Tuesday' },
    { index: 2, key: 'wed', short: 'WED', name: 'Wednesday' },
    { index: 3, key: 'thu', short: 'THU', name: 'Thursday' },
    { index: 4, key: 'fri', short: 'FRI', name: 'Friday' },
    { index: 5, key: 'sat', short: 'SAT', name: 'Saturday' },
    { index: 6, key: 'sun', short: 'SUN', name: 'Sunday' }
  ];

  var SPORTS = [
    { key: 'gym', name: 'Gym', initial: 'G', color: '#2e5a43' },
    { key: 'running', name: 'Running', initial: 'R', color: '#785123' },
    { key: 'cycling', name: 'Cycling', initial: 'C', color: '#675078' },
    { key: 'swimming', name: 'Swimming', initial: 'S', color: '#315b76' }
  ];
  var SPORT_BY_KEY = Object.fromEntries(SPORTS.map(function (sport) { return [sport.key, sport]; }));

  function normalizeDays(days) {
    return Array.from(new Set((Array.isArray(days) ? days : []).filter(isDay))).sort(function (a, b) { return a - b; });
  }

  function isDay(value) {
    return Number.isInteger(value) && value >= 0 && value <= 6;
  }

  function maskToDays(mask) {
    var days = [];
    for (var d = 0; d < 7; d++) if (mask & (1 << d)) days.push(d);
    return days;
  }

  function daysToMask(days) {
    return days.reduce(function (mask, d) { return mask | (1 << d); }, 0);
  }

  function bitCount(mask) {
    var n = 0;
    while (mask) { n += mask & 1; mask >>>= 1; }
    return n;
  }

  function combinations(items, choose) {
    var out = [];
    if (choose < 0 || choose > items.length) return out;
    if (choose === 0) return [[]];
    function walk(start, picked) {
      if (picked.length === choose) { out.push(picked.slice()); return; }
      for (var i = start; i <= items.length - (choose - picked.length); i++) {
        picked.push(items[i]);
        walk(i + 1, picked);
        picked.pop();
      }
    }
    walk(0, []);
    return out;
  }

  function hasAdjacent(mask) {
    for (var d = 0; d < 7; d++) {
      if ((mask & (1 << d)) && (mask & (1 << ((d + 1) % 7)))) return true;
    }
    return false;
  }

  function maxIndependentCount(forbiddenMask) {
    var best = 0;
    for (var mask = 0; mask < 128; mask++) {
      if (mask & forbiddenMask) continue;
      if (hasAdjacent(mask)) continue;
      var count = bitCount(mask);
      if (count > best) best = count;
    }
    return best;
  }

  function metrics(mask) {
    var days = maskToDays(mask);
    var count = days.length;
    var pairs = 0;
    for (var d = 0; d < 7; d++) {
      if ((mask & (1 << d)) && (mask & (1 << ((d + 1) % 7)))) pairs++;
    }

    var gaps;
    if (count === 1) {
      gaps = [6];
    } else {
      gaps = days.map(function (day, i) {
        var next = days[(i + 1) % count];
        return ((next - day + 7) % 7) - 1;
      });
    }

    var sum = gaps.reduce(function (total, gap) { return total + gap; }, 0);
    var mean = sum / gaps.length;
    var variance = gaps.reduce(function (total, gap) {
      return total + Math.pow(gap - mean, 2);
    }, 0) / gaps.length;
    var minGap = Math.min.apply(null, gaps);
    var maxGap = Math.max.apply(null, gaps);

    return {
      mask: mask,
      days: days,
      count: count,
      pairs: pairs,
      gaps: gaps,
      minGap: minGap,
      maxGap: maxGap,
      variance: variance
    };
  }

  function sortSchedules(a, b) {
    return (a.pairs - b.pairs) ||
      (a.variance - b.variance) ||
      (a.maxGap - b.maxGap) ||
      (b.minGap - a.minGap) ||
      (a.mask - b.mask);
  }

  function generateSchedules(options) {
    options = options || {};
    var sessions = Number(options.sessions);
    var fixed = normalizeDays(options.fixed);
    var forbidden = normalizeDays(options.forbidden);
    var rest = normalizeDays(options.rest);
    var sportCounts = options.sportCounts === undefined ? { gym: sessions } : options.sportCounts;
    var remaining = SPORTS.map(function (sport) { return Object.hasOwn(sportCounts || {}, sport.key) ? sportCounts[sport.key] : 0; });
    var forbiddenMask = daysToMask(forbidden);
    var restMask = daysToMask(rest);
    var blockedMask = forbiddenMask | restMask;
    var availableDays = 7 - bitCount(blockedMask);
    var maxIndependent = maxIndependentCount(blockedMask);

    function impossible(reason) {
      return {
        sessions: sessions,
        fixed: fixed,
        forbidden: forbidden,
        rest: rest,
        impossible: true,
        reason: reason,
        schedules: [],
        total: 0,
        minPairs: 0,
        fullCount: 0,
        minimumCount: 0,
        moreCount: 0,
        availableDays: availableDays,
        maxIndependent: maxIndependent
      };
    }

    if (options.sportCounts === undefined && (!Number.isInteger(sessions) || sessions < 1 || sessions > 7)) {
      return impossible('invalid-sessions');
    }
    if (!sportCounts || typeof sportCounts !== 'object' || Array.isArray(sportCounts) ||
        Object.keys(sportCounts).some(function (key) { return !Object.hasOwn(SPORT_BY_KEY, key); }) ||
        remaining.some(function (count) { return !Number.isInteger(count) || count < 0 || count > 7; })) {
      return impossible('invalid-sport-counts');
    }
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 7) return impossible('invalid-sessions');
    if (remaining.reduce(function (sum, count) { return sum + count; }, 0) !== sessions) {
      return impossible('sport-total-mismatch');
    }
    if ((daysToMask(fixed) & blockedMask) || (forbiddenMask & restMask)) return impossible('day-conflict');
    if (fixed.length > sessions) return impossible('too-many-fixed');
    if (sessions > availableDays) return impossible('not-enough-days');

    var optional = [];
    for (var d = 0; d < 7; d++) {
      if (fixed.indexOf(d) === -1 && !(blockedMask & (1 << d))) optional.push(d);
    }
    var need = sessions - fixed.length;
    var combinationsFound = combinations(optional, need);

    var schedules = combinationsFound.map(function (extra) {
      var dayList = fixed.concat(extra).sort(function (a, b) { return a - b; });
      return metrics(daysToMask(dayList));
    });

    schedules.sort(sortSchedules);
    schedules = schedules.flatMap(function (schedule) {
      var assignments = [];
      var sportByDay = Array(7).fill(null);
      function assign(index) {
        if (index === schedule.days.length) {
          assignments.push(Object.assign({}, schedule, {
            id: sportByDay.map(function (key) { return key || '-'; }).join(','),
            sportByDay: sportByDay.slice()
          }));
          return;
        }
        var day = schedule.days[index];
        SPORTS.forEach(function (sport, sportIndex) {
          if (!remaining[sportIndex]) return;
          remaining[sportIndex]--;
          sportByDay[day] = sport.key;
          assign(index + 1);
          remaining[sportIndex]++;
        });
      }
      assign(0);
      return assignments;
    });
    var minPairs = schedules.length ? schedules[0].pairs : 0;
    var counts = { full: 0, minimum: 0, more: 0 };

    schedules.forEach(function (schedule, index) {
      schedule.rank = index + 1;
      schedule.fixedDays = fixed.slice();
      schedule.forbiddenDays = forbidden.slice();
      schedule.restDays = rest.slice();
      schedule.isFixed = schedule.days.filter(function (day) { return fixed.indexOf(day) !== -1; });
      if (schedule.pairs === 0) schedule.tier = 'full';
      else if (schedule.pairs === minPairs) schedule.tier = 'minimum';
      else schedule.tier = 'more';
      counts[schedule.tier]++;
      schedule.statusLabel = schedule.pairs === 0 ? 'Full' : schedule.pairs + ' adjacent';
      schedule.tierLabel = schedule.count === 7 ? 'No rest days' :
        schedule.pairs === 0 ? 'Full recovery' :
        schedule.pairs === minPairs ? 'Minimum overlap' : 'More overlap';
    });

    return {
      sessions: sessions,
      fixed: fixed,
      forbidden: forbidden,
      rest: rest,
      fixedMask: daysToMask(fixed),
      forbiddenMask: forbiddenMask,
      availableDays: availableDays,
      maxIndependent: maxIndependent,
      impossible: false,
      reason: null,
      schedules: schedules,
      total: schedules.length,
      minPairs: minPairs,
      fullCount: counts.full,
      minimumCount: counts.minimum,
      moreCount: counts.more
    };
  }

  function formatScheduleText(schedule, fixedDays, forbiddenDays) {
    var fixed = fixedDays || schedule.fixedDays || [];
    var forbidden = forbiddenDays || schedule.forbiddenDays || [];
    var lines = [];
    lines.push('WEEKFORM — weekly training plan');
    lines.push(schedule.count + (schedule.count === 1 ? ' session' : ' sessions') + ' · ' + schedule.tierLabel.toLowerCase());
    lines.push('');
    DAYS.forEach(function (day) {
      var tag;
      if (forbidden.indexOf(day.index) !== -1) tag = 'Forbidden';
      else if (schedule.sportByDay[day.index]) {
        tag = SPORT_BY_KEY[schedule.sportByDay[day.index]].name;
        if (fixed.indexOf(day.index) !== -1) tag += ' (pinned)';
      } else if (schedule.restDays.includes(day.index)) tag = 'Mandatory rest';
      else tag = 'Rest';
      lines.push(day.name.padEnd(10, ' ') + tag);
    });
    lines.push('');
    lines.push('Adjacent training-day pairs: ' + schedule.pairs);
    lines.push('Days between sessions: ' + schedule.gaps.join(', ') + ' days');
    if (forbidden.length) {
      lines.push('Forbidden days: ' + forbidden.map(function (d) { return DAYS[d].name; }).join(', '));
    }
    if (schedule.pairs === 0) {
      lines.push('Recovery: full — every session has at least one calendar day without a scheduled session before the next.');
    } else {
      lines.push('Recovery: ' + schedule.tierLabel + ' — ' + schedule.pairs + ' back-to-back pair' + (schedule.pairs === 1 ? '' : 's') + '.');
    }
    lines.push('The week repeats: Sunday and Monday are consecutive.');
    return lines.join('\n');
  }

  return {
    DAYS: DAYS,
    SPORTS: SPORTS,
    SPORT_BY_KEY: SPORT_BY_KEY,
    isDay: isDay,
    maskToDays: maskToDays,
    daysToMask: daysToMask,
    bitCount: bitCount,
    hasAdjacent: hasAdjacent,
    maxIndependentCount: maxIndependentCount,
    metrics: metrics,
    sortSchedules: sortSchedules,
    generateSchedules: generateSchedules,
    formatScheduleText: formatScheduleText
  };
});
