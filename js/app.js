(function () {
  'use strict';

  const QUESTIONS = window.QUESTIONS;
  const EXPLANATIONS = window.EXPLANATIONS;
  const EXPLANATIONS_DE = window.EXPLANATIONS_DE;
  const STATES = window.STATES;
  const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
  const LETTERS = 'ABCD';
  const EMPTY_MESSAGES = {
    study: 'You are all caught up: nothing is due and every question has been seen. Pick a set under Browse to keep practising.',
    new: 'You have seen every question.',
    mistakes: 'No missed questions. Excellent!',
    mastered: 'No mastered questions yet. Answer correctly across several days to build this list.',
  };

  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  function safeStorage() {
    try {
      const s = window.localStorage;
      s.getItem('einbuergerungstest.probe');
      return s;
    } catch (_) {
      return { getItem: () => null, setItem: () => { throw new Error('storage unavailable'); } };
    }
  }

  const store = Store.createStore(safeStorage(), BY_ID, Date.now);

  const state = {
    progress: store.load(),
    mode: 'all',
    pool: [],
    index: 0,
    picked: {},
    retryAt: new Set(),
    exam: null,
    review: null,
  };

  // Only the learner's own state is studied, but cards, stored exams and imports for any state still resolve through BY_ID.
  let catalogueFor;
  let catalogueList = [];
  function catalogue() {
    const code = state.progress.settings.state;
    if (catalogueFor !== code) {
      catalogueList = Catalogue.forState(QUESTIONS, code);
      catalogueFor = code;
    }
    return catalogueList;
  }

  const isGeneral = (q) => q.scope === Catalogue.GENERAL;
  const stateQuestions = () => catalogue().filter((q) => !isGeneral(q));
  const stateInfo = () => Catalogue.stateByCode(STATES, state.progress.settings.state);
  const stateName = () => (stateInfo() ? stateInfo().name : 'your state');
  const scopeName = (scope) => { const s = Catalogue.stateByCode(STATES, scope); return s ? s.name : scope; };

  const TABS = [
    { id: 'study', label: '📖 Study', count: () => dueQuestions().length },
    { id: 'exam', label: '🎯 Mock exam' },
  ];
  const BROWSE = [
    { id: 'all', label: () => 'All ' + catalogue().length },
    { id: 'general', label: () => 'General ' + catalogue().filter(isGeneral).length },
    { id: 'state', label: () => stateName() + ' ' + stateQuestions().length },
    { id: 'new', label: () => 'New', count: () => catalogue().filter((q) => !state.progress.cards[q.id]).length },
    { id: 'mistakes', label: () => 'Mistakes', count: () => catalogue().filter((q) => SRS.isMistake(state.progress.cards[q.id])).length },
    { id: 'mastered', label: () => 'Mastered', count: () => catalogue().filter((q) => SRS.isMastered(state.progress.cards[q.id])).length },
  ];

  const cards = () => state.progress.cards;
  const isUnseen = (id) => !cards()[id] || cards()[id].seen === 0;
  const dueQuestions = () => SRS.dueQueue(catalogue(), cards(), Date.now());
  const current = () => state.pool[state.index];
  const inExam = () => state.mode === 'exam' && !!state.exam;
  const persist = () => { if (!store.save(state.progress)) toast('Could not save progress: browser storage is unavailable.'); };

  let toastTimer = 0;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
  }

  function buildPool(mode) {
    const c = cards();
    switch (mode) {
      case 'study': return SRS.studyQueue(catalogue(), c, Date.now(), SRS.newLeftToday(state.progress.daily, Date.now()));
      case 'general': return catalogue().filter(isGeneral);
      case 'state': return stateQuestions();
      case 'new': return catalogue().filter((q) => !c[q.id]);
      case 'mistakes': return catalogue().filter((q) => SRS.isMistake(c[q.id]));
      case 'mastered': return catalogue().filter((q) => SRS.isMastered(c[q.id]));
      default: return catalogue().slice();
    }
  }

  function setMode(mode) {
    state.mode = mode;
    state.index = 0;
    state.picked = {};
    state.retryAt = new Set();
    if (mode === 'exam') {
      if (!state.exam && !state.review) startExam();
      state.pool = (state.exam || state.review.exam).ids.map((id) => BY_ID[id]);
    } else {
      state.review = null;
      state.pool = buildPool(mode);
    }
    render();
  }

  // ---- study answers -------------------------------------------------------

  function answerStudy(choice) {
    const q = current();
    if (state.picked[state.index] != null) return;
    state.picked[state.index] = choice;
    const ok = choice === q.correct;
    if (state.retryAt.has(state.index)) {
      if (ok) {
        cards()[q.id] = SRS.postpone(cards()[q.id], Date.now());
        persist();
      }
    } else {
      if (state.mode === 'study' && isUnseen(q.id)) state.progress.daily = SRS.countNewStarted(state.progress.daily, Date.now());
      cards()[q.id] = SRS.grade(cards()[q.id], ok, Date.now());
      persist();
      if (!ok && state.mode === 'study') {
        state.pool.push(q);
        state.retryAt.add(state.pool.length - 1);
      }
    }
    render();
  }

  function studyMore() {
    state.progress.daily = SRS.addNewBatch(state.progress.daily, Date.now());
    persist();
    setMode('study');
  }

  // ---- mock exam -----------------------------------------------------------

  function startExam() {
    state.review = null;
    state.exam = Exam.start(catalogue(), Date.now());
    state.progress.activeExam = state.exam;
    persist();
  }

  function toggleExamChoice(choice) {
    const q = current();
    const ch = state.exam.choices;
    if (ch[q.id] === choice) delete ch[q.id];
    else ch[q.id] = choice;
    persist();
    render();
  }

  function finishExam(timedOut) {
    const exam = state.exam;
    if (!exam) return;
    const result = Exam.score(exam, BY_ID);
    const now = Date.now();
    for (const id of exam.ids) {
      if (exam.choices[id] != null) cards()[id] = SRS.grade(cards()[id], exam.choices[id] === BY_ID[id].correct, now);
    }
    state.progress.exams.push({
      at: now,
      correct: result.correct,
      total: result.total,
      passed: result.passed,
      seconds: Math.min(Math.round((now - exam.startedAt) / 1000), Exam.DURATION_MS / 1000),
    });
    state.progress.exams = state.progress.exams.slice(-Store.MAX_EXAM_HISTORY);
    state.progress.activeExam = null;
    state.exam = null;
    state.review = { exam, result, timedOut: !!timedOut };
    persist();
    if (state.mode === 'exam') {
      state.index = 0;
      state.pool = exam.ids.map((id) => BY_ID[id]);
      render();
    } else {
      setMode('exam');
    }
    if (timedOut) toast('Time is up. Your exam was submitted.');
  }

  function onFinishClick() {
    const unanswered = state.exam.ids.filter((id) => state.exam.choices[id] == null).length;
    if (unanswered && !confirm(unanswered + ' question(s) are unanswered and will count as wrong. Finish the exam?')) return;
    finishExam(false);
  }

  function tick() {
    if (!state.exam) return;
    const left = Exam.remainingMs(state.exam, Date.now());
    if (left <= 0) { finishExam(true); return; }
    if (state.mode === 'exam') renderTimer(left);
  }

  // ---- rendering -----------------------------------------------------------

  function renderTabs() {
    const nav = $('tabs');
    if (!nav.children.length) {
      for (const t of TABS) {
        nav.append(h('button', { type: 'button', 'data-mode': t.id, onclick: () => setMode(t.id) }, h('span', { text: t.label }), t.count ? h('span', { class: 'count' }) : null));
      }
      nav.append(h('select', { id: 'browse', 'aria-label': 'Browse question sets', onchange: (e) => e.target.value && setMode(e.target.value) },
        h('option', { value: '', text: '📚 Browse…' }),
        BROWSE.map((b) => h('option', { value: b.id }))));
    }
    for (const b of nav.querySelectorAll('button')) {
      const t = TABS.find((x) => x.id === b.dataset.mode);
      const active = t.id === state.mode;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
      const count = b.querySelector('.count');
      if (count) {
        const n = t.count();
        count.textContent = n;
        count.hidden = n === 0;
      }
    }
    const select = $('browse');
    BROWSE.forEach((b, i) => {
      select.options[i + 1].textContent = b.label() + (b.count ? ' (' + b.count() + ')' : '');
    });
    const browsing = BROWSE.some((b) => b.id === state.mode);
    select.value = browsing ? state.mode : '';
    select.classList.toggle('active', browsing);
  }

  function renderTimer(left) {
    const el = $('timer');
    el.textContent = Exam.formatClock(left);
    el.classList.toggle('warn', left < 5 * 60 * 1000);
    el.classList.toggle('danger', left < 60 * 1000);
  }

  function renderExamBar() {
    const bar = $('examBar');
    const live = state.mode === 'exam' && !!state.exam;
    const reviewing = state.mode === 'exam' && !!state.review;
    bar.hidden = !(live || reviewing);
    $('finishExam').hidden = !live;
    $('timer').hidden = !live;
    $('examAnswered').textContent = '';
    if (bar.hidden) return;
    const exam = state.exam || state.review.exam;
    if (live) {
      renderTimer(Exam.remainingMs(exam, Date.now()));
      const done = exam.ids.filter((id) => exam.choices[id] != null).length;
      $('examAnswered').textContent = done + ' / ' + exam.ids.length + ' answered';
    }
    const nav = $('navigator');
    nav.replaceChildren(...exam.ids.map((id, i) => {
      const cls = ['nav-dot'];
      const picked = exam.choices[id];
      if (picked != null) cls.push('answered');
      if (reviewing) cls.push(picked === BY_ID[id].correct ? 'right' : 'miss');
      if (i === state.index) cls.push('current');
      return h('button', {
        type: 'button',
        class: cls.join(' '),
        'aria-label': 'Question ' + (i + 1) + (picked != null ? ', answered' : ', unanswered'),
        'aria-current': i === state.index ? 'true' : null,
        onclick: () => { state.index = i; render(); },
        text: i + 1,
      });
    }));
  }

  function renderResult() {
    const el = $('result');
    if (state.mode !== 'exam' || !state.review) { el.hidden = true; return; }
    const { result, timedOut } = state.review;
    el.hidden = false;
    el.className = 'result ' + (result.passed ? 'pass' : 'fail');
    el.replaceChildren(
      h('strong', { text: 'Mock exam result: ' + result.correct + '/' + result.total + ' — ' + (result.passed ? 'PASS' : 'NOT PASSED') }),
      h('div', { class: 'small', text: 'The real test needs at least ' + Exam.PASS_MARK + ' of ' + Exam.TOTAL + ' correct.' + (timedOut ? ' Time ran out before you finished.' : '') + ' Green and red numbers above show your right and wrong answers; step through them to see the explanations.' }),
      h('button', { type: 'button', class: 'primary', onclick: () => { state.review = null; setMode('exam'); }, text: 'Start a new mock exam' }),
    );
  }

  function renderOptions(q) {
    const exam = inExam() ? state.exam : null;
    const reviewing = state.mode === 'exam' && !!state.review;
    const picked = exam ? exam.choices[q.id] : reviewing ? state.review.exam.choices[q.id] : state.picked[state.index];
    const revealed = reviewing || (!exam && picked != null);
    const box = $('options');
    box.replaceChildren(...q.options.map((text, i) => {
      const cls = ['option'];
      if (revealed && i === q.correct) cls.push('correct');
      if (revealed && i === picked && i !== q.correct) cls.push('wrong');
      if (exam && i === picked) cls.push('selected');
      const label = h('span', { lang: 'de', text });
      if (state.progress.settings.showEnglish) label.append(h('span', { class: 'enopt', lang: 'en', text: q.en_options[i] }));
      return h('button', {
        type: 'button',
        class: cls.join(' '),
        disabled: revealed,
        'aria-pressed': exam ? String(i === picked) : null,
        onclick: () => (exam ? toggleExamChoice(i) : answerStudy(i)),
      }, h('span', { class: 'letter', text: LETTERS[i] }), label);
    }));
    return { picked, revealed };
  }

  function renderFeedback(q, picked, revealed) {
    const fb = $('feedback');
    fb.className = 'feedback';
    fb.replaceChildren();
    if (!revealed) return;
    const reviewing = state.mode === 'exam';
    const ok = picked === q.correct;
    fb.classList.add('show', ok ? 'good' : 'bad');
    const head = picked == null ? 'Not answered.' : ok ? '✓ Correct.' : '✗ Not quite.';
    const tail = !reviewing && !state.retryAt.has(state.index) ? ' · ' + SRS.describeInterval(cards()[q.id], Date.now()) : '';
    fb.append(h('div', { class: 'verdict' }, h('strong', { text: head }), h('span', { class: 'small', text: tail })));
    if (!ok) {
      fb.append(h('div', {}, 'Correct answer: ', h('strong', { lang: 'de', text: LETTERS[q.correct] + ') ' + q.options[q.correct] })));
      if (state.progress.settings.showEnglish) fb.append(h('div', { class: 'small', lang: 'en', text: q.en_options[q.correct] }));
    }
    fb.append(h('p', { class: 'why', lang: 'de' }, h('strong', { text: 'Warum: ' }), EXPLANATIONS_DE[q.id]));
    const explainEn = state.progress.settings.explainEnglish;
    if (explainEn) fb.append(h('p', { class: 'why en', lang: 'en' }, h('strong', { text: 'Why: ' }), EXPLANATIONS[q.id]));
    fb.append(h('button', {
      type: 'button',
      class: 'link explain-toggle',
      onclick: () => { state.progress.settings.explainEnglish = !explainEn; persist(); render(); },
      text: explainEn ? 'Hide English explanation' : 'Show English explanation',
    }));
  }

  function renderStats() {
    const c = cards();
    const mine = catalogue();
    const all = mine.map((q) => c[q.id]).filter(Boolean);
    const seen = all.filter((x) => x.seen > 0).length;
    const right = all.reduce((n, x) => n + x.right, 0);
    const wrong = all.reduce((n, x) => n + x.wrong, 0);
    $('seen').textContent = seen + ' / ' + mine.length;
    $('dueCount').textContent = dueQuestions().length;
    $('masteredCount').textContent = mine.filter((q) => SRS.isMastered(c[q.id])).length;
    $('mistakeCount').textContent = mine.filter((q) => SRS.isMistake(c[q.id])).length;
    $('accuracy').textContent = right + wrong ? Math.round((right / (right + wrong)) * 100) + '%' : '—';

    const dist = SRS.distribution(mine, c);
    const segments = [{ cls: 'seg-new', label: 'New', n: dist.unseen }];
    dist.boxes.forEach((n, box) => {
      segments.push({ cls: 'seg-b' + box, label: box === 0 ? 'Relearn' : 'Box ' + box + ' (' + SRS.BOX_DAYS[box] + 'd)', n });
    });
    $('stack').replaceChildren(...segments.filter((s) => s.n).map((s) => h('div', { class: s.cls, style: 'flex:' + s.n, title: s.label + ': ' + s.n })));
    $('legend').replaceChildren(...segments.map((s) => h('li', {}, h('i', { class: 'swatch ' + s.cls }), h('span', { text: s.label }), h('b', { text: s.n }))));

    const modeNotes = {
      study: 'Questions due for review come first, weakest first, followed by up to ' + SRS.NEW_PER_DAY + ' new ones a day (your state first). Missed questions return once at the end. New questions left today: ' + SRS.newLeftToday(state.progress.daily, Date.now()) + '.',
      all: 'All ' + mine.length + ' questions in catalogue order.',
      general: 'The ' + mine.filter(isGeneral).length + ' questions shared by every federal state.',
      state: 'The ' + stateQuestions().length + ' questions for ' + stateName() + '.',
      new: 'Questions you have not answered yet.',
      mistakes: 'Questions you got wrong the last time.',
      mastered: 'Answered correctly and scheduled at least 16 days ahead.',
      exam: Exam.GENERAL_COUNT + ' general + ' + Exam.STATE_COUNT + ' ' + stateName() + ' questions in 60 minutes. Answers can be changed until you finish.',
    };
    $('mode').textContent = modeNotes[state.mode];

    const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const items = state.progress.exams.slice(-5).reverse().map((e) => h('li', {},
      h('b', { class: e.passed ? 'ok' : 'bad', text: e.correct + '/' + e.total + (e.passed ? ' pass' : ' fail') }),
      h('span', { class: 'small', text: fmt.format(e.at) + ' · ' + Math.max(1, Math.round(e.seconds / 60)) + ' min' }),
    ));
    $('history').replaceChildren(...(items.length ? items : [h('li', { class: 'small muted', text: 'No mock exams yet.' })]));
  }

  function renderHeader() {
    const info = stateInfo();
    const chip = $('openStatePicker');
    chip.textContent = '📍 ' + (info ? info.name : 'Choose your state');
    chip.setAttribute('aria-label', info ? 'Federal state: ' + Catalogue.label(info) + '. Change' : 'Choose your federal state');
    if ($('statePicker').open) renderStatePicker();
    $('subline').textContent = (info ? catalogue().length + ' questions for ' + info.name : 'Questions for every federal state') + ' · German with optional English translation · works offline';
  }

  function render() {
    renderHeader();
    renderTabs();
    renderStats();
    renderExamBar();
    renderResult();

    const q = current();
    const t = $('translate');
    const showEn = state.progress.settings.showEnglish;
    t.replaceChildren('🌐 ', h('span', { class: 'lang-long', text: 'English' }), h('span', { class: 'lang-short', text: 'EN' }), showEn ? ': On' : ': Off');
    t.setAttribute('aria-pressed', String(showEn));
    t.classList.toggle('active', showEn);
    $('shuffle').disabled = state.mode === 'exam' || state.mode === 'study';
    $('pager').hidden = !q;

    if (!q) {
      $('scope').textContent = '';
      $('counter').textContent = '0 / 0';
      // Study runs dry before the catalogue does when today's new questions are used up.
      const doneForToday = state.mode === 'study' && catalogue().some((x) => isUnseen(x.id));
      $('question').textContent = doneForToday
        ? 'Done for today: nothing is due and you have started ' + SRS.today(state.progress.daily, Date.now()).started + ' new questions today. Come back tomorrow, or study ' + SRS.NEW_PER_DAY + ' more now.'
        : EMPTY_MESSAGES[state.mode] || 'No questions in this set.';
      $('translation').classList.remove('show');
      $('qimg').hidden = true;
      $('imgCredit').hidden = true;
      $('options').replaceChildren(...(doneForToday ? [h('button', { type: 'button', class: 'primary more', onclick: studyMore, text: 'Study ' + SRS.NEW_PER_DAY + ' more' })] : []));
      $('feedback').className = 'feedback';
      $('feedback').replaceChildren();
      return;
    }

    $('scope').textContent = isGeneral(q) ? '🇩🇪 General' : '📍 ' + scopeName(q.scope);
    $('counter').textContent = (state.index + 1) + ' / ' + state.pool.length + (state.mode === 'study' && state.retryAt.has(state.index) ? ' · retry' : '');
    $('question').textContent = q.q;

    const tr = $('translation');
    tr.replaceChildren(h('span', { class: 'langtag', text: 'English' }), q.en_q);
    tr.classList.toggle('show', showEn);

    const img = $('qimg');
    if (q.image) {
      img.src = q.image;
      img.alt = 'Figure for question ' + q.id;
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
    $('imgCredit').textContent = q.imageCredit || '';
    $('imgCredit').hidden = !(q.image && q.imageCredit);

    const { picked, revealed } = renderOptions(q);
    renderFeedback(q, picked, revealed);

    const last = state.index === state.pool.length - 1;
    $('prev').disabled = state.index === 0;
    $('next').disabled = state.mode === 'exam' && !!state.review && last;
    $('next').textContent = last ? (inExam() ? 'Finish exam' : state.mode === 'exam' ? 'End of review' : 'Done') : 'Next →';
  }

  // ---- navigation and toolbar ---------------------------------------------

  function next() {
    if (state.index < state.pool.length - 1) { state.index += 1; render(); return; }
    if (inExam()) { onFinishClick(); return; }
    if (state.mode !== 'exam') {
      const finished = state.pool.length;
      setMode(state.mode);
      toast('Set complete: ' + finished + ' question' + (finished === 1 ? '' : 's') + '.');
    }
  }

  function exportProgress() {
    const blob = new Blob([Store.serialize(state.progress, Date.now())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'einbuergerungstest-progress-' + new Date().toISOString().slice(0, 10) + '.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let imported;
      try {
        imported = Store.normalize(JSON.parse(reader.result), BY_ID, Date.now());
      } catch (_) {
        toast('That file is not a valid progress export.');
        return;
      }
      if (Object.keys(cards()).length && !confirm('Replace your current progress with the imported file?')) return;
      state.progress = imported;
      state.exam = imported.activeExam;
      state.review = null;
      persist();
      setMode(state.exam ? 'exam' : defaultMode());
      updateIntro();
      toast('Progress imported: ' + Object.keys(imported.cards).length + ' questions.');
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    if (!confirm('Reset all saved progress? This cannot be undone.')) return;
    const { showEnglish, explainEnglish, state: stateCode } = state.progress.settings;
    state.progress = Store.empty();
    state.progress.settings.showEnglish = showEnglish;
    state.progress.settings.explainEnglish = explainEnglish;
    state.progress.settings.state = stateCode;
    state.exam = null;
    state.review = null;
    persist();
    setMode(defaultMode());
  }

  function defaultMode() {
    return 'study';
  }

  function bind() {
    $('prev').addEventListener('click', () => { state.index -= 1; render(); });
    $('next').addEventListener('click', next);
    $('finishExam').addEventListener('click', onFinishClick);
    $('translate').addEventListener('click', () => {
      state.progress.settings.showEnglish = !state.progress.settings.showEnglish;
      persist();
      render();
    });
    $('shuffle').addEventListener('click', () => {
      state.pool = Exam.shuffle(state.pool, Math.random);
      state.index = 0;
      state.picked = {};
      state.retryAt = new Set();
      render();
    });
    $('export').addEventListener('click', exportProgress);
    $('import').addEventListener('click', () => $('file').click());
    $('file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) importProgress(f);
    });
    $('reset').addEventListener('click', resetProgress);
    const go = () => {
      const n = parseInt($('jump').value, 10);
      if (n >= 1 && n <= state.pool.length) { state.index = n - 1; render(); }
    };
    $('go').addEventListener('click', go);
    $('jump').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  const INTRO_KEY = 'einbuergerungstest.intro.dismissed';

  function introDismissed() {
    try { return window.localStorage.getItem(INTRO_KEY) === '1'; } catch (_) { return false; }
  }

  // ---- theme: follow the system unless the learner picks light or dark ---------

  const THEME_KEY = 'einbuergerungstest.theme';
  const THEMES = [
    { id: 'system', label: '🖥️ Theme: System' },
    { id: 'light', label: '☀️ Theme: Light' },
    { id: 'dark', label: '🌙 Theme: Dark' },
  ];

  function savedTheme() {
    try {
      const t = window.localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch (_) { return 'system'; }
  }

  function applyTheme(id) {
    if (id === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
    const t = THEMES.find((x) => x.id === id);
    $('themeToggle').textContent = t.label;
    $('themeToggle').title = 'Switch between the system setting, light and dark. Saved on this device.';
  }

  function bindTheme() {
    let current = savedTheme();
    applyTheme(current);
    $('themeToggle').addEventListener('click', () => {
      current = THEMES[(THEMES.findIndex((x) => x.id === current) + 1) % THEMES.length].id;
      applyTheme(current);
      try {
        if (current === 'system') window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, current);
      } catch (_) { toast('Could not save the theme: browser storage is unavailable.'); }
    });
  }

  function bindGuide() {
    const dialog = $('guide');
    const open = () => {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector('.guide-body').scrollTop = 0;
    };
    const close = () => dialog.close();
    const dismissIntro = () => {
      $('intro').hidden = true;
      try { window.localStorage.setItem(INTRO_KEY, '1'); } catch (_) { /* the callout will simply show again */ }
    };
    for (const id of ['openGuide', 'footGuide']) $(id).addEventListener('click', open);
    $('introOpen').addEventListener('click', () => { dismissIntro(); open(); });
    $('introDismiss').addEventListener('click', dismissIntro);
    $('closeGuide').addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    updateIntro();
  }

  // The first-visit callout waits for the state picker so the two never compete.
  function updateIntro() {
    $('intro').hidden = introDismissed() || Object.keys(cards()).length > 0 || !state.progress.settings.state;
  }

  // ---- federal state picker ------------------------------------------------

  function chooseState(code) {
    if (state.exam || code === state.progress.settings.state) return;
    state.progress.settings.state = code;
    state.review = null;
    persist();
    setMode(defaultMode());
  }

  function renderStatePicker() {
    const locked = !!state.exam;
    const chosen = state.progress.settings.state;
    $('stateLocked').hidden = !locked;
    $('closeStatePicker').hidden = !chosen;
    $('stateGrid').replaceChildren(...STATES.map((s) => h('button', {
      type: 'button',
      class: 'state-option',
      disabled: locked,
      'aria-current': s.code === chosen ? 'true' : null,
      onclick: () => {
        chooseState(s.code);
        $('statePicker').close();
        updateIntro();
      },
    },
    h('span', { class: 'state-name', text: s.name + (s.code === chosen ? ' ✓' : '') }),
    s.en !== s.name ? h('span', { class: 'state-en', lang: 'en', text: s.en }) : null)));
  }

  function bindStatePicker() {
    const dialog = $('statePicker');
    const open = () => {
      if (dialog.open) return;
      renderStatePicker();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector('.guide-body').scrollTop = 0;
    };
    const mustChoose = () => !state.progress.settings.state;
    $('openStatePicker').addEventListener('click', open);
    $('closeStatePicker').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog && !mustChoose()) dialog.close(); });
    dialog.addEventListener('cancel', (e) => { if (mustChoose()) e.preventDefault(); });
    // Browsers may close a dialog on a repeated Escape even when cancel was prevented.
    dialog.addEventListener('close', () => { if (mustChoose()) open(); });
    if (mustChoose()) open();
  }

  function init() {
    bind();
    bindGuide();
    bindTheme();
    state.exam = state.progress.activeExam;
    if (state.exam && Exam.remainingMs(state.exam, Date.now()) <= 0) {
      finishExam(true);
    } else {
      setMode(state.exam ? 'exam' : defaultMode());
    }
    bindStatePicker();
    setInterval(tick, 500);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
