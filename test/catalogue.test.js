const test = require('node:test');
const assert = require('node:assert/strict');
const Catalogue = require('../js/catalogue.js');
const { loadGlobal } = require('../scripts/validate-data.js');

const questions = [
  { id: 3, scope: 'General' },
  { id: 391, scope: 'NW' },
  { id: 1, scope: 'General' },
  { id: 301, scope: 'BY' },
  { id: 2, scope: 'General' },
];
const states = [
  { code: 'BY', name: 'Bayern', en: 'Bavaria', firstId: 301 },
  { code: 'BE', name: 'Berlin', en: 'Berlin', firstId: 321 },
  { code: 'NW', name: 'Nordrhein-Westfalen', en: 'North Rhine-Westphalia', firstId: 391 },
];

test('a state\'s catalogue is the general questions plus its own, in id order', () => {
  assert.deepEqual(Catalogue.forState(questions, 'NW').map((q) => q.id), [1, 2, 3, 391]);
  assert.deepEqual(Catalogue.forState(questions, 'BY').map((q) => q.id), [1, 2, 3, 301]);
  assert.deepEqual(Catalogue.forState(questions, 'BE').map((q) => q.id), [1, 2, 3]);
  assert.deepEqual(Catalogue.forState(questions, null).map((q) => q.id), [1, 2, 3]);
  assert.deepEqual(questions.map((q) => q.id), [3, 391, 1, 301, 2], 'the input is not reordered');
});

test('states are looked up by code', () => {
  assert.equal(Catalogue.stateByCode(states, 'NW').name, 'Nordrhein-Westfalen');
  assert.equal(Catalogue.stateByCode(states, 'XX'), null);
  assert.equal(Catalogue.isStateCode(states, 'BE'), true);
  assert.equal(Catalogue.isStateCode(states, 'General'), false);
  assert.equal(Catalogue.isStateCode(states, null), false);
});

test('the label adds the English name only when it differs', () => {
  assert.equal(Catalogue.label(states[0]), 'Bayern (Bavaria)');
  assert.equal(Catalogue.label(states[1]), 'Berlin');
});

test('every state in data/states.js owns exactly its 10 consecutive questions', () => {
  const all = loadGlobal('data/questions.js', 'QUESTIONS');
  const list = loadGlobal('data/states.js', 'STATES');
  assert.equal(list.length, 16);
  for (const s of list) {
    // Arrays from the vm sandbox have a foreign prototype, which strict deepEqual rejects.
    const own = Array.from(all).filter((q) => q.scope === s.code).map((q) => q.id);
    assert.deepEqual(own, Array.from({ length: 10 }, (_, i) => s.firstId + i), s.code);
    assert.equal(Catalogue.forState(all, s.code).length, 310, s.code);
  }
});
