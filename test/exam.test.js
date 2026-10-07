const test = require('node:test');
const assert = require('node:assert/strict');
const Exam = require('../js/exam.js');
const { loadGlobal } = require('../scripts/validate-data.js');

const questions = loadGlobal('data/questions.js', 'QUESTIONS');
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('an exam has 30 distinct general and 3 distinct Bavaria questions', () => {
  const ids = Exam.build(questions, seeded(7));
  assert.equal(ids.length, Exam.TOTAL);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => byId[id].scope === 'General').length, 30);
  assert.equal(ids.filter((id) => byId[id].scope === 'Bayern').length, 3);
});

test('different seeds give different exams', () => {
  assert.notDeepEqual(Exam.build(questions, seeded(1)), Exam.build(questions, seeded(2)));
});

test('start sets a 60 minute deadline', () => {
  const exam = Exam.start(questions, 1000, seeded(3));
  assert.equal(exam.endsAt - exam.startedAt, 60 * 60 * 1000);
  assert.equal(Exam.remainingMs(exam, 1000), 3600000);
  assert.equal(Exam.remainingMs(exam, exam.endsAt + 5), 0);
});

test('17 correct answers pass and 16 fail; unanswered questions count as wrong', () => {
  const exam = Exam.start(questions, 0, seeded(4));
  exam.ids.slice(0, 17).forEach((id) => { exam.choices[id] = byId[id].correct; });
  exam.ids.slice(17, 25).forEach((id) => { exam.choices[id] = (byId[id].correct + 1) % 4; });
  assert.deepEqual(Exam.score(exam, byId), { correct: 17, total: 33, passed: true });
  delete exam.choices[exam.ids[0]];
  assert.deepEqual(Exam.score(exam, byId), { correct: 16, total: 33, passed: false });
});

test('clock formatting', () => {
  assert.equal(Exam.formatClock(3600000), '60:00');
  assert.equal(Exam.formatClock(61000), '01:01');
  assert.equal(Exam.formatClock(999), '00:01');
  assert.equal(Exam.formatClock(0), '00:00');
});
