const test = require('node:test');
const assert = require('node:assert/strict');
const {
  items,
  GROVE_CAPS,
  money,
} = require('../allocation');
const {
  entryDeliveredSum,
  entryTax,
  remainingCapacities,
  totalsFromEntries,
  createEntry,
  normalizeStore,
  resolveApiBaseUrl,
  hasApiBaseUrl,
  isMixedContentRisk,
  evidentaApiUrl,
  mutateEvidenta,
} = require('../evidenta');

test('taxa este 10% din suma livrată, rotunjită ca money()', () => {
  const entry = {
    quantities: { plicCocaina: 10, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
  };
  const sum = entryDeliveredSum(entry, items);
  assert.equal(sum, 10 * 13600);
  assert.equal(entryTax(sum), Math.round(sum * 0.1));
  assert.equal(money(entryTax(sum)), money(Math.round(sum * 0.1)));

  assert.equal(entryTax(15), 2); // 1.5 → 2
  assert.equal(entryTax(14), 1); // 1.4 → 1
});

test('capacitatea rămasă = Grove max minus suma cantităților', () => {
  const entries = [
    { quantities: { plicCocaina: 100, joint: 50, tigara: 0, redFire: 10, greenHaze: 0, blueCurrent: 0 } },
    { quantities: { plicCocaina: 200, joint: 0, tigara: 25, redFire: 0, greenHaze: 5, blueCurrent: 3 } },
  ];
  const remaining = remainingCapacities(entries, GROVE_CAPS, items);
  assert.equal(remaining.plicCocaina, 2000 - 300);
  assert.equal(remaining.joint, 2000 - 50);
  assert.equal(remaining.tigara, 2000 - 25);
  assert.equal(remaining.redFire, 1000 - 10);
  assert.equal(remaining.greenHaze, 1000 - 5);
  assert.equal(remaining.blueCurrent, 1000 - 3);
});

test('rămășița poate deveni negativă (peste cap)', () => {
  const entries = [
    { quantities: { plicCocaina: 2500, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 } },
  ];
  const remaining = remainingCapacities(entries, GROVE_CAPS, items);
  assert.equal(remaining.plicCocaina, -500);
});

test('același CNP poate apărea de mai multe ori în evidență', () => {
  const store = normalizeStore({ version: 1, entries: [] }, items);
  store.entries.push(createEntry({
    responsabil: 'A',
    cnp: '123',
    telefon: '0700000001',
    quantities: { plicCocaina: 1 },
    itemList: items,
  }));
  store.entries.push(createEntry({
    responsabil: 'B',
    cnp: '123',
    telefon: '0700000002',
    quantities: { joint: 2 },
    itemList: items,
  }));
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[0].cnp, store.entries[1].cnp);
  const cnps = store.entries.map((e) => e.cnp);
  assert.equal(cnps.filter((c) => c === '123').length, 2);
});

test('totalurile agregă suma livrată, taxa și taxa neîncasată', () => {
  const entries = [
    {
      taxCollected: true,
      quantities: { plicCocaina: 10, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
    },
    {
      taxCollected: false,
      quantities: { plicCocaina: 5, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
    },
  ];
  const totals = totalsFromEntries(entries, items);
  assert.equal(totals.deliveredTotal, 15 * 13600);
  assert.equal(totals.taxTotal, entryTax(10 * 13600) + entryTax(5 * 13600));
  assert.equal(totals.taxUncollected, entryTax(5 * 13600));
});

test('resolveApiBaseUrl taie slash-urile de la final; gol = same-origin', () => {
  assert.equal(resolveApiBaseUrl({ apiBaseUrl: '' }), '');
  assert.equal(resolveApiBaseUrl({ apiBaseUrl: 'http://1.2.3.4:8787/' }), 'http://1.2.3.4:8787');
  assert.equal(hasApiBaseUrl({ apiBaseUrl: '' }), false);
  assert.equal(hasApiBaseUrl({ apiBaseUrl: 'http://1.2.3.4:8787' }), true);
  assert.equal(evidentaApiUrl({ apiBaseUrl: '' }), '/api/evidenta');
  assert.equal(evidentaApiUrl({ apiBaseUrl: 'http://1.2.3.4:8787' }), 'http://1.2.3.4:8787/api/evidenta');
});

test('isMixedContentRisk detectează https page + http API', () => {
  const previous = globalThis.location;
  globalThis.location = { protocol: 'https:', hostname: 'vladbobes.github.io' };
  try {
    assert.equal(isMixedContentRisk({ apiBaseUrl: 'http://1.2.3.4:8787' }), true);
    assert.equal(isMixedContentRisk({ apiBaseUrl: 'https://1.2.3.4:8787' }), false);
    assert.equal(isMixedContentRisk({ apiBaseUrl: '' }), false);
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});

test('mutateEvidenta face PUT cu documentul complet (fără sha)', async () => {
  let getCount = 0;
  let putCount = 0;
  let putBody = null;
  const localStore = normalizeStore({ version: 1, entries: [] }, items);

  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    assert.match(String(url), /\/api\/evidenta$/);
    if (method === 'GET') {
      getCount += 1;
      throw new Error('GET should not run when local data is provided');
    }
    putCount += 1;
    putBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => putBody,
    };
  };

  const result = await mutateEvidenta((store) => {
    store.entries.push(createEntry({
      responsabil: 'Y',
      cnp: '2',
      telefon: '',
      quantities: { joint: 1 },
      itemList: items,
    }));
    return store;
  }, {
    config: { apiBaseUrl: 'http://127.0.0.1:8787' },
    fetchImpl,
    itemList: items,
    data: localStore,
  });

  assert.equal(getCount, 0);
  assert.equal(putCount, 1);
  assert.equal(putBody.entries.length, 1);
  assert.equal(putBody.entries[0].cnp, '2');
  assert.ok(putBody.updatedAt);
  assert.equal(localStore.entries.length, 0); // mutation pe clonă
  assert.equal(result.store.entries.length, 1);
});

test('mutateEvidenta încarcă remote dacă data lipsește', async () => {
  let getCount = 0;
  let putCount = 0;

  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          updatedAt: null,
          entries: [{
            id: 'existing',
            responsabil: 'X',
            cnp: '1',
            telefon: '',
            quantities: { plicCocaina: 1, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
            taxCollected: false,
            createdAt: '2020-01-01T00:00:00.000Z',
          }],
        }),
      };
    }
    putCount += 1;
    const body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => body };
  };

  const result = await mutateEvidenta((store) => {
    store.entries.push(createEntry({
      responsabil: 'Y',
      cnp: '2',
      telefon: '',
      quantities: { joint: 1 },
      itemList: items,
    }));
    return store;
  }, {
    config: { apiBaseUrl: '' },
    fetchImpl,
    itemList: items,
  });

  assert.equal(getCount, 1);
  assert.equal(putCount, 1);
  assert.ok(result.store.entries.some((e) => e.id === 'existing'));
  assert.ok(result.store.entries.some((e) => e.cnp === '2'));
});
