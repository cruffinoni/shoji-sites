/* Weekform — Daylight interface. */
(function () {
  'use strict';

  var W = window.WeekformLogic;
  if (!W) return;

  var DAYS = W.DAYS;
  var DAY_KEYS = DAYS.map(function (d) { return d.key; });
  var DEFAULT_SESSIONS = 3;
  var DEFAULT_FIXED = [6];
  var mobileQuery = window.matchMedia('(max-width: 820px)');

  var state = {
    sessions: DEFAULT_SESSIONS,
    fixed: new Set(DEFAULT_FIXED),
    forbidden: new Set(),
    mode: 'fixed',
    selectedMask: null
  };
  var data = null;
  var copyTimer = null;
  var toastTimer = null;

  var els = {
    methodToggle: document.getElementById('methodToggle'),
    methodPanel: document.getElementById('methodPanel'),
    sessionsGroup: document.getElementById('sessionsGroup'),
    daysGroup: document.getElementById('daysGroup'),
    clearFixed: document.getElementById('clearFixed'),
    workspace: document.getElementById('workspace'),
    totalCount: document.getElementById('totalCount'),
    countWord: document.getElementById('countWord'),
    resultsMeta: document.getElementById('resultsMeta'),
    limitNote: document.getElementById('limitNote'),
    limitText: document.getElementById('limitText'),
    legend: document.getElementById('legend'),
    tableHead: document.getElementById('tableHead'),
    planList: document.getElementById('planList'),
    emptyState: document.getElementById('emptyState'),
    emptyText: document.getElementById('emptyText'),
    fixSessions: document.getElementById('fixSessions'),
    emptySecondary: document.getElementById('emptySecondary'),
    modeButtons: document.querySelectorAll('.mode'),
    foot: document.getElementById('foot'),
    retained: document.getElementById('retained'),
    inspector: document.getElementById('inspector'),
    inspectorRank: document.getElementById('inspectorRank'),
    inspectorBadge: document.getElementById('inspectorBadge'),
    inspectorBadgeText: document.getElementById('inspectorBadgeText'),
    selectedDaysLabel: document.getElementById('selectedDaysLabel'),
    inspectorGaps: document.getElementById('inspectorGaps'),
    inspectorPinned: document.getElementById('inspectorPinned'),
    inspectorForbiddenWrap: document.getElementById('inspectorForbiddenWrap'),
    inspectorForbidden: document.getElementById('inspectorForbidden'),
    ringWrap: document.getElementById('ringWrap'),
    ringToggle: document.getElementById('ringToggle'),
    ringToggleLabel: document.getElementById('ringToggleLabel'),
    ringCount: document.getElementById('ringCount'),
    copyBtn: document.getElementById('copyBtn'),
    copyLabel: document.getElementById('copyLabel'),
    weekHeadDays: document.querySelectorAll('.table-head .week-head span[data-day]'),
    copyStatus: document.createElement('p'),
    liveStatus: document.getElementById('liveStatus')
  };
  els.copyStatus.className = 'sr-only';
  els.copyStatus.setAttribute('role', 'status');
  els.copyStatus.setAttribute('aria-live', 'polite');
  if (els.copyBtn.parentNode) els.copyBtn.parentNode.insertBefore(els.copyStatus, els.copyBtn.nextSibling);

  function pad(n) { return String(n).padStart(2, '0'); }

  function titleDay(day) {
    var short = DAYS[day].short;
    return short.charAt(0) + short.slice(1).toLowerCase();
  }

  function joinList(items) {
    if (!items.length) return 'none';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function dayNames(days) {
    return days.map(function (d) { return DAYS[d].name; });
  }

  function fixedDaysArray() {
    return Array.from(state.fixed).sort(function (a, b) { return a - b; });
  }

  function forbiddenDaysArray() {
    return Array.from(state.forbidden).sort(function (a, b) { return a - b; });
  }

  function getSelected() {
    if (!data || !data.schedules.length) return null;
    return data.schedules.find(function (s) { return s.mask === state.selectedMask; }) || data.schedules[0];
  }

  function compute() {
    data = W.generateSchedules({
      sessions: state.sessions,
      fixed: fixedDaysArray(),
      forbidden: forbiddenDaysArray()
    });
    var selected = data.schedules.find(function (s) { return s.mask === state.selectedMask; });
    if (!selected) state.selectedMask = data.schedules.length ? data.schedules[0].mask : null;
  }

  function syncControls() {
    for (var n = 1; n <= 7; n++) {
      var input = document.getElementById('s' + n);
      if (input) input.checked = (n === state.sessions);
    }
    els.modeButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-mode') === state.mode));
    });
    els.daysGroup.querySelectorAll('.day').forEach(function (button) {
      var day = Number(button.getAttribute('data-day'));
      var isFixed = state.fixed.has(day);
      var isForbidden = state.forbidden.has(day);
      var dayState = isFixed ? 'fixed' : isForbidden ? 'forbidden' : 'available';
      var action;
      if (dayState === state.mode) action = 'Press to clear.';
      else if (dayState === 'fixed') action = 'Press to make unavailable.';
      else if (dayState === 'forbidden') action = 'Press to pin as a workout day.';
      else action = state.mode === 'fixed' ? 'Press to pin as a workout day.' : 'Press to make unavailable.';
      var label = DAYS[day].name + ', ' +
        (dayState === 'fixed' ? 'pinned workout day' : dayState === 'forbidden' ? 'unavailable for workouts' : 'available') +
        '. ' + action;
      button.setAttribute('data-state', dayState);
      button.setAttribute('aria-pressed', String(dayState !== 'available'));
      button.setAttribute('aria-label', label);
      button.classList.toggle('on', dayState !== 'available');
    });
    els.weekHeadDays.forEach(function (span) {
      var day = Number(span.getAttribute('data-day'));
      span.classList.toggle('is-forbidden', state.forbidden.has(day));
    });
    els.clearFixed.disabled = state.fixed.size === 0 && state.forbidden.size === 0;
  }

  function adjacentFixedPairs() {
    var pairs = [];
    for (var d = 0; d < 7; d++) {
      if (state.fixed.has(d) && state.fixed.has((d + 1) % 7)) pairs.push([d, (d + 1) % 7]);
    }
    return pairs;
  }

  function limitationText() {
    if (!data || data.total === 0) return '';
    if (state.sessions === 7) return 'All seven days are workouts, so there is no rest day to place.';

    var pairs = adjacentFixedPairs();
    var adjacent = pairs.map(function (p) {
      return DAYS[p[0]].name + '–' + DAYS[p[1]].name;
    }).join(' and ');
    var count = data.minPairs + ' adjacent pair' + (data.minPairs === 1 ? '' : 's');

    if (pairs.length) {
      var cause = pairs.length <= 2 ? 'Your pinned days include ' + adjacent : 'Your pinned days include consecutive days';
      return cause + ', so adjacent sessions are unavoidable. The closest plans have ' + count + '.';
    }
    if (data.fullCount === 0) {
      if (data.maxIndependent < state.sessions) {
        return 'At most ' + data.maxIndependent + ' sessions can be separated by a full rest day with these constraints. The closest plans have ' + count + '.';
      }
      return 'These constraints leave no way to separate every session with a full rest day. The closest plans have ' + count + '.';
    }
    return '';
  }

  function metaText() {
    if (!data || data.impossible) return 'No valid weeks.';
    var total = data.total;
    if (!total) return 'No valid weeks.';
    if (data.fullCount > 0) {
      var tighter = total - data.fullCount;
      return '<b>' + data.fullCount + '</b> full recovery' + (tighter ? ' · <b>' + tighter + '</b> tighter spacing' : '');
    }
    if (state.sessions === 7) return 'No rest days · 1 valid week';
    if (data.moreCount > 0) {
      return '<b>' + data.minimumCount + '</b> at the minimum · <b>' + data.moreCount + '</b> tighter spacing';
    }
    return '<b>' + data.minimumCount + '</b> at the minimum';
  }

  function scheduleAria(schedule) {
    var fixed = schedule.fixedDays.map(function (d) { return DAYS[d].name; });
    var forbidden = schedule.forbiddenDays.map(function (d) { return DAYS[d].name; });
    var workout = joinList(dayNames(schedule.days));
    var gapWord = schedule.pairs === 1 ? 'pair' : 'pairs';
    return 'Plan ' + schedule.rank + ' of ' + data.total + '. ' + schedule.tierLabel + '. Workouts ' + workout + '. ' +
      schedule.pairs + ' adjacent ' + gapWord + '. Rest gaps ' + schedule.gaps.join(', ') + ' days.' +
      (fixed.length ? ' Pinned: ' + joinList(fixed) + '.' : '') +
      (forbidden.length ? ' Unavailable: ' + joinList(forbidden) + '.' : '');
  }

  function rowMarkup(schedule) {
    var selected = schedule.mask === state.selectedMask;
    var cells = '';
    for (var d = 0; d < 7; d++) {
      var cls = state.forbidden.has(d) ? 'forbidden' : state.fixed.has(d) ? 'pinned' : (schedule.days.indexOf(d) !== -1 ? 'workout' : 'rest');
      cells += '<span class="cell"><i class="mnode ' + cls + '"></i></span>';
    }
    return '<li>' +
      '<button type="button" class="plan-row' + (selected ? ' selected' : '') + '" data-mask="' + schedule.mask + '" ' +
      'aria-pressed="' + String(selected) + '" aria-controls="inspector" aria-label="' + scheduleAria(schedule).replace(/"/g, '&quot;') + '">' +
        '<span class="rank" aria-hidden="true">' + pad(schedule.rank) + '</span>' +
        '<span class="week" aria-hidden="true">' + cells + '</span>' +
        '<span class="status ' + (schedule.tier === 'full' ? 'full' : '') + '" aria-hidden="true">' + schedule.statusLabel + '</span>' +
        '<span class="chev" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m3.5 2 3 3-3 3"/></svg></span>' +
      '</button>' +
    '</li>';
  }

  function renderList() {
    els.planList.innerHTML = data.schedules.map(rowMarkup).join('');
  }

  function appendText(parent, text, x, y, size, fill, family) {
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', family || 'IBM Plex Mono, monospace');
    t.setAttribute('font-size', String(size));
    t.setAttribute('fill', fill);
    t.textContent = text;
    parent.appendChild(t);
  }

  function drawRing(schedule) {
    var NS = 'http://www.w3.org/2000/svg';
    var old = els.ringWrap.querySelector('svg');
    if (old) old.remove();
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 360 360');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ringAlt(schedule));
    var C = 180, NR = 118, AR = 150, step = 360 / 7;
    function pt(r, deg) {
      var a = deg * Math.PI / 180;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    }
    function circle(r, stroke, width, fill) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(C)); c.setAttribute('cy', String(C)); c.setAttribute('r', String(r));
      c.setAttribute('fill', fill || 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', String(width));
      svg.appendChild(c);
    }
    circle(NR, '#e6ddcc', 1, 'none');

    var workouts = schedule.days.slice();
    if (workouts.length === 1) {
      circle(AR, '#2e5a43', 2, 'none');
      appendText(svg, '6d', C, 20, 12, '#6f7568');
    } else {
      for (var i = 0; i < workouts.length; i++) {
        var a = workouts[i];
        var b = workouts[(i + 1) % workouts.length];
        var span = (b - a + 7) % 7 || 7;
        var gap = span - 1;
        var start = -90 + a * step;
        var end = start + span * step;
        var p1 = pt(AR, start), p2 = pt(AR, end);
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' A' + AR + ' ' + AR + ' 0 ' + (span > 3.5 ? 1 : 0) + ' 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', gap === 0 ? '#b9552f' : '#2e5a43');
        path.setAttribute('stroke-width', gap === 0 ? '2.4' : '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('opacity', gap === 0 ? '.92' : '.7');
        svg.appendChild(path);
        if (gap > 0) {
          var mid = start + span * step / 2;
          var label = pt(164, mid);
          appendText(svg, gap + 'd', label[0], label[1], 12, '#6f7568');
        }
      }
    }

    workouts.forEach(function (dayIndex) {
      var pos = pt(NR, -90 + dayIndex * step);
      var isPinned = state.fixed.has(dayIndex);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pos[0].toFixed(2)); c.setAttribute('cy', pos[1].toFixed(2)); c.setAttribute('r', '23');
      if (isPinned) {
        c.setAttribute('fill', '#1d2a22'); c.setAttribute('stroke', '#1d2a22');
      } else {
        c.setAttribute('fill', '#2e5a43'); c.setAttribute('stroke', '#2e5a43');
      }
      c.setAttribute('stroke-width', '1');
      svg.appendChild(c);
      appendText(svg, DAYS[dayIndex].short, pos[0], pos[1], 13, '#fffbf2');
      if (isPinned) {
        var notch = document.createElementNS(NS, 'circle');
        notch.setAttribute('cx', (pos[0] + 12).toFixed(2));
        notch.setAttribute('cy', (pos[1] - 12).toFixed(2));
        notch.setAttribute('r', '3.4');
        notch.setAttribute('fill', '#fffbf2');
        svg.appendChild(notch);
      }
    });

    var allDays = [0, 1, 2, 3, 4, 5, 6];
    allDays.forEach(function (dayIndex) {
      if (workouts.indexOf(dayIndex) !== -1) return;
      var pos = pt(NR, -90 + dayIndex * step);
      var isForbidden = state.forbidden.has(dayIndex);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pos[0].toFixed(2)); c.setAttribute('cy', pos[1].toFixed(2)); c.setAttribute('r', '23');
      c.setAttribute('fill', '#fffbf2'); c.setAttribute('stroke', isForbidden ? '#c9a28f' : '#d7cdbb');
      c.setAttribute('stroke-width', '1');
      svg.appendChild(c);
      if (isForbidden) {
        var slash = document.createElementNS(NS, 'line');
        slash.setAttribute('x1', (pos[0] - 7).toFixed(2)); slash.setAttribute('y1', (pos[1] + 7).toFixed(2));
        slash.setAttribute('x2', (pos[0] + 7).toFixed(2)); slash.setAttribute('y2', (pos[1] - 7).toFixed(2));
        slash.setAttribute('stroke', '#9d4425'); slash.setAttribute('stroke-width', '1.2');
        slash.setAttribute('stroke-linecap', 'round'); slash.setAttribute('opacity', '.8');
        svg.appendChild(slash);
      }
      appendText(svg, DAYS[dayIndex].short, pos[0], pos[1], 13, isForbidden ? '#9d4425' : '#767c70');
    });

    els.ringWrap.prepend(svg);
  }

  function ringAlt(schedule) {
    var forbidden = schedule.forbiddenDays || [];
    var workout = joinList(dayNames(schedule.days));
    var rest = [0,1,2,3,4,5,6].filter(function (d) {
      return schedule.days.indexOf(d) === -1 && forbidden.indexOf(d) === -1;
    });
    var restText = rest.length ? joinList(dayNames(rest)) : 'none';
    var gapText = schedule.count === 1 ? '6 rest days' : schedule.count === 7 ? 'no rest days' : 'rest gaps ' + schedule.gaps.join(', ') + ' days';
    var pinText = schedule.fixedDays.length ? ' Pinned: ' + joinList(dayNames(schedule.fixedDays)) + '.' : '';
    var forbiddenText = forbidden.length ? ' Unavailable: ' + joinList(dayNames(forbidden)) + '.' : '';
    return 'Recovery ring. ' + schedule.count + ' sessions: ' + workout + '. Rest days: ' + restText + '. ' + gapText + '.' + pinText + forbiddenText;
  }

  function gapText(schedule) {
    if (schedule.count === 1) return '6 days';
    if (schedule.count === 7) return '0 days';
    return schedule.gaps.join(' · ') + ' days';
  }

  function renderInspector() {
    var schedule = getSelected();
    if (!schedule) {
      els.inspector.hidden = true;
      return;
    }
    els.inspector.hidden = false;
    els.inspectorRank.textContent = pad(schedule.rank) + ' / ' + pad(data.total);
    els.inspectorBadge.className = 'ins-badge' + (schedule.tier === 'minimum' ? ' minimum' : schedule.tier === 'more' ? ' more' : '');
    els.inspectorBadgeText.textContent = schedule.tierLabel;
    var visibleDays = schedule.days.map(titleDay);
    els.selectedDaysLabel.textContent = visibleDays.join(' · ');
    els.selectedDaysLabel.setAttribute('aria-label', 'Workouts ' + joinList(dayNames(schedule.days)));
    els.inspectorGaps.textContent = gapText(schedule);
    var fixed = schedule.fixedDays;
    if (fixed.length) {
      els.inspectorPinned.innerHTML = '<i class="pin-dot" aria-hidden="true"></i>' + fixed.map(function (d) { return DAYS[d].name; }).join(', ');
    } else {
      els.inspectorPinned.textContent = 'None';
    }
    var forbidden = schedule.forbiddenDays || [];
    if (forbidden.length) {
      els.inspectorForbiddenWrap.hidden = false;
      els.inspectorForbidden.textContent = forbidden.map(function (d) { return DAYS[d].name; }).join(', ');
    } else {
      els.inspectorForbiddenWrap.hidden = true;
      els.inspectorForbidden.textContent = '';
    }
    els.ringCount.textContent = String(schedule.count);
    drawRing(schedule);
    els.copyLabel.textContent = 'Copy this week';
    els.copyBtn.classList.remove('done');
    els.inspector.classList.remove('ring-open');
    if (els.ringToggle) {
      els.ringToggle.setAttribute('aria-expanded', 'false');
      if (els.ringToggleLabel) els.ringToggleLabel.textContent = 'Show recovery ring';
    }
    if (copyTimer) { clearTimeout(copyTimer); copyTimer = null; }
    els.inspector.classList.remove('is-updating');
    void els.inspector.offsetWidth;
    els.inspector.classList.add('is-updating');
  }

  function placeInspector() {
    if (!els.inspector || els.inspector.hidden) return;
    if (mobileQuery.matches) {
      var selectedRow = els.planList.querySelector('.plan-row.selected');
      var li = selectedRow ? selectedRow.closest('li') : null;
      if (li && els.inspector.parentElement !== li) li.appendChild(els.inspector);
    } else if (els.inspector.parentElement !== els.workspace) {
      els.workspace.appendChild(els.inspector);
    }
  }

  function emptyMessage() {
    var pinned = state.fixed.size;
    var forbidden = state.forbidden.size;
    var sessions = state.sessions;
    var sessionWord = sessions === 1 ? 'session' : 'sessions';
    if (data && data.reason === 'day-conflict') {
      return 'A day can’t be both pinned and unavailable.';
    }
    if (pinned > sessions) {
      return 'You’ve pinned ' + pinned + ' days but asked for ' + sessions + ' ' + sessionWord + '. Lower the session count or unpin a day.';
    }
    if (data && data.reason === 'not-enough-days') {
      return 'You’ve made ' + forbidden + ' ' + (forbidden === 1 ? 'day' : 'days') + ' unavailable, leaving ' + data.availableDays + ' for ' + sessions + ' ' + sessionWord + '. Allow a day or lower the session count.';
    }
    return 'No seven-day week can satisfy these constraints. Change the frequency or adjust the day constraints.';
  }

  function renderEmpty() {
    var isImpossible = data.impossible || data.total === 0;
    els.workspace.classList.toggle('is-empty', isImpossible);
    if (!isImpossible) {
      els.emptyState.hidden = true;
      els.legend.hidden = false;
      els.tableHead.hidden = false;
      els.planList.hidden = false;
      els.foot.hidden = false;
      return;
    }
    els.emptyState.hidden = false;
    els.legend.hidden = true;
    els.tableHead.hidden = true;
    els.planList.hidden = true;
    els.foot.hidden = true;
    els.limitNote.hidden = true;
    els.emptyText.textContent = emptyMessage();
    var target = null;
    var secondaryLabel = 'Clear all constraints';
    var secondaryAction = 'all';
    if (data && data.reason === 'too-many-fixed') {
      target = state.fixed.size;
      secondaryLabel = 'Clear pinned days';
      secondaryAction = 'fixed';
    } else if (data && data.reason === 'not-enough-days') {
      target = data.availableDays;
      secondaryLabel = 'Allow all days';
      secondaryAction = 'forbidden';
    }
    if (target !== null && target >= 1 && target <= 7) {
      els.fixSessions.hidden = false;
      els.fixSessions.textContent = 'Use ' + target + ' sessions';
    } else {
      els.fixSessions.hidden = true;
    }
    els.emptySecondary.textContent = secondaryLabel;
    els.emptySecondary.setAttribute('data-action', secondaryAction);
    els.emptySecondary.hidden = false;
    els.inspector.hidden = true;
    els.planList.innerHTML = '';
  }

  function renderBanner() {
    var text = limitationText();
    if (!text) {
      els.limitNote.hidden = true;
      els.limitText.textContent = '';
      return;
    }
    els.limitNote.hidden = false;
    els.limitText.textContent = text;
  }

  function updateURL() {
    try {
      var params = new URLSearchParams();
      params.set('sessions', String(state.sessions));
      params.set('fixed', fixedDaysArray().map(function (d) { return DAY_KEYS[d]; }).join(','));
      params.set('forbidden', forbiddenDaysArray().map(function (d) { return DAY_KEYS[d]; }).join(','));
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    } catch (err) { /* file:// or restricted history */ }
  }

  function announce(text) {
    if (els.liveStatus) els.liveStatus.textContent = text;
  }

  function render(options) {
    options = options || {};
    compute();
    syncControls();

    var total = data.total;
    els.totalCount.textContent = String(total);
    els.countWord.textContent = total === 1 ? 'week' : 'weeks';
    els.resultsMeta.innerHTML = metaText();
    els.retained.textContent = data.impossible || !total ? '' : 'All ' + total + ' valid ' + (total === 1 ? 'week' : 'weeks') + ' shown.';

    els.inspector.hidden = true;
    if (els.inspector.parentElement !== els.workspace) els.workspace.appendChild(els.inspector);
    renderEmpty();

    if (!els.emptyState.hidden) {
      renderBanner();
      updateURL();
      announce('No valid weeks. ' + els.emptyText.textContent);
      return;
    }

    renderList();
    renderBanner();
    renderInspector();
    placeInspector();
    updateURL();
    if (!options.silent) {
      var msg = total + ' valid ' + (total === 1 ? 'week' : 'weeks') + '. ' + data.fullCount + ' full recovery.';
      announce(msg);
    }
  }

  function selectSchedule(mask) {
    if (!data) return;
    var schedule = data.schedules.find(function (s) { return s.mask === mask; });
    if (!schedule) return;
    state.selectedMask = mask;
    els.planList.querySelectorAll('.plan-row').forEach(function (row) {
      var on = Number(row.getAttribute('data-mask')) === mask;
      row.classList.toggle('selected', on);
      row.setAttribute('aria-pressed', String(on));
    });
    renderInspector();
    placeInspector();
    announce('Selected plan ' + schedule.rank + ' of ' + data.total + '. ' + schedule.tierLabel + '.');
  }

  function readURL() {
    var params = new URLSearchParams(location.search);
    var sessions = Number(params.get('sessions'));
    if (Number.isInteger(sessions) && sessions >= 1 && sessions <= 7) state.sessions = sessions;
    function parseDays(name) {
      if (!params.has(name)) return null;
      return (params.get(name) || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean).map(function (key) {
        return DAY_KEYS.indexOf(key);
      }).filter(function (d) { return d >= 0; });
    }
    var fixedParam = parseDays('fixed');
    var forbiddenParam = parseDays('forbidden');
    var forbiddenDays = new Set(forbiddenParam || []);
    state.forbidden = forbiddenDays;
    if (fixedParam !== null) {
      state.fixed = new Set(fixedParam.filter(function (d) { return !forbiddenDays.has(d); }));
    } else if (params.toString()) {
      state.fixed = new Set();
    } else {
      state.fixed = new Set(DEFAULT_FIXED);
    }
    state.selectedMask = null;
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    if (!ok) throw new Error('copy failed');
  }

  function copySelected() {
    var schedule = getSelected();
    if (!schedule) return;
    var text = W.formatScheduleText(schedule, fixedDaysArray(), forbiddenDaysArray());
    function done(ok) {
      if (copyTimer) clearTimeout(copyTimer);
      els.copyLabel.textContent = ok ? 'Copied' : 'Copy failed';
      els.copyBtn.classList.toggle('done', ok);
      els.copyStatus.textContent = ok ? 'Schedule copied to clipboard.' : 'Could not copy the schedule.';
      copyTimer = setTimeout(function () {
        els.copyLabel.textContent = 'Copy this week';
        els.copyBtn.classList.remove('done');
        copyTimer = null;
      }, 1800);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        try { fallbackCopy(text); done(true); } catch (err) { done(false); }
      });
    } else {
      try { fallbackCopy(text); done(true); } catch (err) { done(false); }
    }
  }

  function handleResize() {
    placeInspector();
  }

  function init() {
    readURL();
    render({ silent: true });

    els.methodToggle.addEventListener('click', function () {
      var open = els.methodToggle.getAttribute('aria-expanded') === 'true';
      els.methodToggle.setAttribute('aria-expanded', String(!open));
      els.methodPanel.hidden = open;
    });

    els.sessionsGroup.addEventListener('change', function (event) {
      if (event.target && event.target.name === 'sessions') {
        state.sessions = Number(event.target.value);
        render();
      }
    });

    els.modeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.mode = button.getAttribute('data-mode');
        syncControls();
        announce(state.mode === 'fixed'
          ? 'Pin mode. Choose days that must include a workout.'
          : 'Forbid mode. Choose days where workouts are not possible.');
      });
    });

    els.daysGroup.addEventListener('click', function (event) {
      var button = event.target.closest('.day');
      if (!button) return;
      var day = Number(button.getAttribute('data-day'));
      if (state.mode === 'fixed') {
        if (state.fixed.has(day)) {
          state.fixed.delete(day);
        } else {
          state.fixed.add(day);
          state.forbidden.delete(day);
        }
      } else {
        if (state.forbidden.has(day)) {
          state.forbidden.delete(day);
        } else {
          state.forbidden.add(day);
          state.fixed.delete(day);
        }
      }
      render();
    });

    els.clearFixed.addEventListener('click', function () {
      state.fixed.clear();
      state.forbidden.clear();
      render();
    });

    els.planList.addEventListener('click', function (event) {
      var row = event.target.closest('.plan-row');
      if (!row) return;
      selectSchedule(Number(row.getAttribute('data-mask')));
    });

    els.copyBtn.addEventListener('click', copySelected);

    if (els.ringToggle) {
      els.ringToggle.addEventListener('click', function () {
        var open = els.inspector.classList.toggle('ring-open');
        els.ringToggle.setAttribute('aria-expanded', String(open));
        els.ringToggleLabel.textContent = open ? 'Hide recovery ring' : 'Show recovery ring';
      });
    }

    function focusAfterConstraintChange() {
      window.requestAnimationFrame(function () {
        var first = els.planList.querySelector('.plan-row');
        if (first) first.focus();
        else if (!els.fixSessions.hidden) els.fixSessions.focus();
        else els.emptySecondary.focus();
      });
    }

    els.fixSessions.addEventListener('click', function () {
      var target = null;
      if (data && data.reason === 'too-many-fixed') target = state.fixed.size;
      else if (data && data.reason === 'not-enough-days') target = data.availableDays;
      if (target !== null && target >= 1 && target <= 7) {
        state.sessions = target;
        render();
        focusAfterConstraintChange();
      }
    });

    els.emptySecondary.addEventListener('click', function () {
      var action = els.emptySecondary.getAttribute('data-action');
      if (action === 'fixed' || action === 'all') state.fixed.clear();
      if (action === 'forbidden' || action === 'all') state.forbidden.clear();
      render();
      focusAfterConstraintChange();
    });

    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleResize);
    else if (mobileQuery.addListener) mobileQuery.addListener(handleResize);
    window.addEventListener('resize', handleResize);
    window.addEventListener('popstate', function () { readURL(); render({ silent: true }); });
  }

  init();
})();