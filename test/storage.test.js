const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../js/storage.js');
const SRS = require('../js/srs.js');
const { loadGlobal } = require('../scripts/validate-data.js');

const questions = loadGlobal('data/questions.js', 'QUESTIONS');
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
const NOW = Date.UTC(2026, 5, 1);

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, data };
};

test('a first-version export is regraded against the current answer key', () => {
  const wrongUnderOldKey = byId[154];
  const oldExport = {
    answers: { 1: byId[1].correct, 2: (byId[2].correct + 1) % 4, 154: 0, 9999: 1 },
    mistakes: [2],
    showEnglish: false,
  };
  const p = Store.normalize(oldExport, byId, NOW);
  assert.equal(p.version, 2);
  assert.equal(p.cards[1].box, 1);
  assert.equal(p.cards[1].lastOk, true);
  assert.equal(p.cards[2].box, 0);
  assert.equal(p.cards[2].lastOk, false);
  assert.equal(wrongUnderOldKey.en_options[0], '1933');
  assert.equal(p.cards[154].lastOk, false, 'choosing 1933 is wrong under the corrected key');
  assert.equal(p.cards[9999], undefined);
  assert.equal(p.settings.showEnglish, false);
  assert.ok(SRS.isDue(p.cards[2], NOW));
  assert.ok(!SRS.isDue(p.cards[1], NOW));
});

test('English translations are off by default', () => {
  assert.equal(Store.empty().settings.showEnglish, false);
});

const fixture = Object.fromEntries([
  { id: 1, scope: 'General', correct: 0, options: ['a', 'b', 'c', 'd'] },
  { id: 2, scope: 'BY', correct: 0, options: ['a', 'b', 'c', 'd'] },
  { id: 3, scope: 'NW', correct: 0, options: ['a', 'b', 'c', 'd'] },
].map((q) => [q.id, q]));

test('a new store has no state yet, so the app asks for one', () => {
  assert.equal(Store.empty().settings.state, null);
  const store = Store.createStore(memoryStorage(), fixture, () => NOW);
  assert.equal(store.load().settings.state, null);
});

test('progress saved before state support is treated as Bavaria', () => {
  assert.equal(Store.normalize({ version: 2 }, fixture, NOW).settings.state, 'BY');
  assert.equal(Store.normalize({ version: 2, settings: { showEnglish: true } }, fixture, NOW).settings.state, 'BY');
  assert.equal(Store.normalize({ version: 2, settings: { state: null } }, fixture, NOW).settings.state, 'BY');
  assert.equal(Store.normalize({ answers: { 1: 0 } }, fixture, NOW).settings.state, 'BY');

  const legacy = memoryStorage({ [Store.LEGACY_KEY]: JSON.stringify({ answers: { 1: 0 }, mistakes: [] }) });
  assert.equal(Store.createStore(legacy, fixture, () => NOW).load().settings.state, 'BY');
});

test('a saved state is kept when the catalogue knows it and replaced by Bavaria otherwise', () => {
  assert.equal(Store.normalize({ version: 2, settings: { state: 'NW' } }, fixture, NOW).settings.state, 'NW');
  assert.equal(Store.normalize({ version: 2, settings: { state: 'XX' } }, fixture, NOW).settings.state, 'BY');
  assert.equal(Store.normalize({ version: 2, settings: { state: 'General' } }, fixture, NOW).settings.state, 'BY');
  assert.equal(Store.normalize({ version: 2, settings: { state: 7 } }, fixture, NOW).settings.state, 'BY');
});

test('the chosen state survives an export and a save', () => {
  const p = Store.empty();
  p.settings.state = 'NW';
  assert.equal(Store.normalize(JSON.parse(Store.serialize(p, NOW)), fixture, NOW).settings.state, 'NW');

  const storage = memoryStorage();
  Store.createStore(storage, fixture, () => NOW).save(p);
  assert.equal(Store.createStore(storage, fixture, () => NOW).load().settings.state, 'NW');
});

test('a second-version export round-trips', () => {
  const p = Store.empty();
  p.cards[5] = SRS.grade(SRS.newCard(), true, NOW);
  p.exams.push({ at: NOW, correct: 20, total: 33, passed: true, seconds: 1800 });
  const again = Store.normalize(JSON.parse(Store.serialize(p, NOW)), byId, NOW);
  assert.deepEqual(again.cards, p.cards);
  assert.deepEqual(again.exams, p.exams);
});

test("today's count of new questions survives an export, and a malformed one is dropped", () => {
  const p = Store.empty();
  p.daily = SRS.addNewBatch(SRS.countNewStarted(null, NOW), NOW);
  assert.deepEqual(Store.normalize(JSON.parse(Store.serialize(p, NOW)), byId, NOW).daily, p.daily);
  assert.deepEqual(Store.normalize({ version: 2, daily: { day: '2026-06-01', started: -3, extra: 2.9 } }, byId, NOW).daily, { day: '2026-06-01', started: 0, extra: 2 });
  assert.equal(Store.normalize({ version: 2, daily: { day: 'today', started: 5 } }, byId, NOW).daily, null);
  assert.equal(Store.normalize({ version: 2 }, byId, NOW).daily, null);
});

test('imports drop unknown questions and clamp bad numbers', () => {
  const p = Store.normalize({
    version: 2,
    cards: { 1: { box: 99, due: 'x', seen: -4, right: 2.7, lastOk: 'yes' }, 777: { box: 1 } },
    exams: [{ at: 'never' }],
  }, byId, NOW);
  assert.deepEqual(Object.keys(p.cards), ['1']);
  assert.equal(p.cards[1].box, SRS.MAX_BOX);
  assert.equal(p.cards[1].due, 0);
  assert.equal(p.cards[1].seen, 0);
  assert.equal(p.cards[1].right, 2);
  assert.equal(p.cards[1].lastOk, null);
  assert.deepEqual(p.exams, []);
});

test('an unfinished exam survives a reload only if it is well formed', () => {
  const ids = [1, 2, 3];
  const good = { ids, choices: { 1: 2, 2: 9, 3: 0 }, startedAt: 1, endsAt: 2 };
  const p = Store.normalize({ version: 2, activeExam: good }, byId, NOW);
  assert.deepEqual(p.activeExam.choices, { 1: 2, 3: 0 });
  assert.equal(Store.normalize({ version: 2, activeExam: { ...good, ids: [1, 5000] } }, byId, NOW).activeExam, null);
  assert.equal(Store.normalize({ version: 2, activeExam: { ...good, endsAt: 'soon' } }, byId, NOW).activeExam, null);
});

test('files that are not progress exports are rejected', () => {
  assert.throws(() => Store.normalize({ hello: 'world' }, byId, NOW));
  assert.throws(() => Store.normalize(null, byId, NOW));
});

test('the store saves, reloads, and falls back to the legacy key', () => {
  const storage = memoryStorage();
  const store = Store.createStore(storage, byId, () => NOW);
  assert.deepEqual(store.load(), Store.empty());
  const p = Store.empty();
  p.cards[3] = SRS.grade(SRS.newCard(), true, NOW);
  assert.equal(store.save(p), true);
  assert.deepEqual(Store.createStore(storage, byId, () => NOW).load().cards, p.cards);

  const legacy = memoryStorage({ [Store.LEGACY_KEY]: JSON.stringify({ answers: { 4: byId[4].correct }, mistakes: [] }) });
  assert.equal(Store.createStore(legacy, byId, () => NOW).load().cards[4].box, 1);
});

test('unavailable storage keeps progress in memory instead of throwing', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const store = Store.createStore(broken, byId, () => NOW);
  const p = Store.empty();
  p.cards[1] = SRS.grade(SRS.newCard(), true, NOW);
  assert.equal(store.save(p), false);
  assert.equal(store.load().cards[1].box, 1);
});

test('corrupt saved data is ignored', () => {
  const storage = memoryStorage({ [Store.KEY]: '{not json' });
  assert.deepEqual(Store.createStore(storage, byId, () => NOW).load(), Store.empty());
});
