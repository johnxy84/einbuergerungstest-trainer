const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../scripts/validate-data.js');

test('question data, explanations and images are consistent', () => {
  assert.deepEqual(validate(), []);
});
