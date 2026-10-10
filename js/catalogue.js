(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Catalogue = factory();
})(this, function () {
  const GENERAL = 'General';

  // What one learner studies: the general pool plus the questions of their own federal state.
  function forState(questions, code) {
    return questions.filter((q) => q.scope === GENERAL || q.scope === code).sort((a, b) => a.id - b.id);
  }

  function stateByCode(states, code) {
    return states.find((s) => s.code === code) || null;
  }

  function isStateCode(states, code) {
    return stateByCode(states, code) !== null;
  }

  // German name, with the English one in brackets when it differs.
  function label(state) {
    return state.en && state.en !== state.name ? state.name + ' (' + state.en + ')' : state.name;
  }

  return { GENERAL, forState, stateByCode, isStateCode, label };
});
