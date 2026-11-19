/* Weekform — Daylight interface. */
(function () {
  'use strict';

  var W = window.WeekformLogic;
  if (!W) return;

  var DAYS = W.DAYS;
  var PAGE_SIZE = 40;
  var DAY_KEYS = DAYS.map(function (d) { return d.key; });
  var DEFAULT_SESSIONS = 3;
  var DEFAULT_FIXED = [6];
  var mobileQuery = window.matchMedia('(max-width: 820px)');

  var state = {
    sessions: DEFAULT_SESSIONS,
    fixed: new Set(DEFAULT_FIXED),
    forbidden: new Set(),
    rest: new Set(),
    sportCounts: { gym: DEFAULT_SESSIONS },
    page: 1,
    selectedId: null
  };
  var data = null;
  var copyTimer = null;
  var toastTimer = null;

  var els = {
    methodToggle: document.getElementById('methodToggle'),
    methodPanel: document.getElementById('methodPanel'),
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
    return data.schedules.find(function (s) { return s.id === state.selectedId; }) || data.schedules[0];
  }

  function compute() {
    state.sessions = allocatedSessions();
    data = W.generateSchedules({
      sessions: state.sessions,
      fixed: fixedDaysArray(),
      rest: Array.from(state.rest),
      sportCounts: state.sportCounts,
      forbidden: forbiddenDaysArray()
    });
    var selected = data.schedules.find(function (s) { return s.id === state.selectedId; });
    if (!selected) state.selectedId = data.schedules.length ? data.schedules[0].id : null;
    state.page = selected ? Math.ceil(selected.rank / PAGE_SIZE) : 1;
  }

  var sportInputs = document.querySelectorAll('[data-sport-count]');
  var allocation = document.getElementById('allocation');
  var pager = document.getElementById('pager');
  var pageInput = document.getElementById('pageNumber');
  var previousPage = document.getElementById('previousPage');
  var nextPage = document.getElementById('nextPage');

  function gymOnly() {
    return W.SPORTS.slice(1).every(function (sport) { return (state.sportCounts[sport.key] ?? 0) === 0; }) &&
      state.sportCounts.gym === state.sessions;
  }

  function allocatedSessions() {
    return Object.values(state.sportCounts).reduce(function (sum, count) { return sum + count; }, 0);
  }

  function suggestedTotal() {
    var target = null;
    if (gymOnly()) {
      if (data.reason === 'too-many-fixed') target = state.fixed.size;
      if (data.reason === 'not-enough-days') target = data.availableDays;
    }
    return target !== null && target >= Math.max(1, state.fixed.size) && target <= data.availableDays ? target : null;
  }

  function describeDay(schedule, day) {
    var sport = W.SPORT_BY_KEY[schedule.sportByDay[day]];
    if (sport) return sport.name + (schedule.fixedDays.includes(day) ? ' (pinned)' : '');
    if (schedule.forbiddenDays.includes(day)) return 'Forbidden';
    return schedule.restDays.includes(day) ? 'Mandatory rest' : 'Rest';
  }

  function describeWeek(schedule) {
    return DAYS.map(function (day) { return day.name + ' ' + describeDay(schedule, day.index); }).join(', ');
  }

  var daySelectors = els.daysGroup.querySelectorAll('select');
  var sportSteppers = document.querySelector('.sports').querySelectorAll('[data-step]');

  function syncPlannerControls() {
    daySelectors.forEach(function (select) {
      var day = Number(select.dataset.day);
      select.value = state.fixed.has(day) ? 'fixed' : state.rest.has(day) ? 'rest' :
        state.forbidden.has(day) ? 'forbidden' : 'available';
      select.dataset.state = select.value;
    });
    sportSteppers.forEach(function (button) {
      var count = button.parentElement.querySelector('input').valueAsNumber;
      var atLimit = button.dataset.step === '1' ? count >= 7 : count <= 0;
      button.setAttribute('aria-disabled', String(atLimit));
    });
  }

  function syncControls() {
    sportInputs.forEach(function (input) {
      var count = state.sportCounts[input.dataset.sportCount] ?? 0;
      if (document.activeElement !== input) input.value = Number.isNaN(count) ? '' : count;
    });
    allocation.dataset.state = data.reason === 'invalid-sessions' || data.reason === 'invalid-sport-counts' ? 'warning' : 'matched';
    document.getElementById('assignedCount').textContent = Number.isFinite(state.sessions) ? state.sessions : '—';
    syncPlannerControls();
    els.weekHeadDays.forEach(function (span) {
      var day = Number(span.getAttribute('data-day'));
      span.classList.toggle('is-rest', state.rest.has(day));
      span.classList.toggle('is-forbidden', state.forbidden.has(day));
    });
    els.clearFixed.disabled = state.fixed.size === 0 && state.forbidden.size === 0 && state.rest.size === 0;
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
    if (state.sessions === 7) return 'All seven days are training days, so there is no rest day to place.';

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
        return 'At most ' + data.maxIndependent + ' sessions can be separated with a training-free day between them. The closest plans have ' + count + '.';
      }
      return 'These constraints leave no way to separate every session with a calendar day without training. The closest plans have ' + count + '.';
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
    if (state.sessions === 7) return 'No rest days';
    if (data.moreCount > 0) {
      return '<b>' + data.minimumCount + '</b> at the minimum · <b>' + data.moreCount + '</b> tighter spacing';
    }
    return '<b>' + data.minimumCount + '</b> at the minimum';
  }

  function scheduleAria(schedule) {
    return 'Plan ' + schedule.rank + ' of ' + data.total + '. ' + schedule.tierLabel + '. ' + describeWeek(schedule) + '.';
  }

  function rowMarkup(schedule) {
    var selected = schedule.id === state.selectedId;
    var cells = '';
    for (var d = 0; d < 7; d++) {
      var sport = W.SPORT_BY_KEY[schedule.sportByDay[d]];
      var cls = sport ? (schedule.fixedDays.includes(d) ? ' pinned' : '') :
        schedule.forbiddenDays.includes(d) ? 'forbidden' : schedule.restDays.includes(d) ? 'mandatory-rest' : 'rest';
      var marker = sport ? '<span class="mnode sport-node' + cls + '" style="--sport:' + sport.color + '">' + sport.initial + '</span>' :
        '<i class="mnode ' + cls + '"></i>';
      cells += '<span class="cell">' + marker + '</span>';
    }
    return '<li>' +
      '<button type="button" class="plan-row' + (selected ? ' selected' : '') + '" data-id="' + schedule.id + '" ' +
      'aria-pressed="' + String(selected) + '" aria-controls="inspector" aria-label="' + scheduleAria(schedule).replace(/"/g, '&quot;') + '">' +
        '<span class="rank" aria-hidden="true">' + pad(schedule.rank) + '</span>' +
        '<span class="week" aria-hidden="true">' + cells + '</span>' +
        '<span class="status ' + (schedule.tier === 'full' ? 'full' : '') + '" aria-hidden="true">' + schedule.statusLabel + '</span>' +
        '<span class="chev" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m3.5 2 3 3-3 3"/></svg></span>' +
      '</button>' +
    '</li>';
  }

  function renderList() {
    var start = (state.page - 1) * PAGE_SIZE;
    els.planList.start = start + 1;
    els.planList.innerHTML = data.schedules.slice(start, start + PAGE_SIZE).map(rowMarkup).join('');
    var lastPage = Math.ceil(data.total / PAGE_SIZE);
    pager.hidden = lastPage <= 1;
    pageInput.max = lastPage;
    pageInput.value = state.page;
    previousPage.disabled = state.page === 1;
    nextPage.disabled = state.page === lastPage;
    document.getElementById('pageCount').textContent = 'of ' + lastPage;
    els.retained.textContent = lastPage > 1
      ? 'Weeks ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, data.total) + ' of ' + data.total + '.'
      : 'All ' + data.total + ' valid ' + (data.total === 1 ? 'week' : 'weeks') + ' shown.';
  }

  function goToPage(page) {
    var lastPage = Math.ceil(data.total / PAGE_SIZE);
    if (!Number.isInteger(page) || page < 1 || page > lastPage) {
      pageInput.value = state.page;
      return;
    }
    els.workspace.appendChild(els.inspector);
    state.page = page;
    state.selectedId = data.schedules[(page - 1) * PAGE_SIZE].id;
    renderList();
    renderInspector();
    placeInspector();
    announce(els.retained.textContent);
    els.planList.querySelector('.plan-row.selected').focus();
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

    var trainingDays = schedule.days;
    if (trainingDays.length === 1) {
      circle(AR, '#2e5a43', 2, 'none');
      appendText(svg, '6d', C, 20, 12, '#6f7568');
    } else {
      for (var i = 0; i < trainingDays.length; i++) {
        var a = trainingDays[i];
        var b = trainingDays[(i + 1) % trainingDays.length];
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

    trainingDays.forEach(function (dayIndex) {
      var pos = pt(NR, -90 + dayIndex * step);
      var isPinned = state.fixed.has(dayIndex);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pos[0].toFixed(2)); c.setAttribute('cy', pos[1].toFixed(2)); c.setAttribute('r', '23');
      var sport = W.SPORT_BY_KEY[schedule.sportByDay[dayIndex]];
      c.setAttribute('fill', sport.color);
      c.setAttribute('stroke', sport.color);
      svg.appendChild(c);
      appendText(svg, DAYS[dayIndex].short, pos[0], pos[1] - 6, 11, '#fffbf2');
      appendText(svg, sport.initial, pos[0], pos[1] + 8, 12, '#fffbf2');
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
      if (trainingDays.indexOf(dayIndex) !== -1) return;
      var pos = pt(NR, -90 + dayIndex * step);
      var isForbidden = state.forbidden.has(dayIndex);
      var mandatory = state.rest.has(dayIndex);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pos[0].toFixed(2)); c.setAttribute('cy', pos[1].toFixed(2)); c.setAttribute('r', '23');
      c.setAttribute('fill', '#fffbf2'); c.setAttribute('stroke', isForbidden ? '#c9a28f' : mandatory ? '#2e5a43' : '#d7cdbb');
      c.setAttribute('stroke-width', '1');
      svg.appendChild(c);
      if (mandatory) {
        var outline = c.cloneNode();
        outline.setAttribute('r', '19');
        svg.appendChild(outline);
      }
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
    return 'Recovery ring. ' + describeWeek(schedule) + '. Days between sessions: ' + schedule.gaps.join(', ') + '.';
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
    els.selectedDaysLabel.setAttribute('aria-label', 'Training days ' + joinList(dayNames(schedule.days)));
    var detail = document.getElementById('weekDetails');
    detail.replaceChildren();
    DAYS.forEach(function (day) {
      var item = document.createElement('li');
      item.textContent = day.name + ' · ' + describeDay(schedule, day.index);
      detail.appendChild(item);
    });
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
      return 'A day has conflicting constraints. Choose one constraint per day.';
    }
    if (data.reason === 'invalid-sport-counts') return 'Enter a whole number from 0 to 7 for each sport.';
    if (data.reason === 'invalid-sessions') return 'Choose 1–7 sessions across all sports.';
    if (pinned > sessions) {
      return 'You’ve pinned ' + pinned + ' days but asked for ' + sessions + ' ' + sessionWord + '. Raise the session count or unpin a day.';
    }
    if (data && data.reason === 'not-enough-days') {
      if (state.rest.size) return 'Mandatory rest and forbidden days leave ' + data.availableDays + ' eligible days for ' + sessions + ' ' + sessionWord + '. Clear a day constraint or lower the session count.';
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
    pager.hidden = true;
    els.emptyState.hidden = false;
    els.legend.hidden = true;
    els.tableHead.hidden = true;
    els.planList.hidden = true;
    els.foot.hidden = true;
    els.limitNote.hidden = true;
    els.emptyText.textContent = emptyMessage();
    els.emptyText.hidden = !els.emptyText.textContent;
    var target = suggestedTotal();
    var secondaryLabel = 'Clear all constraints';
    var secondaryAction = 'all';
    if (data && data.reason === 'too-many-fixed') {
      secondaryLabel = 'Clear pinned days';
      secondaryAction = 'fixed';
    } else if (data && data.reason === 'not-enough-days') {
      secondaryLabel = state.rest.size ? 'Clear rest and forbidden days' : 'Allow all days';
      secondaryAction = 'blocked';
    }
    if (target !== null) {
      els.fixSessions.hidden = false;
      els.fixSessions.textContent = 'Use ' + target + ' Gym ' + (target === 1 ? 'session' : 'sessions');
    } else {
      els.fixSessions.hidden = true;
    }
    els.emptySecondary.textContent = secondaryLabel;
    els.emptySecondary.setAttribute('data-action', secondaryAction);
    els.emptySecondary.hidden = data.reason === 'invalid-sessions' || data.reason === 'invalid-sport-counts';
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
      if (state.rest.size) params.set('rest', DAY_KEYS.filter(function (key, index) { return state.rest.has(index); }).join(','));
      if (!gymOnly() || data.reason === 'invalid-sessions' || data.reason === 'invalid-sport-counts') {
        params.set('sports', W.SPORTS.map(function (sport) { return state.sportCounts[sport.key] ?? 0; }).join(','));
      }
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

  function selectSchedule(id) {
    if (!data) return;
    var schedule = data.schedules.find(function (s) { return s.id === id; });
    if (!schedule) return;
    state.selectedId = id;
    els.planList.querySelectorAll('.plan-row').forEach(function (row) {
      var on = row.dataset.id === id;
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
    var legacyTotal = Number.isInteger(sessions) && sessions >= 1 && sessions <= 7 ? sessions : DEFAULT_SESSIONS;
    var sports = params.get('sports');
    state.sportCounts = { gym: legacyTotal };
    if (sports !== null) {
      var counts = sports.split(',');
      if (counts.length === W.SPORTS.length) {
        state.sportCounts = Object.fromEntries(W.SPORTS.map(function (sport, index) {
          return [sport.key, /^[0-7]$/.test(counts[index]) ? Number(counts[index]) : NaN];
        }));
      }
    }
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
    state.rest = new Set(parseDays('rest') || []);
    if (fixedParam !== null) {
      state.fixed = new Set(fixedParam);
    } else if (params.toString()) {
      state.fixed = new Set();
    } else {
      state.fixed = new Set(DEFAULT_FIXED);
    }
    state.selectedId = null;
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

    sportInputs.forEach(function (input) {
      input.addEventListener('input', function () {
        state.sportCounts[input.dataset.sportCount] = input.valueAsNumber;
        render();
      });
    });
    previousPage.addEventListener('click', function () { goToPage(state.page - 1); });
    nextPage.addEventListener('click', function () { goToPage(state.page + 1); });
    pager.addEventListener('submit', function (event) {
      event.preventDefault();
      goToPage(pageInput.valueAsNumber);
    });

    els.daysGroup.addEventListener('change', function (event) {
      var select = event.target.closest('select[data-day]');
      if (!select) return;
      var day = Number(select.dataset.day);
      [state.fixed, state.rest, state.forbidden].forEach(function (set) { set.delete(day); });
      if (select.value !== 'available') state[select.value].add(day);
      render();
    });

    sportSteppers.forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('aria-disabled') === 'true') return;
        var input = button.parentElement.querySelector('input');
        var count = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
        state.sportCounts[input.dataset.sportCount] = Math.min(7, Math.max(0, Math.trunc(count) + Number(button.dataset.step)));
        if (document.activeElement === input) input.value = state.sportCounts[input.dataset.sportCount];
        render();
      });
    });

    els.clearFixed.addEventListener('click', function () {
      state.fixed.clear();
      state.forbidden.clear();
      state.rest.clear();
      render();
      daySelectors[0].focus();
    });

    els.planList.addEventListener('click', function (event) {
      var row = event.target.closest('.plan-row');
      if (!row) return;
      selectSchedule(row.dataset.id);
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
      var target = suggestedTotal();
      if (target !== null) {
        state.sportCounts.gym = target;
        render();
        focusAfterConstraintChange();
      }
    });

    els.emptySecondary.addEventListener('click', function () {
      var action = els.emptySecondary.getAttribute('data-action');
      if (action === 'fixed' || action === 'all') state.fixed.clear();
      if (action === 'blocked' || action === 'all') {
        state.forbidden.clear();
        state.rest.clear();
      }
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