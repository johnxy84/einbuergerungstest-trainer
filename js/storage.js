(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./srs.js'));
  else root.Store = factory(root.SRS);
})(this, function (SRS) {
  const KEY = 'einbuergerungstest.progress.v2';
  const LEGACY_KEY = 'einb_offline_progress';
  const MAX_EXAM_HISTORY = 30;

  function empty() {
    return { version: 2, cards: {}, exams: [], activeExam: null, settings: { showEnglish: true } };
  }

  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

  function cleanCard(c) {
    const box = Math.min(Math.max(Math.trunc(num(c.box, 0)), 0), SRS.MAX_BOX);
    return {
      box,
      due: num(c.due, 0),
      seen: Math.max(0, Math.trunc(num(c.seen, 0))),
      right: Math.max(0, Math.trunc(num(c.right, 0))),
      wrong: Math.max(0, Math.trunc(num(c.wrong, 0))),
      last: num(c.last, 0),
      lastOk: typeof c.lastOk === 'boolean' ? c.lastOk : null,
    };
  }

  function cleanExam(e, byId) {
    if (!e || !Array.isArray(e.ids) || !e.ids.length || !e.ids.every((id) => byId[id])) return null;
    const choices = {};
    for (const id of e.ids) {
      const v = e.choices && e.choices[id];
      if (Number.isInteger(v) && v >= 0 && v < byId[id].options.length) choices[id] = v;
    }
    if (!Number.isFinite(e.startedAt) || !Number.isFinite(e.endsAt)) return null;
    return { ids: e.ids.slice(), choices, startedAt: e.startedAt, endsAt: e.endsAt };
  }

  // Converts the first version of the trainer's export ({answers, mistakes}) by regrading each stored choice against the current answer key.
  function fromV1(raw, byId, now) {
    const p = empty();
    const answers = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
    for (const [id, choice] of Object.entries(answers)) {
      const q = byId[id];
      if (!q || !Number.isInteger(choice)) continue;
      p.cards[id] = SRS.grade(SRS.newCard(), choice === q.correct, now);
    }
    if (typeof raw.showEnglish === 'boolean') p.settings.showEnglish = raw.showEnglish;
    return p;
  }

  function normalize(raw, byId, now) {
    if (!raw || typeof raw !== 'object') throw new Error('Not a progress file');
    if (raw.version === 2) {
      const p = empty();
      for (const [id, c] of Object.entries(raw.cards && typeof raw.cards === 'object' ? raw.cards : {})) {
        if (byId[id] && c && typeof c === 'object') p.cards[id] = cleanCard(c);
      }
      if (Array.isArray(raw.exams)) {
        p.exams = raw.exams
          .filter((x) => x && Number.isFinite(x.at) && Number.isFinite(x.correct) && Number.isFinite(x.total))
          .map((x) => ({ at: x.at, correct: x.correct, total: x.total, passed: !!x.passed, seconds: num(x.seconds, 0) }))
          .slice(-MAX_EXAM_HISTORY);
      }
      p.activeExam = cleanExam(raw.activeExam, byId);
      if (raw.settings && typeof raw.settings.showEnglish === 'boolean') p.settings.showEnglish = raw.settings.showEnglish;
      return p;
    }
    if (raw.answers || raw.mistakes) return fromV1(raw, byId, now);
    throw new Error('Not a progress file');
  }

  function createStore(storage, byId, now) {
    let memory = null;
    const read = (k) => { try { return storage.getItem(k); } catch (_) { return null; } };

    function load() {
      for (const k of [KEY, LEGACY_KEY]) {
        const text = read(k);
        if (!text) continue;
        try { return normalize(JSON.parse(text), byId, now()); } catch (_) { /* fall through to the next source */ }
      }
      return memory || empty();
    }

    function save(progress) {
      memory = progress;
      try { storage.setItem(KEY, JSON.stringify(progress)); return true; } catch (_) { return false; }
    }

    return { load, save };
  }

  function serialize(progress, now) {
    return JSON.stringify(Object.assign({ exportedAt: new Date(now).toISOString() }, progress), null, 2);
  }

  return { KEY, LEGACY_KEY, MAX_EXAM_HISTORY, empty, normalize, createStore, serialize };
});
