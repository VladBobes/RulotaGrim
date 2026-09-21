const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  items,
  money,
  calculateDelivery,
  formatDeliveryText,
  TRAILER_PRESETS,
} = require('../allocation');
const { createStore } = require('../bot/store');

function preset(id) {
  return TRAILER_PRESETS.find(trailer => trailer.id === id);
}

function allocatedTotal(allocations, key) {
  return allocations.reduce((sum, player) => sum + (player.allocated[key] || 0), 0);
}

function valueOf(player) {
  return items.reduce((sum, item) => sum + ((player.allocated[item.key] || 0) * item.price), 0);
}

const players = [
  {
    name: 'Vlad',
    cnp: '111',
    quantities: { plicCocaina: 700, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  },
  {
    name: 'Ana',
    cnp: '222',
    quantities: { plicCocaina: 700, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  },
];

test('exportul de livrare păstrează sumele, rulota și tăierile', () => {
  assert.equal(money(10880000), '$10,880,000');

  const exact = [{
    name: 'Vlad',
    cnp: '111',
    quantities: { plicCocaina: 800, joint: 400, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
    allocated: { plicCocaina: 800, joint: 400, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  }];
  assert.equal(
    formatDeliveryText(exact, preset('grove')),
    [
      'Rulotă: Grove',
      '',
      'Vlad | 111',
      'Plic cocaină | 800 | $10,880,000',
      'Joint | 400 | $3,000,000',
      'Sumă alocată | $13,880,000',
      '',
      'Sumă totală alocată | $13,880,000',
    ].join('\n'),
  );

  const cut = [{
    ...exact[0],
    quantities: { ...exact[0].quantities, plicCocaina: 900 },
  }];
  const cutText = formatDeliveryText(cut, { id: 'custom', name: 'Custom' });
  assert.equal(cutText.includes('Rulotă:'), false);
  assert.equal(cutText.startsWith('Vlad | 111'), true);
  assert.match(cutText, /Plic cocaină \| 800 \| \$10,880,000 \(cerut 900\)/);

  const grove = calculateDelivery(players, preset('grove').capacities);
  const sandy = calculateDelivery(players, preset('sandy').capacities);
  assert.notEqual(allocatedTotal(grove.allocations, 'plicCocaina'), allocatedTotal(sandy.allocations, 'plicCocaina'));

  const groveText = formatDeliveryText(grove.allocations, preset('grove'));
  const sandyText = formatDeliveryText(sandy.allocations, preset('sandy'));
  const customText = formatDeliveryText(grove.allocations, preset('custom'));

  assert.equal(groveText.startsWith('Rulotă: Grove'), true);
  assert.equal(sandyText.startsWith('Rulotă: Sandy'), true);
  assert.equal(customText.includes('Rulotă:'), false);

  for (const result of [grove, sandy]) {
    const text = formatDeliveryText(result.allocations, preset('grove'));
    const playerValues = result.allocations.map(valueOf);
    const grand = playerValues.reduce((sum, value) => sum + value, 0);
    assert.equal(result.grandTotal, grand);
    assert.match(text, new RegExp(`Sumă totală alocată \\| ${escapeRegExp(money(grand))}`));
    playerValues.forEach(value => {
      assert.ok(text.includes(`Sumă alocată | ${money(value)}`));
    });
    const lineValues = [...text.matchAll(/^(Plic cocaină|Joint|Țigară|Red Fire|Green Haze|Blue Current) \| (\d+) \| (\$[0-9,]+)/gm)];
    let shown = 0;
    for (const match of lineValues) {
      const item = items.find(candidate => candidate.name === match[1]);
      const quantity = Number(match[2]);
      assert.equal(match[3], money(quantity * item.price));
      shown += quantity * item.price;
    }
    assert.equal(shown, grand);
  }

  assert.equal(allocatedTotal(grove.allocations, 'plicCocaina'), 1400);
  assert.equal(allocatedTotal(sandy.allocations, 'plicCocaina'), 1000);

  assert.match(sandyText, /\(cerut \d+\)/);
});

test('predările se înlocuiesc pe user și refuză CNP duplicat', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rulota-')), 'submissions.json');
  const store = createStore(file);
  const base = {
    userId: 'u1',
    name: 'Vlad',
    cnp: '111',
    quantities: { plicCocaina: 10, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  };
  assert.equal(store.upsert({ ...base, quantities: { plicCocaina: 0, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 } }).code, 'empty');
  assert.equal(store.upsert({ ...base, cnp: '12a' }).code, 'cnp');
  assert.equal(store.upsert(base).ok, true);
  assert.equal(store.upsert({ ...base, quantities: { ...base.quantities, joint: 4 } }).replaced, true);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].quantities.joint, 4);
  assert.equal(store.upsert({ ...base, userId: 'u2', name: 'Ana' }).code, 'cnp_taken');
  assert.equal(store.upsert({ ...base, userId: 'u2', name: 'Ana', cnp: '222', quantities: { ...base.quantities, tigara: 3 } }).ok, true);
  assert.equal(store.list().length, 2);
  store.clear();
  assert.equal(store.list().length, 0);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
