(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SRS = factory();
})(this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Leitner boxes: days until the next review after a correct answer lands the card in that box.
  const BOX_DAYS = [0, 1, 3, 7, 16, 35];
  const MAX_BOX = BOX_DAYS.length - 1;
  const MASTERED_BOX = 4;
  const RETRY_DELAY_MS = 10 * 60 * 1000;

  function newCard() {
    return { box: 0, due: 0, seen: 0, right: 0, wrong: 0, last: 0, lastOk: null };
  }

  function grade(card, ok, now) {
    const c = Object.assign(newCard(), card);
    c.box = ok ? Math.min(c.box + 1, MAX_BOX) : 0;
    c.due = now + BOX_DAYS[c.box] * DAY_MS;
    c.seen += 1;
    if (ok) c.right += 1;
    else c.wrong += 1;
    c.last = now;
    c.lastOk = ok;
    return c;
  }

  // A missed card answered correctly again in the same session stays in box 0 but leaves the queue for a short while.
  function postpone(card, now) {
    return Object.assign({}, card, { due: now + RETRY_DELAY_MS });
  }

  function isDue(card, now) {
    return !!card && card.seen > 0 && card.due <= now;
  }

  function isMastered(card) {
    return !!card && card.lastOk === true && card.box >= MASTERED_BOX;
  }

  function isMistake(card) {
    return !!card && card.lastOk === false;
  }

  // Lowest box first: the cards you know least come up before ones that merely expired.
  function dueQueue(questions, cards, now) {
    return questions
      .filter((q) => isDue(cards[q.id], now))
      .sort((a, b) => cards[a.id].box - cards[b.id].box || cards[a.id].due - cards[b.id].due);
  }

  // boxes[0] holds cards that were missed last time and need relearning; unseen questions are counted separately.
  function distribution(questions, cards) {
    const out = { unseen: 0, boxes: new Array(BOX_DAYS.length).fill(0) };
    for (const q of questions) {
      const c = cards[q.id];
      if (!c || c.seen === 0) out.unseen += 1;
      else out.boxes[c.box] += 1;
    }
    return out;
  }

  function describeInterval(card, now) {
    if (!card || card.box === 0) return 'back in your review queue';
    const days = Math.max(1, Math.round((card.due - now) / DAY_MS));
    return days === 1 ? 'next review in 1 day' : 'next review in ' + days + ' days';
  }

  return { DAY_MS, BOX_DAYS, MAX_BOX, MASTERED_BOX, RETRY_DELAY_MS, newCard, grade, postpone, isDue, isMastered, isMistake, dueQueue, distribution, describeInterval };
});
