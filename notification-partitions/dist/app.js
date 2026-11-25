'use strict';

const MIN_DATE = '2000-01-01';
const MAX_DATE = '2100-12-31';
const DAY_MS = 86400000;
const EPOCH = Date.UTC(2000, 0, 1);
const RETENTION = 7;
const I18N = window.PARTITION_I18N;
const LANGS = ['en', 'fr', 'es'];
const LOCALES = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };

const dateInput = document.getElementById('date');
const todayButton = document.getElementById('today');
const nextButton = document.getElementById('next');
const stateGrid = document.getElementById('state-grid');
const stateCaption = document.getElementById('state-caption');
const liveRegion = document.getElementById('live');
const ring = document.getElementById('ring');
const ringCenter = document.getElementById('ring-center');
const ringCaption = document.getElementById('ring-caption');
const sliceBar = document.getElementById('slice-bar');
const sliceCaption = document.getElementById('slice-caption');
const cycle = document.getElementById('cycle-chips');
const cycleCaption = document.querySelector('#cycle-caption span');
const scheduleBody = document.getElementById('schedule-body');
const scheduleCaption = document.getElementById('schedule-caption');
const retentionNumber = document.getElementById('retention-number');
const retentionValue = document.getElementById('retention-value');
const retentionLive = document.getElementById('retention-live');
const retentionPips = document.getElementById('retention-pips');
const themeToggle = document.getElementById('theme-toggle');
const langButton = document.getElementById('lang-button');
const langMenu = document.getElementById('lang-menu');
const langCode = document.getElementById('lang-code');
const langOptions = document.querySelectorAll('#lang-menu [data-lang]');

const params = new URLSearchParams(location.search);
let lang = 'en';
try {
  const stored = localStorage.getItem('notification-partitions:lang');
  if (LANGS.includes(stored)) lang = stored;
} catch (error) { /* storage unavailable */ }
if (LANGS.includes(params.get('lang'))) lang = params.get('lang');
let date = validDate(params.get('date') || '') ? params.get('date') : parisToday();
date = clampDate(date);
let knownToday = parisToday();

let dateFormatter;
let shortDateFormatter;

function t(key, vars) {
  const table = I18N[lang] || I18N.en;
  let text = table[key] || I18N.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((name) => {
      text = text.split('{' + name + '}').join(String(vars[name]));
    });
  }
  return text;
}

function setLocale() {
  const locale = LOCALES[lang] || LOCALES.en;
  dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  shortDateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
setLocale();

function dayNumber(value) {
  const parts = value.split('-').map(Number);
  return (Date.UTC(parts[0], parts[1] - 1, parts[2]) - EPOCH) / DAY_MS;
}

function dateFromNumber(number) {
  return new Date(EPOCH + number * DAY_MS).toISOString().slice(0, 10);
}

function addDays(value, amount) {
  return dateFromNumber(dayNumber(value) + amount);
}

function partition(value) {
  return ((dayNumber(value) % 9) + 9) % 9;
}

function parisToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function display(value) {
  const parts = value.split('-').map(Number);
  return dateFormatter.format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

function displayShort(value) {
  const parts = value.split('-').map(Number);
  return shortDateFormatter.format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}


const COPY_BINDINGS = [
  { sel: '.brand-text > span', key: 'brandGuide' },
  { sel: '.skip', key: 'skip' },
  { sel: '#hero-title', key: 'heroTitle', html: true },
  { sel: '.lede', key: 'heroLede', html: true },
  { sel: '.facts', key: 'factsAria', attr: 'aria-label' },
  { sel: '.facts li:nth-child(1) > span:last-child', key: 'factsPartitions', html: true },
  { sel: '.facts li:nth-child(2) > span:last-child', key: 'factsDays', html: true },
  { sel: '.facts li:nth-child(3) > span:last-child', key: 'factsRotation', html: true },
  { sel: '.controls', key: 'controlsAria', attr: 'aria-label' },
  { sel: '.date-field > span', key: 'controlsDate' },
  { sel: '#today-label', key: 'controlsToday' },
  { sel: '#next-label', key: 'controlsNext' },
  { sel: '#computed-text', key: 'computed' },
  { sel: '#state-title', key: 'stateTitle' },
  { sel: '#idea .rail-kicker', key: 'railIdea' },
  { sel: '#cycle-section .rail-kicker', key: 'railCycle' },
  { sel: '#midnight .rail-kicker', key: 'railCleanup' },
  { sel: '#rules .rail-kicker', key: 'railRules' },
  { sel: '#schedule .rail-kicker', key: 'railSchedule' },
  { sel: '#technical .rail-kicker', key: 'railEngineers' },
  { sel: '#idea-title', key: 'ideaTitle' },
  { sel: '#idea .split > div:first-child p:nth-of-type(1)', key: 'ideaP1', html: true },
  { sel: '#idea .split > div:first-child p:nth-of-type(2)', key: 'ideaP2', html: true },
  { sel: '.slice-head span:nth-child(1)', key: 'sliceTable' },
  { sel: '.slice-head span:nth-child(2)', key: 'sliceCount' },
  { sel: '#cycle-title', key: 'cycleTitle' },
  { sel: '#cycle-section .section-body > p:first-of-type', key: 'cycleP', html: true },
  { sel: '#cycle-chips', key: 'cycleAria', attr: 'aria-label' },
  { sel: '#cycle-section .small-note', key: 'cycleSmall' },
  { sel: '#midnight-title', key: 'midnightTitle' },
  { sel: '#midnight .section-body > p:first-of-type', key: 'midnightP', html: true },
  { sel: '.step:nth-child(1) h3', key: 'step1Title' },
  { sel: '.step:nth-child(1) p', key: 'step1P', html: true },
  { sel: '.step:nth-child(2) h3', key: 'step2Title' },
  { sel: '.step:nth-child(2) p', key: 'step2P', html: true },
  { sel: '.step:nth-child(3) h3', key: 'step3Title' },
  { sel: '.step:nth-child(3) p', key: 'step3P', html: true },
  { sel: '#midnight .note', key: 'midnightNote' },
  { sel: '#rules-title', key: 'rulesTitle' },
  { sel: '#rules .section-body > p:first-of-type', key: 'rulesP', html: true },
  { sel: '.retention-cell:nth-child(1) .retention-label', key: 'retentionLabel' },
  { sel: '#retention-value', key: 'retentionValue' },
  { sel: '.retention-cell:nth-child(1) .retention-sub', key: 'retentionSub' },
  { sel: '.retention-cell:nth-child(2) .retention-label', key: 'slotsLabel' },
  { sel: '.retention-cell:nth-child(2) .retention-sub', key: 'slotsSub' },
  { sel: '.retention-panel', key: 'retentionAria', attr: 'aria-label' },
  { sel: '.rules-list', key: 'rulesList', html: true },
  { sel: '#rules .small-note', key: 'rulesSmall' },
  { sel: '#schedule-title', key: 'scheduleTitle' },
  { sel: '#schedule .section-body > p:first-of-type', key: 'scheduleP', html: true },
  { sel: '#schedule th:nth-child(1)', key: 'scheduleTh1' },
  { sel: '#schedule th:nth-child(2)', key: 'scheduleTh2' },
  { sel: '#schedule th:nth-child(3)', key: 'scheduleTh3' },
  { sel: '#schedule .small-note', key: 'scheduleSmall' },
  { sel: '#tech-title', key: 'techTitle' },
  { sel: '#technical summary', key: 'techSummary', html: true },
  { sel: '.tech-item:nth-child(1) h3', key: 'techFormulaTitle' },
  { sel: '.tech-item:nth-child(1) p', key: 'techFormulaP', html: true },
  { sel: '.tech-item:nth-child(2) h3', key: 'techRetentionTitle' },
  { sel: '.tech-item:nth-child(2) p', key: 'techRetentionP', html: true },
  { sel: '.tech-item:nth-child(3) h3', key: 'techRotationTitle' },
  { sel: '.tech-item:nth-child(3) p', key: 'techRotationP', html: true },
  { sel: '.tech-item:nth-child(4) h3', key: 'techTablesTitle' },
  { sel: '.tech-item:nth-child(4) p', key: 'techTablesP', html: true },
  { sel: '#technical .small-note', key: 'techSmall' },
  { sel: '.footer p', key: 'footer', html: true }
];

function applyStaticCopy() {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('metaDescription'));
  COPY_BINDINGS.forEach((binding) => {
    const element = document.querySelector(binding.sel);
    if (!element) return;
    if (binding.attr) element.setAttribute(binding.attr, t(binding.key));
    else if (binding.html) element.innerHTML = t(binding.key);
    else element.textContent = t(binding.key);
  });
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });
  langCode.textContent = lang.toUpperCase();
  langButton.setAttribute('aria-label', t('langChange'));
  langButton.setAttribute('title', t('langChange'));
  langMenu.setAttribute('aria-label', t('langMenu'));
  langOptions.forEach((option) => {
    option.setAttribute('aria-current', option.dataset.lang === lang ? 'true' : 'false');
  });
  updateThemeLabel();
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < MIN_DATE || value > MAX_DATE) return false;
  return dateFromNumber(dayNumber(value)) === value;
}

function clampDate(value) {
  if (value < MIN_DATE) return MIN_DATE;
  if (value > MAX_DATE) return MAX_DATE;
  return value;
}

function computeState(value) {
  const retention = RETENTION;
  const liveCount = retention + 1;

  const slots = Array.from({ length: 9 }, (_, offset) => {
    const day = addDays(value, -offset);
    const status = offset === 0 ? 'today' : offset <= retention ? 'held' : 'empty';
    return { id: partition(day), day: day, offset: offset, status: status };
  }).sort((a, b) => a.id - b.id);

  const today = slots.find((slot) => slot.status === 'today');
  const tomorrowDate = addDays(value, 1);
  const tomorrowId = partition(tomorrowDate);
  const becameEmptyDay = addDays(value, -(retention + 1));
  const becameEmpty = slots.find((slot) => slot.id === partition(becameEmptyDay));
  const emptyCount = 9 - liveCount;

  const next = Array.from({ length: 9 }, (_, index) => {
    const eventDate = addDays(value, index + 1);
    const droppedDay = addDays(eventDate, -(retention + 1));
    return {
      eventDate: eventDate,
      incomingId: partition(eventDate),
      droppedDay: droppedDay,
      droppedId: partition(droppedDay)
    };
  });

  return {
    retention: retention,
    liveCount: liveCount,
    emptyCount: emptyCount,
    slots: slots,
    today: today,
    tomorrowDate: tomorrowDate,
    tomorrowId: tomorrowId,
    becameEmptyDay: becameEmptyDay,
    becameEmpty: becameEmpty,
    next: next
  };
}

function statusLabel(slot, retention) {
  if (slot.status === 'today') return t('ringStatusToday');
  if (slot.status === 'held') {
    return t('ringStatusHeld', { date: display(addDays(slot.day, retention + 1)) });
  }
  return t('ringStatusEmpty', {
    date: display(addDays(slot.day, retention + 1)),
    last: display(slot.day)
  });
}

function polar(cx, cy, radius, degrees) {
  const angle = (degrees - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function arcPath(index, outerRadius, innerRadius) {
  const gap = 2.4;
  const start = index * 40 + gap / 2;
  const end = (index + 1) * 40 - gap / 2;
  const outerStart = polar(180, 180, outerRadius, start);
  const outerEnd = polar(180, 180, outerRadius, end);
  const innerEnd = polar(180, 180, innerRadius, end);
  const innerStart = polar(180, 180, innerRadius, start);
  return 'M ' + outerStart[0].toFixed(2) + ' ' + outerStart[1].toFixed(2) +
    ' A ' + outerRadius + ' ' + outerRadius + ' 0 0 1 ' + outerEnd[0].toFixed(2) + ' ' + outerEnd[1].toFixed(2) +
    ' L ' + innerEnd[0].toFixed(2) + ' ' + innerEnd[1].toFixed(2) +
    ' A ' + innerRadius + ' ' + innerRadius + ' 0 0 0 ' + innerStart[0].toFixed(2) + ' ' + innerStart[1].toFixed(2) + ' Z';
}

function renderRing(state) {
  const parts = [];
  parts.push('<svg viewBox="0 0 360 360" focusable="false">');
  parts.push('<defs><pattern id="emptyHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-base" width="8" height="8"></rect><line class="hatch-line" x1="0" y1="0" x2="0" y2="8" stroke-width="1.6"></line></pattern></defs>');
  parts.push('<circle class="dial" cx="180" cy="180" r="170"></circle>');

  state.slots.forEach((slot) => {
    const point = polar(180, 180, 136, slot.id * 40 + 20);
    parts.push('<g class="seg ' + slot.status + '"><path d="' + arcPath(slot.id, 158, 106) + '"></path><text x="' + point[0].toFixed(2) + '" y="' + point[1].toFixed(2) + '">p' + slot.id + '</text><title>p' + slot.id + ' · ' + statusLabel(slot, state.retention) + '</title></g>');
  });

  const marker = polar(180, 180, 170, state.today.id * 40 + 20);
  parts.push('<circle class="today-marker" cx="' + marker[0].toFixed(2) + '" cy="' + marker[1].toFixed(2) + '" r="4"></circle>');
  parts.push('</svg>');
  ring.innerHTML = parts.join('');

  const isToday = date === parisToday();
  ringCenter.innerHTML =
    '<span class="ring-kicker">' + (isToday ? t('stateToday') : t('stateSelected')) + '</span>' +
    '<strong>p' + state.today.id + '</strong>' +
    '<span class="ring-date">' + displayShort(date) + '</span>' +
    '<span class="ring-env">' + t('ringInUseCount', { n: state.liveCount }) + '</span>';

  ringCaption.textContent = t('ringCaption', {
    date: display(date),
    today: 'p' + state.today.id,
    live: state.liveCount,
    empty: state.emptyCount,
    next: 'p' + state.tomorrowId
  });
}

function renderState(state) {
  const isToday = date === parisToday();
  const dayWord = isToday ? t('stateToday') : t('stateSelected');
  const emptyWord = t('stateBecameEmpty');
  const emptySub = t(isToday ? 'stateLastHeldToday' : 'stateLastHeld', { date: display(state.becameEmpty.day) });

  const cards = [
    { label: dayWord, dot: 'coral', value: 'p' + state.today.id, sub: display(date) },
    { label: t('stateNext'), dot: '', value: 'p' + state.tomorrowId, sub: display(state.tomorrowDate) },
    { label: emptyWord, dot: 'sand', value: 'p' + state.becameEmpty.id, sub: emptySub },
    { label: t('stateEmptyNow'), dot: 'ink', value: state.emptyCount + ' / 9', sub: t('stateInUse', { n: state.liveCount }) }
  ];

  stateGrid.innerHTML = cards.map((card) => {
    return '<div class="state-card">' +
      '<div class="state-label">' + card.label + '</div>' +
      '<div class="state-value"><span class="dot ' + card.dot + '"></span><span class="p">' + card.value + '</span></div>' +
      '<div class="state-sub">' + card.sub + '</div>' +
      '</div>';
  }).join('');

  let caption = t(isToday ? 'stateCaptionToday' : 'stateCaptionSelected', {
    date: display(date),
    today: 'p' + state.today.id,
    empty: 'p' + state.becameEmpty.id,
    retention: state.retention
  });
  if (state.emptyCount > 1) {
    caption += t('stateOtherEmpty', { n: state.emptyCount - 1 });
  }
  stateCaption.textContent = caption;

  liveRegion.textContent = t('stateLive', {
    date: display(date),
    day: dayWord,
    today: 'p' + state.today.id,
    next: 'p' + state.tomorrowId,
    empty: 'p' + state.becameEmpty.id,
    n: state.emptyCount
  });
}

function renderIdea(state) {
  const isToday = date === parisToday();
  const slices = [];
  for (let id = 0; id < 9; id += 1) {
    slices.push('<span class="slice' + (id === state.today.id ? ' today' : '') + '">p' + id + '</span>');
  }
  sliceBar.innerHTML = slices.join('');
  sliceBar.setAttribute('aria-label', t(isToday ? 'sliceAriaToday' : 'sliceAriaSelected', { p: 'p' + state.today.id }));
  sliceCaption.textContent = t(isToday ? 'sliceCaptionToday' : 'sliceCaptionSelected', { p: 'p' + state.today.id });
}

function renderCycle(state) {
  const isToday = date === parisToday();
  const chips = [];
  for (let id = 0; id < 9; id += 1) {
    const selected = id === state.today.id;
    chips.push('<span class="cycle-chip' + (selected ? ' today' : '') + '" role="listitem"' +
      (selected ? ' aria-current="date"' : '') + '>p' + id +
      (selected ? '<span class="sr-only"> (selected)</span>' : '') + '</span>');
  }
  cycle.innerHTML = chips.join('');
  cycleCaption.textContent = t('cycleCaption', {
    day: isToday ? t('stateToday') : t('stateSelected'),
    today: 'p' + state.today.id,
    next: 'p' + state.tomorrowId
  });
}

function renderRetention() {
  const live = RETENTION + 1;
  retentionNumber.textContent = String(RETENTION);
  retentionValue.textContent = t('retentionValue');
  retentionLive.textContent = live + ' / 9';
  retentionPips.innerHTML = Array.from({ length: 9 }, (_, index) =>
    '<span class="pip' + (index < live ? '' : ' empty') + '"></span>'
  ).join('');
}

function renderSchedule(state) {
  const rows = [];
  state.next.forEach((row, index) => {
    rows.push('<tr' + (index === 0 ? ' class="next"' : '') + '>' +
      '<td><span class="date">' + display(row.eventDate) + '</span>' +
      (index === 0 ? '<span class="tag">' + t('scheduleTag') + '</span>' : '') + '</td>' +
      '<td><span class="slot">p' + row.incomingId + '</span></td>' +
      '<td><span class="slot muted">p' + row.droppedId + '</span><span class="small">' + display(row.droppedDay) + '</span></td>' +
      '</tr>');
  });
  scheduleBody.innerHTML = rows.join('');
  scheduleCaption.textContent = t('scheduleCaption', { date: display(date) });
}

function updateUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete('env');
    url.searchParams.set('date', date);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
  } catch (error) {
    // A file:// preview may not support replaceState; the page still works.
  }
}

function render() {
  const state = computeState(date);
  dateInput.value = date;
  todayButton.disabled = date === parisToday();
  nextButton.disabled = date >= MAX_DATE;
  renderRing(state);
  renderState(state);
  renderIdea(state);
  renderCycle(state);
  renderRetention();
  renderSchedule(state);
  updateUrl();
}

dateInput.addEventListener('change', () => {
  if (validDate(dateInput.value)) {
    date = dateInput.value;
    render();
  } else {
    dateInput.value = date;
  }
});

todayButton.addEventListener('click', () => {
  date = clampDate(parisToday());
  render();
});

nextButton.addEventListener('click', () => {
  if (date >= MAX_DATE) return;
  date = addDays(date, 1);
  render();
});

function updateThemeLabel() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = t(dark ? 'themeToLight' : 'themeToDark');
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('title', label);
}

function setTheme(theme) {
  const dark = theme === 'dark';
  if (dark) {
    document.documentElement.dataset.theme = 'dark';
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeLabel();
  try {
    localStorage.setItem('notification-partitions:theme', dark ? 'dark' : 'light');
  } catch (error) {
    // Storage may be unavailable; the toggle still works for this page.
  }
}

let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
setTheme(theme);

themeToggle.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
});

function closeLangMenu(focusButton) {
  langMenu.hidden = true;
  langButton.setAttribute('aria-expanded', 'false');
  if (focusButton) langButton.focus();
}

function openLangMenu() {
  langMenu.hidden = false;
  langButton.setAttribute('aria-expanded', 'true');
  const active = langMenu.querySelector('[data-lang="' + lang + '"]');
  if (active) active.focus();
}

function setLanguage(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  try {
    localStorage.setItem('notification-partitions:lang', lang);
  } catch (error) {
    // Storage may be unavailable; the language still applies for this page.
  }
  setLocale();
  applyStaticCopy();
  render();
  closeLangMenu();
}

langButton.addEventListener('click', () => {
  if (langMenu.hidden) openLangMenu();
  else closeLangMenu();
});

langOptions.forEach((option) => {
  option.addEventListener('click', () => {
    setLanguage(option.dataset.lang);
    langButton.focus();
  });
});

document.addEventListener('click', (event) => {
  if (!langMenu.hidden && !langButton.parentElement.contains(event.target)) {
    closeLangMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !langMenu.hidden) {
    closeLangMenu(true);
  }
});

window.setInterval(() => {
  const current = parisToday();
  if (current === knownToday) return;
  const wasToday = date === knownToday;
  knownToday = current;
  if (wasToday) {
    date = current;
    render();
  } else {
    todayButton.disabled = date === current;
  }
}, 60000);

setLocale();
applyStaticCopy();
render();
