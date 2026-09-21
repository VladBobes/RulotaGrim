const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatPlayerLabel } = require('../bot/player-label');
const { createStore } = require('../bot/store');

test('eticheta jucătorului conține CNP-ul o singură dată', () => {
  assert.equal(formatPlayerLabel('Bobe', '19723'), 'Bobe | 19723');
  assert.equal(formatPlayerLabel('Bobe | 19723', '19723'), 'Bobe | 19723');
  assert.equal(formatPlayerLabel('Bobe|19723', '19723'), 'Bobe | 19723');
  assert.equal(formatPlayerLabel('Bobe | 19723 | 19723', '19723'), 'Bobe | 19723');
  assert.equal(formatPlayerLabel('  Bobe |19723  ', '19723'), 'Bobe | 19723');
});

test('predarea salvează numele fără CNP-ul deja prezent la final', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rulota-label-')), 'submissions.json');
  const store = createStore(file);
  const result = store.upsert({
    userId: 'u1',
    name: 'Bobe | 19723',
    cnp: '19723',
    quantities: { plicCocaina: 100, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.submission.name, 'Bobe');
  assert.equal(result.submission.cnp, '19723');
  assert.equal(formatPlayerLabel(result.submission.name, result.submission.cnp), 'Bobe | 19723');
  assert.equal(formatPlayerLabel(store.list()[0].name, store.list()[0].cnp), 'Bobe | 19723');
});
