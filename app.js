/* OMA Curriculum App — shared shell
   Loads a manifest of curriculum JSON files, lets the coach switch between them,
   and renders using the correct template based on each file's "_type" field.
   Add a new curriculum: drop a new JSON file in /data and add one line to manifest.json.
*/

let MANIFEST = [];
let CURRENT_DATA = null;

// ---------- boot ----------
async function boot() {
  document.documentElement.dataset.theme = 'dark';
  try {
    const res = await fetch('data/manifest.json?v=' + Date.now(), { cache: 'no-store' });
    MANIFEST = await res.json();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div class="error">Could not load data/manifest.json. If you opened this file directly (file://), ' +
      'serve the folder with a local web server instead (e.g. <code>python3 -m http.server</code>) — browsers block ' +
      'fetch() for local files opened directly.</div>';
    return;
  }
  renderPicker();
  await loadCurriculum(MANIFEST[0].file);
}

function renderPicker() {
  const picker = document.getElementById('curriculumPicker');
  picker.innerHTML = '';
  MANIFEST.forEach(entry => {
    const opt = document.createElement('option');
    opt.value = entry.file;
    opt.textContent = entry.label;
    picker.appendChild(opt);
  });
  picker.onchange = () => loadCurriculum(picker.value);
}

async function loadCurriculum(file) {
  const res = await fetch('data/' + file + '?v=' + Date.now(), { cache: 'no-store' });
  CURRENT_DATA = await res.json();
  document.documentElement.style.setProperty('--accent', CURRENT_DATA._accent || '#E4572E');
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
    const primaryLabel = cls.primaryFocus === 'Forms' ? (cls.seg3 && cls.seg3.label ? cls.seg3.label.split('—').pop().trim() : 'Forms') : cls.primaryFocus;

    const warmupLines = [
      'Mindset: ' + cls.warmup.mindset,
      'Mobility: ' + cls.warmup.mobility,
      'Activation: ' + cls.warmup.activation,
    ];
    const sparringLines = [
      'Theme: ' + cls.sparring.theme + ' (ITP: ' + cls.sparring.itp + ')',
      'Footwork: ' + cls.sparring.footwork,
      'Drill: ' + cls.sparring.drill,
      'Conditioning: ' + cls.sparring.conditioning,
      'Situational: ' + cls.sparring.situational,
      'No-Contact: ' + cls.sparring.noContact,
      'Contact: ' + cls.sparring.contact,
    ];
    const dcLines = [
      cls.dailyChallenge.move + ' — ' + cls.dailyChallenge.format,
      'Standard: ' + cls.dailyChallenge.standard,
      cls.dailyChallenge.phase,
    ];

    function segBox(seg, time, primary) {
      return '<div class="section-box' + (primary ? ' primary' : '') + '">' +
        '<div class="label">' + seg.label.toUpperCase() + (primary ? ' (PRIMARY FOCUS)' : '') + '</div>' +
        ul(segLines(seg)) +
        '<div class="time">' + time + '</div></div>';
    }

    const html =
      '<div class="day-label">' + cls.dayLabel + '</div>' +
      '<div class="meta-line">45 MIN &bull; PRIMARY FOCUS: <b>' + primaryLabel + '</b></div>' +
      '<div class="grid">' +
        '<div class="col">' +
          '<div class="section-box"><div class="label">WARM-UP</div>' + ul(warmupLines) + '<div class="time">7 MIN</div></div>' +
          '<div class="section-box"><div class="label">SPARRING</div>' + ul(sparringLines) + '<div class="time">7 MIN</div></div>' +
          '<div class="water-break"><span class="label">\uD83D\uDCA7 WATER BREAK</span><span class="time">2 MIN — equipment change</span></div>' +
        '</div>' +
        '<div class="col">' +
          segBox(cls.seg3, '10 MIN', true) +
          segBox(cls.seg4, '7 MIN', false) +
          segBox(cls.seg5, '7 MIN', false) +
        '</div>' +
        '<div class="band">' +
          '<div><div class="label">DAILY CHALLENGE +<br>FLEX/ANNOUNCEMENTS</div><div class="time">3 + 5 MIN</div></div>' +
          ul(dcLines) +
        '</div>' +
        '<div class="cue-box">' + cls.cue + '</div>' +
      '</div>';

    document.getElementById('classContent').innerHTML = html;
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

    let blocksHtml = '<div class="blocks">';
    day.blocks.forEach((b, i) => {
      blocksHtml += '<div class="section-box">' +
        '<div class="num">' + (i + 1) + '</div>' +
        '<div class="content">' +
          '<div class="label">' + b.label.toUpperCase() + ' <span class="time">(' + b.minutes + ' MIN)</span></div>' +
          '<div class="body">' + b.body + '</div>' +
        '</div></div>';
    });
    blocksHtml += '</div>';

    const cueHtml = '<div class="cue-grid">' +
      '<div class="cue-cell"><div class="label">DRILL CUE</div><div class="text">' + day.cue.drillCue + '</div></div>' +
      '<div class="cue-cell"><div class="label">COACH\'S NOTE</div><div class="text">' + day.cue.coachNote + '</div></div>' +
      '<div class="cue-cell"><div class="label">FIGHT IQ Q</div><div class="text">' + day.cue.fightIqQ + '</div></div>' +
      '</div>';

    const html =
      '<div class="day-label">Week ' + (currentWeekIdx + 1) + ' &middot; ' + day.dayLabel.replace('DAY ', 'Day ') + '</div>' +
      '<div class="meta-line"><b>' + day.dayType + ' — ' + day.duration + '</b> &bull; ' + day.elementTag + ' &bull; <span class="play">&ldquo;' + day.playName + '&rdquo;</span></div>' +
      blocksHtml + cueHtml;

    document.getElementById('dayContent').innerHTML = html;
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
