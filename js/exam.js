(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Exam = factory();
})(this, function () {
  const GENERAL_COUNT = 30;
  const BAYERN_COUNT = 3;
  const TOTAL = GENERAL_COUNT + BAYERN_COUNT;
  const PASS_MARK = 17;
  const DURATION_MS = 60 * 60 * 1000;

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function build(questions, rng) {
    rng = rng || Math.random;
    const pick = (scope, n) => shuffle(questions.filter((q) => q.scope === scope), rng).slice(0, n);
    return shuffle(pick('General', GENERAL_COUNT).concat(pick('Bayern', BAYERN_COUNT)), rng).map((q) => q.id);
  }

  function start(questions, now, rng) {
    return { ids: build(questions, rng), choices: {}, startedAt: now, endsAt: now + DURATION_MS };
  }

  function score(exam, byId) {
    let correct = 0;
    for (const id of exam.ids) if (exam.choices[id] === byId[id].correct) correct += 1;
    return { correct, total: exam.ids.length, passed: correct >= PASS_MARK };
  }

  function remainingMs(exam, now) {
    return Math.max(0, exam.endsAt - now);
  }

  function formatClock(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  return { GENERAL_COUNT, BAYERN_COUNT, TOTAL, PASS_MARK, DURATION_MS, shuffle, build, start, score, remainingMs, formatClock };
});
