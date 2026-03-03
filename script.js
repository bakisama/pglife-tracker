// ==================== PG Life Tracker — IIT Hyderabad ====================

(function () {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEYS = {
    startDate: 'pglt-start-date',
    programType: 'pglt-program-type',
    scores: 'pglt-scores',
    overrides: 'pglt-overrides',
  };

  const PROGRAM_YEARS = { mtech: 2, ms: 3, phd: 5 };

  const PERIOD_TYPES = {
    monsoon: { label: 'Monsoon Semester', isBreak: false },
    winterBreak: { label: 'Winter Break', isBreak: true },
    spring: { label: 'Spring Semester', isBreak: false },
    summerBreak: { label: 'Summer Break', isBreak: true },
  };

  const SCORE_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---- DOM References ----
  const $ = (id) => document.getElementById(id);
  const startDateInput = $('startDate');
  const programTypeSelect = $('programType');
  const buildBtn = $('buildBtn');
  const setupCard = $('setupCard');
  const advancedToggle = $('advancedToggle');
  const advancedBtn = $('advancedBtn');
  const advancedPanel = $('advancedPanel');
  const advancedContent = $('advancedContent');
  const saveOverridesBtn = $('saveOverrides');
  const clearOverridesBtn = $('clearOverrides');
  const statsBar = $('statsBar');
  const currentWeekBar = $('currentWeekBar');
  const todayDisplay = $('todayDisplay');
  const calendarGrid = $('calendarGrid');
  const footer = $('footer');
  const modalOverlay = $('modalOverlay');
  const modal = $('modal');
  const modalTitle = $('modalTitle');
  const modalSubtitle = $('modalSubtitle');
  const modalClose = $('modalClose');
  const clearScoreBtn = $('clearScore');
  const cancelModalBtn = $('cancelModal');
  const tooltip = $('tooltip');

  // ---- State ----
  let allWeeks = [];
  let scores = {};
  let overrides = {};
  let currentModalWeek = null;

  // ---- Date Utilities ----
  function mondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function addWeeks(date, n) {
    return addDays(date, n * 7);
  }

  function formatDate(date) {
    const d = new Date(date);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatDateShort(date) {
    const d = new Date(date);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function toISODate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function parseDate(str) {
    const parts = str.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  // Get Nth weekday of a month (e.g., 3rd Monday of July)
  function getNthWeekday(year, month, weekday, n) {
    const first = new Date(year, month, 1);
    let day = first.getDay();
    let diff = (weekday - day + 7) % 7;
    let date = 1 + diff + (n - 1) * 7;
    return new Date(year, month, date);
  }

  // Last Monday of a month
  function getLastMonday(year, month) {
    const last = new Date(year, month + 1, 0); // last day of month
    const day = last.getDay();
    const diff = (day - 1 + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
  }

  // ---- Semester Date Calculations (IITH Academic Calendar) ----
  // Based on actual IITH calendars:
  //   Monsoon: 4th Monday of July, 17 weeks (classes + exams)
  //   Winter Break: after monsoon → before spring
  //   Spring: 1st Monday of January, 17 weeks (classes + exams)
  //   Summer Break: after spring → before next monsoon
  function calcDefaultPeriods(startDate, numYears) {
    const periods = [];
    const start = new Date(startDate);
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const startsInMonsoon = startMonth >= 6; // July onwards

    for (let y = 0; y < numYears; y++) {
      const calYear = startsInMonsoon ? startYear + y : startYear + y - 1;
      const yearLabel = `Year ${y + 1}`;

      // Monsoon Semester: 4th Monday of July, 17 weeks
      // e.g. 28 Jul 2025 → 23 Nov 2025
      const monsoonStart = y === 0 && startsInMonsoon
        ? mondayOfWeek(start)
        : getNthWeekday(calYear, 6, 1, 4); // 4th Monday of July
      const monsoonEnd = addDays(addWeeks(monsoonStart, 17), -1); // 17 weeks, ending Sunday

      periods.push({
        year: y + 1,
        yearLabel,
        key: `y${y + 1}_monsoon`,
        type: 'monsoon',
        ...PERIOD_TYPES.monsoon,
        start: new Date(monsoonStart),
        end: new Date(monsoonEnd),
      });

      // Winter Break: Monday after monsoon → Sunday before spring
      const springYear = calYear + 1;
      const springStart = y === 0 && !startsInMonsoon
        ? mondayOfWeek(start)
        : getNthWeekday(springYear, 0, 1, 1); // 1st Monday of January
      const winterStart = addDays(monsoonEnd, 1);
      const winterEnd = addDays(springStart, -1);

      periods.push({
        year: y + 1,
        yearLabel,
        key: `y${y + 1}_winterBreak`,
        type: 'winterBreak',
        ...PERIOD_TYPES.winterBreak,
        start: new Date(winterStart),
        end: new Date(winterEnd),
      });

      // Spring Semester: 1st Monday of January, 17 weeks
      // e.g. 5 Jan 2026 → 3 May 2026
      const springEnd = addDays(addWeeks(springStart, 17), -1); // 17 weeks, ending Sunday

      periods.push({
        year: y + 1,
        yearLabel,
        key: `y${y + 1}_spring`,
        type: 'spring',
        ...PERIOD_TYPES.spring,
        start: new Date(springStart),
        end: new Date(springEnd),
      });

      // Summer Break: Monday after spring → Sunday before next monsoon
      if (y < numYears - 1) {
        const summerStart = addDays(springEnd, 1);
        const nextMonsoonStart = getNthWeekday(startsInMonsoon ? calYear + 1 : calYear + 2, 6, 1, 4);
        const summerEnd = addDays(nextMonsoonStart, -1);

        periods.push({
          year: y + 1,
          yearLabel,
          key: `y${y + 1}_summerBreak`,
          type: 'summerBreak',
          ...PERIOD_TYPES.summerBreak,
          start: new Date(summerStart),
          end: new Date(summerEnd),
        });
      }
    }

    return periods;
  }

  function applyOverrides(periods) {
    return periods.map((p) => {
      const oStart = overrides[`${p.key}_start`];
      const oEnd = overrides[`${p.key}_end`];
      return {
        ...p,
        start: oStart ? parseDate(oStart) : p.start,
        end: oEnd ? parseDate(oEnd) : p.end,
      };
    });
  }

  // ---- Week Generation ----
  function generateWeeks(periods) {
    const weeks = [];
    let globalIndex = 0;

    periods.forEach((period) => {
      let weekStart = mondayOfWeek(period.start);
      let periodWeek = 1;

      while (weekStart <= period.end) {
        const weekEnd = addDays(weekStart, 6);
        weeks.push({
          globalIndex,
          periodWeek,
          periodKey: period.key,
          periodLabel: period.label,
          periodType: period.type,
          isBreak: period.isBreak,
          year: period.year,
          yearLabel: period.yearLabel,
          start: new Date(weekStart),
          end: new Date(weekEnd),
        });
        globalIndex++;
        periodWeek++;
        weekStart = addWeeks(weekStart, 1);
      }
    });

    return weeks;
  }

  // ---- Current Week Detection ----
  function findCurrentWeekIndex() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < allWeeks.length; i++) {
      if (now >= allWeeks[i].start && now <= allWeeks[i].end) {
        return i;
      }
    }
    // If before first week
    if (allWeeks.length > 0 && now < allWeeks[0].start) return -1;
    // If after last week
    if (allWeeks.length > 0 && now > allWeeks[allWeeks.length - 1].end) return allWeeks.length;
    return -1;
  }

  // ---- Statistics ----
  function updateStats() {
    const currentIdx = findCurrentWeekIndex();
    const elapsed = Math.max(0, currentIdx);
    let scored = 0;
    let totalScore = 0;

    for (let i = 0; i < elapsed; i++) {
      const s = scores[allWeeks[i].globalIndex];
      if (s) {
        scored++;
        totalScore += s;
      }
    }

    const remaining = Math.max(0, allWeeks.length - Math.max(0, currentIdx + 1));
    const avg = scored > 0 ? (totalScore / scored).toFixed(2) : '—';

    $('statElapsed').textContent = elapsed;
    $('statScored').textContent = scored;
    $('statAvg').textContent = avg;
    $('statRemaining').textContent = remaining;
  }

  // ---- Current Week Bar ----
  function updateCurrentWeekBar() {
    const currentIdx = findCurrentWeekIndex();
    if (currentIdx < 0 || currentIdx >= allWeeks.length) {
      currentWeekBar.style.display = 'none';
      return;
    }

    const week = allWeeks[currentIdx];
    currentWeekBar.style.display = 'flex';
    $('cwPeriod').textContent = `${week.yearLabel} — ${week.periodLabel}`;
    $('cwWeek').textContent = `Week ${week.periodWeek} (overall ${week.globalIndex + 1}/${allWeeks.length})`;
    $('cwDates').textContent = `${formatDateShort(week.start)} – ${formatDateShort(week.end)}`;
  }

  // ---- Render Calendar ----
  function renderCalendar() {
    calendarGrid.innerHTML = '';
    const currentIdx = findCurrentWeekIndex();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Group weeks by year, then by period
    const yearGroups = {};
    allWeeks.forEach((w) => {
      if (!yearGroups[w.year]) yearGroups[w.year] = {};
      if (!yearGroups[w.year][w.periodKey]) {
        yearGroups[w.year][w.periodKey] = {
          label: w.periodLabel,
          type: w.periodType,
          isBreak: w.isBreak,
          year: w.year,
          yearLabel: w.yearLabel,
          weeks: [],
        };
      }
      yearGroups[w.year][w.periodKey].weeks.push(w);
    });

    Object.keys(yearGroups)
      .sort((a, b) => +a - +b)
      .forEach((yearNum) => {
        const yearDiv = document.createElement('div');
        yearDiv.className = 'year-group';

        const yearTitle = document.createElement('h2');
        yearTitle.className = 'year-title';
        yearTitle.textContent = `Year ${yearNum}`;
        yearDiv.appendChild(yearTitle);

        const periods = yearGroups[yearNum];
        Object.keys(periods).forEach((periodKey) => {
          const period = periods[periodKey];
          const periodDiv = document.createElement('div');
          periodDiv.className = 'period-group';

          const header = document.createElement('div');
          header.className = 'period-header';

          const name = document.createElement('span');
          name.className = 'period-name';
          name.textContent = period.label;

          const dates = document.createElement('span');
          dates.className = 'period-dates';
          const firstWeek = period.weeks[0];
          const lastWeek = period.weeks[period.weeks.length - 1];
          dates.textContent = `${formatDateShort(firstWeek.start)} – ${formatDateShort(lastWeek.end)}`;

          header.appendChild(name);
          header.appendChild(dates);
          periodDiv.appendChild(header);

          const row = document.createElement('div');
          row.className = 'weeks-row';

          period.weeks.forEach((week) => {
            const sq = document.createElement('div');
            sq.className = 'week-square';

            const isCurrent = week.globalIndex === currentIdx;
            const isPast = week.end < now && !isCurrent;
            const isFuture = week.start > now && !isCurrent;
            const score = scores[week.globalIndex];

            if (isCurrent) {
              sq.classList.add('current');
            } else if (isPast) {
              sq.classList.add('past');
              if (score) {
                sq.classList.add(`score-${score}`);
              } else {
                sq.classList.add(week.isBreak ? 'break' : 'teaching');
              }
            } else if (isFuture) {
              sq.classList.add('future');
              sq.classList.add(week.isBreak ? 'break' : 'teaching');
            } else {
              sq.classList.add(week.isBreak ? 'break' : 'teaching');
            }

            // Click handler for past weeks
            if (isPast) {
              sq.addEventListener('click', () => openScoreModal(week));
            }

            // Tooltip
            sq.addEventListener('mouseenter', (e) => showTooltip(e, week, isCurrent, isPast, score));
            sq.addEventListener('mouseleave', hideTooltip);
            sq.addEventListener('mousemove', moveTooltip);

            row.appendChild(sq);
          });

          periodDiv.appendChild(row);
          yearDiv.appendChild(periodDiv);
        });

        calendarGrid.appendChild(yearDiv);
      });
  }

  // ---- Tooltip ----
  function showTooltip(e, week, isCurrent, isPast, score) {
    let text = `${week.yearLabel} — ${week.periodLabel}\n`;
    text += `Week ${week.periodWeek} · ${formatDateShort(week.start)} – ${formatDateShort(week.end)}`;

    if (isCurrent) {
      text += '\n★ You are here';
    } else if (isPast && score) {
      text += `\nScore: ${score}/5 (${SCORE_LABELS[score]})`;
    } else if (isPast) {
      text += '\nClick to score';
    }

    tooltip.textContent = text;
    tooltip.style.whiteSpace = 'pre';
    tooltip.classList.add('visible');
    moveTooltip(e);
  }

  function moveTooltip(e) {
    const x = e.clientX + 12;
    const y = e.clientY - 10;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // ---- Modal ----
  function openScoreModal(week) {
    currentModalWeek = week;
    modalTitle.textContent = `${week.yearLabel} — ${week.periodLabel}`;
    modalSubtitle.textContent = `Week ${week.periodWeek} · ${formatDateShort(week.start)} – ${formatDateShort(week.end)}`;

    const existing = scores[week.globalIndex];
    clearScoreBtn.style.display = existing ? 'inline-block' : 'none';

    // Highlight existing score
    document.querySelectorAll('.score-btn').forEach((btn) => {
      btn.classList.toggle('active', +btn.dataset.score === existing);
    });

    modalOverlay.classList.add('active');
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    currentModalWeek = null;
  }

  function setScore(score) {
    if (!currentModalWeek) return;
    scores[currentModalWeek.globalIndex] = score;
    saveScores();
    closeModal();
    renderCalendar();
    updateStats();
  }

  function clearScore() {
    if (!currentModalWeek) return;
    delete scores[currentModalWeek.globalIndex];
    saveScores();
    closeModal();
    renderCalendar();
    updateStats();
  }

  // ---- LocalStorage ----
  function saveScores() {
    localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(scores));
  }

  function loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.scores);
      if (raw) {
        const parsed = JSON.parse(raw);
        scores = {};
        Object.keys(parsed).forEach((k) => {
          scores[+k] = parsed[k];
        });
      }
    } catch (e) {
      scores = {};
    }
  }

  function saveOverridesData() {
    localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(overrides));
  }

  function loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.overrides);
      if (raw) overrides = JSON.parse(raw);
    } catch (e) {
      overrides = {};
    }
  }

  function saveConfig(startDate, programType) {
    localStorage.setItem(STORAGE_KEYS.startDate, startDate);
    localStorage.setItem(STORAGE_KEYS.programType, programType);
  }

  function loadConfig() {
    return {
      startDate: localStorage.getItem(STORAGE_KEYS.startDate),
      programType: localStorage.getItem(STORAGE_KEYS.programType),
    };
  }

  // ---- Advanced Settings ----
  function renderAdvancedPanel(periods) {
    advancedContent.innerHTML = '';
    const grouped = {};
    periods.forEach((p) => {
      if (!grouped[p.year]) grouped[p.year] = [];
      grouped[p.year].push(p);
    });

    Object.keys(grouped)
      .sort((a, b) => +a - +b)
      .forEach((yearNum) => {
        const yearDiv = document.createElement('div');
        yearDiv.className = 'advanced-year';

        const title = document.createElement('h4');
        title.textContent = `Year ${yearNum}`;
        yearDiv.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'advanced-semesters';

        grouped[yearNum].forEach((p) => {
          // Start date
          const startLabel = document.createElement('label');
          startLabel.textContent = `${p.label} Start`;
          const startInput = document.createElement('input');
          startInput.type = 'date';
          startInput.value = overrides[`${p.key}_start`] || toISODate(p.start);
          startInput.dataset.key = `${p.key}_start`;
          startLabel.appendChild(startInput);
          grid.appendChild(startLabel);

          // End date
          const endLabel = document.createElement('label');
          endLabel.textContent = `${p.label} End`;
          const endInput = document.createElement('input');
          endInput.type = 'date';
          endInput.value = overrides[`${p.key}_end`] || toISODate(p.end);
          endInput.dataset.key = `${p.key}_end`;
          endLabel.appendChild(endInput);
          grid.appendChild(endLabel);
        });

        yearDiv.appendChild(grid);
        advancedContent.appendChild(yearDiv);
      });
  }

  function collectOverrides() {
    const inputs = advancedContent.querySelectorAll('input[data-key]');
    const newOverrides = {};
    inputs.forEach((inp) => {
      if (inp.value) {
        newOverrides[inp.dataset.key] = inp.value;
      }
    });
    return newOverrides;
  }

  // ---- Build Everything ----
  function buildCalendar(startDate, programType) {
    const numYears = PROGRAM_YEARS[programType] || 2;
    let periods = calcDefaultPeriods(startDate, numYears);
    periods = applyOverrides(periods);
    allWeeks = generateWeeks(periods);

    // Show UI sections
    advancedToggle.style.display = 'block';
    statsBar.style.display = 'flex';
    todayDisplay.style.display = 'block';
    footer.style.display = 'block';

    // Today
    $('todayDate').textContent = formatDate(new Date());

    // Render
    renderCalendar();
    updateStats();
    updateCurrentWeekBar();
    renderAdvancedPanel(periods);
  }

  // ---- Event Handlers ----
  buildBtn.addEventListener('click', () => {
    const startDate = startDateInput.value;
    if (!startDate) {
      startDateInput.focus();
      return;
    }
    const programType = programTypeSelect.value;
    saveConfig(startDate, programType);
    buildCalendar(startDate, programType);
  });

  advancedBtn.addEventListener('click', () => {
    const isOpen = advancedPanel.style.display !== 'none';
    advancedPanel.style.display = isOpen ? 'none' : 'block';
  });

  saveOverridesBtn.addEventListener('click', () => {
    overrides = collectOverrides();
    saveOverridesData();
    const config = loadConfig();
    if (config.startDate) {
      buildCalendar(config.startDate, config.programType || 'mtech');
    }
    advancedPanel.style.display = 'none';
  });

  clearOverridesBtn.addEventListener('click', () => {
    overrides = {};
    saveOverridesData();
    const config = loadConfig();
    if (config.startDate) {
      buildCalendar(config.startDate, config.programType || 'mtech');
    }
    advancedPanel.style.display = 'none';
  });

  // Score buttons
  document.querySelectorAll('.score-btn').forEach((btn) => {
    btn.addEventListener('click', () => setScore(+btn.dataset.score));
  });

  clearScoreBtn.addEventListener('click', clearScore);
  cancelModalBtn.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (modalOverlay.classList.contains('active') && e.key >= '1' && e.key <= '5') {
      setScore(+e.key);
    }
  });

  // ---- Init ----
  function init() {
    loadScores();
    loadOverrides();
    const config = loadConfig();

    if (config.startDate) {
      startDateInput.value = config.startDate;
      programTypeSelect.value = config.programType || 'mtech';
      buildCalendar(config.startDate, config.programType || 'mtech');
    }
  }

  init();
})();
