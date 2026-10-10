#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

const GENERAL_COUNT = 300;
const PER_STATE = 10;

function loadGlobal(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window[name];
}

// Longest names first and masked after matching, so "Sachsen" is not found inside "Sachsen-Anhalt" or "Niedersachsen".
function findStateNames(text, names) {
  const found = [];
  let rest = text;
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?<![\\p{L}-])' + escaped + '(?![\\p{L}-])', 'gu');
    if (re.test(rest)) {
      found.push(name);
      rest = rest.replace(re, ' ');
    }
  }
  return found;
}

function validate() {
  const errors = [];
  const questions = loadGlobal('data/questions.js', 'QUESTIONS');
  const explanations = loadGlobal('data/explanations.js', 'EXPLANATIONS');
  const explanationsDe = loadGlobal('data/explanations_de.js', 'EXPLANATIONS_DE');
  const states = loadGlobal('data/states.js', 'STATES');
  const fail = (msg) => errors.push(msg);

  const total = GENERAL_COUNT + states.length * PER_STATE;
  const general = questions.filter((q) => q.scope === 'General').length;
  if (questions.length !== total) fail('expected ' + total + ' questions, found ' + questions.length);
  if (general !== GENERAL_COUNT) fail('expected ' + GENERAL_COUNT + ' general questions, found ' + general);

  const codes = states.map((s) => s.code);
  if (new Set(codes).size !== codes.length) fail('duplicate state codes in data/states.js');
  const byCode = new Map(states.map((s) => [s.code, s]));
  for (const q of questions) {
    if (q.scope !== 'General' && !byCode.has(q.scope)) fail('Q' + q.id + ': unknown scope ' + q.scope);
  }
  for (const s of states) {
    const own = questions.filter((q) => q.scope === s.code);
    if (own.length !== PER_STATE) fail(s.code + ': expected ' + PER_STATE + ' questions, found ' + own.length);
    for (let i = 0; i < PER_STATE; i++) {
      const q = questions.find((x) => x.id === s.firstId + i);
      if (!q) fail(s.code + ': id ' + (s.firstId + i) + ' missing');
      else if (q.scope !== s.code) fail('Q' + q.id + ': scope ' + q.scope + ' but id belongs to ' + s.code);
    }
  }
  for (const q of questions) {
    if (q.scope === 'General' && q.id > GENERAL_COUNT) fail('Q' + q.id + ': general question outside ids 1-' + GENERAL_COUNT);
  }

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
    if (!explanationsDe[q.id]) fail(tag + 'missing German explanation');

    const own = byCode.get(q.scope);
    if (own) {
      const mentioned = findStateNames(q.q, states.map((s) => s.name));
      if (mentioned.length && !mentioned.includes(own.name)) fail(tag + 'question names ' + mentioned.join(', ') + ' but belongs to ' + own.name);
      const mentionedEn = findStateNames(q.en_q, states.map((s) => s.en));
      if (mentionedEn.length && !mentionedEn.includes(own.en)) fail(tag + 'English question names ' + mentionedEn.join(', ') + ' but belongs to ' + own.en);
    }
  }
  for (let i = 1; i <= total; i++) if (!seen.has(i)) fail('Q' + i + ': id missing');
  for (const id of Object.keys(explanations)) if (!seen.has(Number(id))) fail('explanation for unknown id ' + id);
  for (const id of Object.keys(explanationsDe)) if (!seen.has(Number(id))) fail('German explanation for unknown id ' + id);

  const images = fs.readdirSync(path.join(root, 'images')).filter((f) => f.endsWith('.jpg'));
  const referenced = new Set(questions.filter((q) => q.image).map((q) => path.basename(q.image)));
  for (const f of images) if (!referenced.has(f)) fail('unreferenced image ' + f);

  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const q of questions) if (q.image && !sw.includes("'" + q.image + "'")) fail('sw.js does not precache ' + q.image);

  return errors;
}

module.exports = { validate, loadGlobal, findStateNames, GENERAL_COUNT, PER_STATE };

if (require.main === module) {
  const errors = validate();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  const states = loadGlobal('data/states.js', 'STATES');
  const total = GENERAL_COUNT + states.length * PER_STATE;
  console.log('Data OK: ' + total + ' questions (' + GENERAL_COUNT + ' general + ' + states.length + ' states x ' + PER_STATE + '), explanations and images are consistent.');
}
