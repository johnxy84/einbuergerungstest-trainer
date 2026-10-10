const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, loadGlobal, findStateNames } = require('../scripts/validate-data.js');

test('question data, explanations and images are consistent', () => {
  assert.deepEqual(validate(), []);
});

test('every state owns ten consecutive ids and the catalogue has 460 questions', () => {
  const states = loadGlobal('data/states.js', 'STATES');
  const questions = loadGlobal('data/questions.js', 'QUESTIONS');
  assert.equal(states.length, 16);
  assert.equal(questions.length, 300 + 16 * 10);
  for (const s of states) {
    // Arrays from the vm sandbox have a foreign prototype, which strict deepEqual rejects, so copy into this realm first.
    const ids = Array.from(questions).filter((q) => q.scope === s.code).map((q) => q.id);
    assert.deepEqual(ids, Array.from({ length: 10 }, (_, i) => s.firstId + i), s.code);
  }
});

test('state names are matched longest first and never inside other names', () => {
  const names = ['Sachsen', 'Sachsen-Anhalt', 'Niedersachsen', 'Bayern'];
  assert.deepEqual(findStateNames('Welches Bundesland ist Sachsen-Anhalt?', names), ['Sachsen-Anhalt']);
  assert.deepEqual(findStateNames('Welches ist ein Landkreis in Niedersachsen?', names), ['Niedersachsen']);
  assert.deepEqual(findStateNames('Welches Bundesland ist Sachsen?', names), ['Sachsen']);
  assert.deepEqual(findStateNames('Welche Bundesländer gibt es?', names), []);
});
