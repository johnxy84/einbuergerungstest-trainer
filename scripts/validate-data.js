#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadGlobal(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window[name];
}

function validate() {
  const errors = [];
  const questions = loadGlobal('data/questions.js', 'QUESTIONS');
  const explanations = loadGlobal('data/explanations.js', 'EXPLANATIONS');
  const fail = (msg) => errors.push(msg);

  const general = questions.filter((q) => q.scope === 'General').length;
  const bayern = questions.filter((q) => q.scope === 'Bayern').length;
  if (questions.length !== 310) fail('expected 310 questions, found ' + questions.length);
  if (general !== 300) fail('expected 300 general questions, found ' + general);
  if (bayern !== 10) fail('expected 10 Bayern questions, found ' + bayern);

  const seen = new Set();
  for (const q of questions) {
    const tag = 'Q' + q.id + ': ';
    if (seen.has(q.id)) fail(tag + 'duplicate id');
    seen.add(q.id);
    if (!q.q || !q.en_q) fail(tag + 'missing question text');
    if (q.options.length !== 4 || q.en_options.length !== 4) fail(tag + 'needs exactly 4 options in both languages');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) fail(tag + 'correct index out of range');
    if (q.options.concat(q.en_options).some((o) => !o)) fail(tag + 'empty option');
    if (new Set(q.options).size !== q.options.length) fail(tag + 'duplicate options');
    if (q.image && !fs.existsSync(path.join(root, q.image))) fail(tag + 'missing image ' + q.image);
    if (!explanations[q.id]) fail(tag + 'missing explanation');
  }
  for (let i = 1; i <= 310; i++) if (!seen.has(i)) fail('Q' + i + ': id missing');
  for (const id of Object.keys(explanations)) if (!seen.has(Number(id))) fail('explanation for unknown id ' + id);

  const images = fs.readdirSync(path.join(root, 'images')).filter((f) => f.endsWith('.jpg'));
  const referenced = new Set(questions.filter((q) => q.image).map((q) => path.basename(q.image)));
  for (const f of images) if (!referenced.has(f)) fail('unreferenced image ' + f);

  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const q of questions) if (q.image && !sw.includes("'" + q.image + "'")) fail('sw.js does not precache ' + q.image);

  return errors;
}

module.exports = { validate, loadGlobal };

if (require.main === module) {
  const errors = validate();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Data OK: 310 questions, explanations and images are consistent.');
}
