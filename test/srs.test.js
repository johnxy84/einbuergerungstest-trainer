const test = require('node:test');
const assert = require('node:assert/strict');
const SRS = require('../js/srs.js');

const NOW = Date.UTC(2026, 0, 1);

test('a correct answer moves the card up one box and schedules its review', () => {
  let c = SRS.grade(SRS.newCard(), true, NOW);
  assert.equal(c.box, 1);
  assert.equal(c.due, NOW + 1 * SRS.DAY_MS);
  c = SRS.grade(c, true, NOW);
  assert.equal(c.box, 2);
  assert.equal(c.due, NOW + 3 * SRS.DAY_MS);
  assert.deepEqual([c.seen, c.right, c.wrong, c.lastOk], [2, 2, 0, true]);
});

test('a wrong answer resets the card and makes it due immediately', () => {
  let c = SRS.newCard();
  for (let i = 0; i < 4; i++) c = SRS.grade(c, true, NOW);
  c = SRS.grade(c, false, NOW + 1000);
  assert.equal(c.box, 0);
  assert.equal(c.due, NOW + 1000);
  assert.equal(c.lastOk, false);
  assert.ok(SRS.isDue(c, NOW + 1000));
  assert.ok(SRS.isMistake(c));
});

test('the box number never exceeds the maximum', () => {
  let c = SRS.newCard();
  for (let i = 0; i < 20; i++) c = SRS.grade(c, true, NOW);
  assert.equal(c.box, SRS.MAX_BOX);
});

test('unseen questions are never due, and a card is due only once its date passes', () => {
  assert.equal(SRS.isDue(undefined, NOW), false);
  assert.equal(SRS.isDue(SRS.newCard(), NOW), false);
  const c = SRS.grade(SRS.newCard(), true, NOW);
  assert.equal(SRS.isDue(c, NOW + SRS.DAY_MS - 1), false);
  assert.equal(SRS.isDue(c, NOW + SRS.DAY_MS), true);
});

test('mastered means correct last time and in box 4 or higher', () => {
  let c = SRS.newCard();
  for (let i = 0; i < 3; i++) c = SRS.grade(c, true, NOW);
  assert.equal(SRS.isMastered(c), false);
  c = SRS.grade(c, true, NOW);
  assert.equal(SRS.isMastered(c), true);
  assert.equal(SRS.isMastered(SRS.grade(c, false, NOW)), false);
});

test('the due queue lists the weakest boxes first, then the oldest due date', () => {
  const qs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const cards = {
    1: { ...SRS.newCard(), seen: 1, box: 2, due: NOW - 10 },
    2: { ...SRS.newCard(), seen: 1, box: 0, due: NOW - 5 },
    3: { ...SRS.newCard(), seen: 1, box: 2, due: NOW - 20 },
    4: { ...SRS.newCard(), seen: 1, box: 1, due: NOW + 99 },
  };
  assert.deepEqual(SRS.dueQueue(qs, cards, NOW).map((q) => q.id), [2, 3, 1]);
});

test('distribution counts unseen questions separately from boxes', () => {
  const qs = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const cards = { 1: SRS.grade(SRS.newCard(), true, NOW), 2: SRS.grade(SRS.newCard(), false, NOW) };
  const d = SRS.distribution(qs, cards);
  assert.equal(d.unseen, 1);
  assert.deepEqual(d.boxes, [1, 1, 0, 0, 0, 0]);
});

test('describeInterval words the next review', () => {
  const c = SRS.grade(SRS.newCard(), true, NOW);
  assert.equal(SRS.describeInterval(c, NOW), 'next review in 1 day');
  assert.equal(SRS.describeInterval(SRS.grade(c, true, NOW), NOW), 'next review in 3 days');
  assert.equal(SRS.describeInterval(SRS.grade(c, false, NOW), NOW), 'back in your review queue');
});

test('postponing a relearned card keeps its box but delays the next review', () => {
  const missed = SRS.grade(SRS.newCard(), false, NOW);
  const later = SRS.postpone(missed, NOW);
  assert.equal(later.box, 0);
  assert.equal(SRS.isDue(later, NOW), false);
  assert.equal(SRS.isDue(later, NOW + SRS.RETRY_DELAY_MS), true);
  assert.equal(missed.due, NOW, 'the original card is not modified');
});

test('the study queue lists due cards, then new state questions, then new general ones, capped', () => {
  const qs = [
    { id: 1, scope: 'General' }, { id: 2, scope: 'General' }, { id: 3, scope: 'BY' },
    { id: 4, scope: 'General' }, { id: 5, scope: 'BY' }, { id: 6, scope: 'General' },
  ];
  const cards = {
    1: { ...SRS.newCard(), seen: 1, box: 1, due: NOW - 5 },
    2: { ...SRS.newCard(), seen: 1, box: 3, due: NOW + 99 },
  };
  assert.deepEqual(SRS.studyQueue(qs, cards, NOW, 3).map((q) => q.id), [1, 3, 5, 4]);
  assert.deepEqual(SRS.studyQueue(qs, cards, NOW, 0).map((q) => q.id), [1]);
  assert.deepEqual(SRS.studyQueue(qs, {}, NOW, 99).map((q) => q.id), [3, 5, 1, 2, 4, 6]);
});

test('Study starts at most 15 new questions a day, more on request, and starts over the next local day', () => {
  const evening = new Date(2026, 0, 1, 23, 50).getTime();
  const nextMorning = new Date(2026, 0, 2, 0, 10).getTime();
  assert.equal(SRS.dayKey(evening), '2026-01-01');
  assert.equal(SRS.newLeftToday(null, evening), SRS.NEW_PER_DAY);

  let daily = null;
  for (let i = 0; i < SRS.NEW_PER_DAY; i++) daily = SRS.countNewStarted(daily, evening);
  assert.equal(SRS.newLeftToday(daily, evening), 0);
  const more = SRS.addNewBatch(daily, evening);
  assert.equal(SRS.newLeftToday(more, evening), SRS.NEW_PER_DAY);
  assert.equal(SRS.newLeftToday(daily, evening), 0, 'the original record is not modified');

  assert.equal(SRS.newLeftToday(more, nextMorning), SRS.NEW_PER_DAY);
  assert.deepEqual(SRS.countNewStarted(more, nextMorning), { day: '2026-01-02', started: 1, extra: 0 });
});
