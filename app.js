/* OMA Curriculum App — shared shell
   Loads a manifest of curriculum JSON files, lets the coach switch between them,
   and renders using the correct template based on each file's "_type" field.
   Add a new curriculum: drop a new JSON file in /plans and add one line to manifest.json.
*/

let MANIFEST = [];
let CURRENT_DATA = null;

// Accent color follows the belt-rank / form system, not a fixed per-file color.
// Colors match the traditional rank association for each Songahm curriculum form.
// NOTE: "Songahm 1" below is a best guess for the form name heard as "Songahm Won"
// in the source recording — flag this if it should read differently.
const FORM_COLORS = {
  'Songahm White': '#C7CBD1',
  'Songahm 1':      '#C7CBD1',
  'Songahm 2':      '#E8821A',
  'Songahm 3':      '#E8C619',
  'Songahm 4':      '#8A9A73',
  'Songahm 5':      '#3C8C4A',
  'In Wha 1':       '#7A4FA0',
  'In Wha 2':       '#3E6FE4',
  'Choong Jung 1':  '#8B5A2B',
  'Choong Jung 2':  '#C21E2B',
};
const DEFAULT_ACCENT = '#E4572E';

function formAccentFromSubtitle(subtitle) {
  if (!subtitle) return DEFAULT_ACCENT;
  const formName = subtitle.split('•')[0].trim();
  return FORM_COLORS[formName] || DEFAULT_ACCENT;
}

// ---------- boot ----------
async function boot() {
  document.documentElement.dataset.theme = 'dark';
  try {
    const res = await fetch('plans/manifest.json?v=' + Date.now(), { cache: 'no-store' });
    MANIFEST = await res.json();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div class="error">Could not load plans/manifest.json. If you opened this file directly (file://), ' +
      'serve the folder with a local web server instead (e.g. <code>python3 -m http.server</code>) — browsers block ' +
      'fetch() for local files opened directly.</div>';
    return;
  }
  renderCyclePicker();
}

// Builds the top-level "which time period" dropdown: each monthly cycle, plus any
// standalone year-round tracks (like Ascend) appended at the end. Defaults to
// whichever cycle contains today's date, so the app opens to the current curriculum
// automatically without the coach having to pick it each time.
function renderCyclePicker() {
  const picker = document.getElementById('cyclePicker');
  picker.innerHTML = '';

  const cycles = MANIFEST.cycles || [];
  const standalone = MANIFEST.standalone || [];

  cycles.forEach(c => {
    const opt = document.createElement('option');
    opt.value = 'cycle:' + c.key;
    opt.textContent = c.label;
    picker.appendChild(opt);
  });
  standalone.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = 'standalone:' + i;
    opt.textContent = s.label;
    picker.appendChild(opt);
  });

  const today = new Date();
  let defaultValue = null;
  for (const c of cycles) {
    const start = new Date(c.startDate);
    const end = new Date(c.endDate);
    if (today >= start && today <= end) { defaultValue = 'cycle:' + c.key; break; }
  }
  if (!defaultValue) {
    // No cycle contains today (e.g. between cycles, or none scheduled yet) —
    // fall back to whichever cycle hasn't ended yet, otherwise the most recent one.
    const upcoming = cycles.find(c => today <= new Date(c.endDate));
    defaultValue = upcoming ? 'cycle:' + upcoming.key : (cycles.length ? 'cycle:' + cycles[cycles.length - 1].key : (standalone.length ? 'standalone:0' : null));
  }
  if (defaultValue) picker.value = defaultValue;

  picker.onchange = () => renderPlanPicker(picker.value);
  renderPlanPicker(picker.value);
}

function renderPlanPicker(cycleValue) {
  const planPicker = document.getElementById('planPicker');
  planPicker.innerHTML = '';

  let plans = [];
  if (cycleValue && cycleValue.startsWith('cycle:')) {
    const key = cycleValue.slice('cycle:'.length);
    const cycle = (MANIFEST.cycles || []).find(c => c.key === key);
    plans = cycle ? cycle.plans : [];
  } else if (cycleValue && cycleValue.startsWith('standalone:')) {
    const idx = parseInt(cycleValue.slice('standalone:'.length), 10);
    const s = (MANIFEST.standalone || [])[idx];
    plans = s ? [s] : [];
  }

  plans.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.file;
    opt.textContent = p.label;
    planPicker.appendChild(opt);
  });

  planPicker.onchange = () => loadCurriculum(planPicker.value);
  if (plans.length) loadCurriculum(plans[0].file);
}

async function loadCurriculum(file) {
  const res = await fetch('plans/' + file + '?v=' + Date.now(), { cache: 'no-store' });
  CURRENT_DATA = await res.json();
  document.documentElement.style.setProperty('--accent', CURRENT_DATA._accent || formAccentFromSubtitle(CURRENT_DATA.CYCLE_SUBTITLE));
  document.documentElement.style.setProperty('--accent2', CURRENT_DATA._accent2 || '#3E8E7E');
  document.getElementById('cycleTitle').textContent = CURRENT_DATA._appTitle || '';

  if (CURRENT_DATA._type === 'advanced-cycle') {
    initAdvancedCycle(CURRENT_DATA);
  } else if (CURRENT_DATA._type === 'ascend-fullyear') {
    initAscendFullYear(CURRENT_DATA);
  } else {
    document.getElementById('app').innerHTML = '<div class="error">Unknown curriculum type: ' + CURRENT_DATA._type + '</div>';
  }
}

function toggleTheme() {
  const el = document.documentElement;
  el.dataset.theme = el.dataset.theme === 'light' ? 'dark' : 'light';
}

function ul(lines) {
  return '<ul>' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul>';
}

function ul_slide(lines) {
  return '<ul class="slide-list">' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul>';
}

/* =========================================================
   SLIDE DECK ENGINE — shared by both templates.
   slides: array of { className, html }. footerHtml: persistent note strip
   shown under every slide (the coach's cue), not part of the deck itself.
   ========================================================= */
let _slideDeckKeyHandler = null;

function renderSlideDeck(container, slides, footerHtml) {
  let idx = 0;

  container.innerHTML =
    '<div class="slidedeck">' +
      '<div class="slide-viewport"><div class="slide-track">' +
        slides.map(s => '<div class="slide ' + (s.className || '') + '">' + s.html + '</div>').join('') +
      '</div></div>' +
      '<div class="slide-nav-row">' +
        '<button class="slide-nav-btn" id="slidePrev">\u2039</button>' +
        '<div class="slide-dots" id="slideDots"></div>' +
        '<button class="slide-nav-btn" id="slideNext">\u203a</button>' +
      '</div>' +
      (footerHtml ? '<div class="slide-footer">' + footerHtml + '</div>' : '') +
    '</div>';

  const track = container.querySelector('.slide-track');
  const dotsWrap = container.querySelector('#slideDots');
  const prevBtn = container.querySelector('#slidePrev');
  const nextBtn = container.querySelector('#slideNext');
  const viewport = container.querySelector('.slide-viewport');

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.onclick = () => { idx = i; update(); };
    dotsWrap.appendChild(dot);
  });

  function update() {
    track.style.transform = 'translateX(-' + (idx * 100) + '%)';
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === slides.length - 1;
    Array.from(dotsWrap.children).forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  prevBtn.onclick = () => { if (idx > 0) { idx--; update(); } };
  nextBtn.onclick = () => { if (idx < slides.length - 1) { idx++; update(); } };

  // Swipe support for tablets
  let touchStartX = null;
  viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener('touchend', e => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 45) {
      if (dx < 0 && idx < slides.length - 1) { idx++; update(); }
      else if (dx > 0 && idx > 0) { idx--; update(); }
    }
    touchStartX = null;
  }, { passive: true });

  // Keyboard arrows — replace any previous deck's handler so old closures don't linger
  if (_slideDeckKeyHandler) document.removeEventListener('keydown', _slideDeckKeyHandler);
  _slideDeckKeyHandler = (e) => {
    if (e.key === 'ArrowRight') nextBtn.onclick();
    if (e.key === 'ArrowLeft') prevBtn.onclick();
  };
  document.addEventListener('keydown', _slideDeckKeyHandler);

  update();
}

/* =========================================================
   TEMPLATE A — "advanced-cycle"
   Shape: { CYCLE_TITLE, CYCLE_SUBTITLE, ALL_CLASSES: [{week, cls, dayLabel, ...}] }
   Two levels: Week tabs -> Class tabs (A/B/C)
   ========================================================= */
function initAdvancedCycle(data) {
  const app = document.getElementById('app');
  app.innerHTML =
    '<div class="subtitle" id="advSubtitle"></div>' +
    '<nav class="tabs-underline" id="weekTabs"></nav>' +
    '<nav class="tabs-pill" id="classTabs"></nav>' +
    '<div id="classContent"></div>';
  document.getElementById('advSubtitle').textContent = data.CYCLE_SUBTITLE || '';

  const WEEK_THEME = {}; // could be data-driven later; left empty by default
  let currentWeek = 1;
  let currentClass = 'A';
  const totalWeeks = Math.max(...data.ALL_CLASSES.map(c => c.week));

  function segLines(seg) {
    const lines = [(seg.stage || '') + (seg.technique ? ' — ' + seg.technique : ''), seg.detail];
    if (seg.note) lines.push(seg.note);
    return lines;
  }

  function renderWeekTabs() {
    const nav = document.getElementById('weekTabs');
    nav.innerHTML = '';
    for (let w = 1; w <= totalWeeks; w++) {
      const btn = document.createElement('button');
      btn.innerHTML = 'Week ' + w + (WEEK_THEME[w] ? '<span class="theme-sub">' + WEEK_THEME[w] + '</span>' : '');
      if (w === currentWeek) btn.classList.add('active');
      btn.onclick = () => { currentWeek = w; render(); };
      nav.appendChild(btn);
    }
  }

  function renderClassTabs() {
    const nav = document.getElementById('classTabs');
    nav.innerHTML = '';
    ['A', 'B', 'C'].forEach(c => {
      const cls = data.ALL_CLASSES.find(x => x.week === currentWeek && x.cls === c);
      if (!cls) return;
      const btn = document.createElement('button');
      btn.textContent = 'Class ' + c + ' — ' + cls.dayLabel;
      if (c === currentClass) btn.classList.add('active');
      btn.onclick = () => { currentClass = c; render(); };
      nav.appendChild(btn);
    });
  }

  function renderContent() {
    const cls = data.ALL_CLASSES.find(x => x.week === currentWeek && x.cls === currentClass);
    if (!cls) { document.getElementById('classContent').innerHTML = '<div class="error">No class found.</div>'; return; }

    // Belt levels vary in which fields they track (e.g. Beginner tracks footwork
    // under warm-up instead of sparring, and uses heavyFocus instead of primaryFocus).
    // Build each line list from whatever fields are actually present rather than
    // assuming a fixed shape, so one template covers every cycle.
    const focusField = cls.primaryFocus || cls.heavyFocus || '';
    const primaryLabel = focusField === 'Forms' ? (cls.seg3 && cls.seg3.label ? cls.seg3.label.split('—').pop().trim() : 'Forms') : focusField;

    function line(label, value) {
      return (value !== undefined && value !== null && value !== '') ? label + ': ' + value : null;
    }

    const warmupLines = [
      line('Mindset', cls.warmup.mindset),
      line('Mobility', cls.warmup.mobility),
      line('Activation', cls.warmup.activation),
      line('Footwork', cls.warmup.footwork),
    ].filter(Boolean);

    const sparringLines = [
      line('Theme', cls.sparring.theme + (cls.sparring.itp ? ' (ITP: ' + cls.sparring.itp + ')' : '')),
      line('Footwork', cls.sparring.footwork),
      line('Drill', cls.sparring.drill),
      line('Conditioning', cls.sparring.conditioning),
      line('Situational', cls.sparring.situational),
      line('No-Contact', cls.sparring.noContact),
      line('Contact', cls.sparring.contact),
    ].filter(Boolean);

    const dcLines = [
      (cls.dailyChallenge.move || '') + (cls.dailyChallenge.format ? ' — ' + cls.dailyChallenge.format : ''),
      line('Standard', cls.dailyChallenge.standard),
      cls.dailyChallenge.phase,
    ].filter(Boolean);

    const waterBreakText = cls.waterBreak || '2 MIN — equipment change';

    // Build the tap/swipe-through slide sequence: one overview slide, then one
    // slide per section, so an instructor mid-class can glance and tab forward
    // without hunting through a dense page.
    const slides = [];

    slides.push({
      className: 'slide-overview',
      html:
        '<div class="slide-kicker">Overview</div>' +
        '<div class="slide-title">' + cls.dayLabel + '</div>' +
        '<div class="slide-time">45 MIN &bull; PRIMARY FOCUS: ' + primaryLabel + '</div>' +
        '<ul class="toc">' +
          '<li><span class="n">1</span> Warm-Up</li>' +
          '<li><span class="n">2</span> Sparring</li>' +
          '<li><span class="n">3</span> ' + cls.seg3.label + ' (Primary Focus)</li>' +
          '<li><span class="n">4</span> ' + cls.seg4.label + '</li>' +
          '<li><span class="n">5</span> ' + cls.seg5.label + '</li>' +
          '<li><span class="n">6</span> Water Break</li>' +
          '<li><span class="n">7</span> Daily Challenge + Announcements</li>' +
        '</ul>'
    });

    slides.push({
      html: '<div class="slide-kicker">Section 1 of 5</div><div class="slide-title">Warm-Up</div>' +
        '<div class="slide-time">7 MIN</div>' + ul_slide(warmupLines)
    });

    slides.push({
      html: '<div class="slide-kicker">Section 2 of 5</div><div class="slide-title">Sparring</div>' +
        '<div class="slide-time">7 MIN</div>' + ul_slide(sparringLines)
    });

    function segSlide(seg, sectionNum, time, primary) {
      return {
        html: '<div class="slide-kicker">Section ' + sectionNum + ' of 5' + (primary ? ' &bull; Primary Focus' : '') + '</div>' +
          '<div class="slide-title">' + seg.label + '</div>' +
          '<div class="slide-time">' + time + '</div>' +
          ul_slide(segLines(seg))
      };
    }
    slides.push(segSlide(cls.seg3, 3, '10 MIN', true));
    slides.push(segSlide(cls.seg4, 4, '7 MIN', false));
    slides.push(segSlide(cls.seg5, 5, '7 MIN', false));

    slides.push({
      className: 'slide-waterbreak',
      html: '<div class="wb-icon">\uD83D\uDCA7</div><div class="slide-title">Water Break</div><div class="slide-time">' + waterBreakText + '</div>'
    });

    slides.push({
      html: '<div class="slide-kicker">Daily Challenge + Announcements</div>' +
        '<div class="slide-title">' + (cls.dailyChallenge.move || 'Daily Challenge') + '</div>' +
        '<div class="slide-time">3 + 5 MIN</div>' + ul_slide(dcLines)
    });

    const cueText = cls.cue.replace(/^Coach's Note:\s*/i, '');
    renderSlideDeck(document.getElementById('classContent'), slides, '<b>Coach\u2019s Note:</b> ' + cueText);
  }

  function render() {
    renderWeekTabs();
    renderClassTabs();
    renderContent();
  }

  render();
}

/* =========================================================
   TEMPLATE B — "ascend-fullyear"
   Shape: { cycles: [{ key, label, title, subtitle, overviewRows, weeks: [{ days: [{blocks, cue}] }] }] }
   Three levels: Cycle tabs -> Week tabs -> Day tabs, plus an overview table per cycle
   ========================================================= */
function initAscendFullYear(data) {
  const app = document.getElementById('app');
  app.innerHTML =
    '<nav class="tabs-pill" id="cycleTabs"></nav>' +
    '<div class="cycle-heading"><div class="title" id="cycleHeadingTitle"></div><div class="sub" id="cycleHeadingSub"></div></div>' +
    '<table class="overview-table" id="overviewTable"></table>' +
    '<nav class="tabs-underline" id="weekTabs"></nav>' +
    '<nav class="tabs-pill deep" id="dayTabs"></nav>' +
    '<div id="dayContent"></div>';

  const cycles = data.cycles;
  let currentCycleIdx = 0;
  let currentWeekIdx = 0;
  let currentDayIdx = 0;

  function renderCycleTabs() {
    const nav = document.getElementById('cycleTabs');
    nav.innerHTML = '';
    cycles.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.textContent = c.label;
      if (i === currentCycleIdx) btn.classList.add('active');
      btn.onclick = () => { currentCycleIdx = i; currentWeekIdx = 0; currentDayIdx = 0; render(); };
      nav.appendChild(btn);
    });
  }

  function renderCycleHeading() {
    const c = cycles[currentCycleIdx];
    document.getElementById('cycleHeadingTitle').textContent = c.title;
    document.getElementById('cycleHeadingSub').textContent = c.subtitle;
  }

  function renderOverviewTable() {
    const c = cycles[currentCycleIdx];
    const table = document.getElementById('overviewTable');
    let html = '<thead><tr><th>WK</th><th>Focus</th><th>Session / Play</th><th>Fight IQ Theme</th></tr></thead><tbody>';
    c.overviewRows.forEach((r, i) => {
      html += '<tr><td>' + (i + 1) + '</td><td class="focus-cell">' + r.focus + '</td><td>' + r.session + '</td><td class="fightiq-cell">' + r.fightIq + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function renderWeekTabs() {
    const c = cycles[currentCycleIdx];
    const nav = document.getElementById('weekTabs');
    nav.innerHTML = '';
    c.weeks.forEach((w, i) => {
      const btn = document.createElement('button');
      btn.textContent = 'Week ' + (i + 1);
      if (i === currentWeekIdx) btn.classList.add('active');
      btn.onclick = () => { currentWeekIdx = i; currentDayIdx = 0; render(); };
      nav.appendChild(btn);
    });
  }

  function renderDayTabs() {
    const c = cycles[currentCycleIdx];
    const week = c.weeks[currentWeekIdx];
    const nav = document.getElementById('dayTabs');
    nav.innerHTML = '';
    week.days.forEach((d, i) => {
      const btn = document.createElement('button');
      btn.textContent = d.dayLabel.replace('DAY ', 'Day ') + ' — ' + d.dayType;
      if (i === currentDayIdx) btn.classList.add('active');
      btn.onclick = () => { currentDayIdx = i; render(); };
      nav.appendChild(btn);
    });
  }

  function renderDayContent() {
    const c = cycles[currentCycleIdx];
    const week = c.weeks[currentWeekIdx];
    const day = week.days[currentDayIdx];

    // Same slide-deck pattern as the belt-rank cycles: overview slide, then one
    // slide per block, with the coach's note pinned as a persistent footer.
    const dayTitle = 'Week ' + (currentWeekIdx + 1) + ' \u00b7 ' + day.dayLabel.replace('DAY ', 'Day ');
    const slides = [];

    slides.push({
      className: 'slide-overview',
      html:
        '<div class="slide-kicker">Overview</div>' +
        '<div class="slide-title">' + dayTitle + '</div>' +
        '<div class="slide-time">' + day.dayType + ' \u2014 ' + day.duration + ' \u2022 ' + day.elementTag + ' \u2022 \u201c' + day.playName + '\u201d</div>' +
        '<ul class="toc">' +
          day.blocks.map((b, i) => '<li><span class="n">' + (i + 1) + '</span> ' + b.label + '</li>').join('') +
          '<li><span class="n">' + (day.blocks.length + 1) + '</span> Drill Cue</li>' +
          '<li><span class="n">' + (day.blocks.length + 2) + '</span> Fight IQ Question</li>' +
        '</ul>'
    });

    day.blocks.forEach((b, i) => {
      slides.push({
        html: '<div class="slide-kicker">Block ' + (i + 1) + ' of ' + day.blocks.length + '</div>' +
          '<div class="slide-title">' + b.label + '</div>' +
          '<div class="slide-time">' + b.minutes + ' MIN</div>' +
          '<p class="slide-body">' + b.body + '</p>'
      });
    });

    slides.push({
      html: '<div class="slide-kicker">Drill Cue</div><div class="slide-title">On the Whistle</div><p class="slide-body">' + day.cue.drillCue + '</p>'
    });
    slides.push({
      html: '<div class="slide-kicker">Fight IQ Question</div><div class="slide-title">Ask the Class</div><p class="slide-body">' + day.cue.fightIqQ + '</p>'
    });

    renderSlideDeck(document.getElementById('dayContent'), slides, '<b>Coach\u2019s Note:</b> ' + day.cue.coachNote);
  }

  function render() {
    renderCycleTabs();
    renderCycleHeading();
    renderOverviewTable();
    renderWeekTabs();
    renderDayTabs();
    renderDayContent();
  }

  render();
}

boot();
