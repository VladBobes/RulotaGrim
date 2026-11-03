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
  nextShaFromPutResponse,
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

test('nextShaFromPutResponse preferă content.sha (blob), nu commit.sha', () => {
  assert.equal(nextShaFromPutResponse({
    content: { sha: 'blob-abc' },
    commit: { sha: 'commit-xyz' },
  }), 'blob-abc');
  assert.equal(nextShaFromPutResponse({ sha: 'top-level' }), 'top-level');
  assert.equal(nextShaFromPutResponse(null), null);
  assert.equal(nextShaFromPutResponse({}), null);
});

test('mutateEvidenta folosește sha local și actualizează din răspunsul PUT', async () => {
  let getCount = 0;
  let putCount = 0;
  let putSha = null;
  const localStore = normalizeStore({ version: 1, entries: [] }, items);

  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      throw new Error('GET should not run when local sha/data are provided');
    }
    putCount += 1;
    const body = JSON.parse(options.body);
    putSha = body.sha;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: { sha: 'sha-after-put' },
        commit: { sha: 'commit-should-not-use' },
      }),
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
    config: {
      owner: 'VladBobes',
      repo: 'RulotaGrim',
      branch: 'main',
      path: 'evidenta-rulota.json',
      token: 'test-token',
    },
    fetchImpl,
    itemList: items,
    sha: 'sha-local',
    data: localStore,
  });

  assert.equal(getCount, 0);
  assert.equal(putCount, 1);
  assert.equal(putSha, 'sha-local');
  assert.equal(result.sha, 'sha-after-put');
  assert.equal(localStore.entries.length, 0); // mutation pe clonă
  assert.equal(result.store.entries.length, 1);
});

test('mutateEvidenta reîncarcă și reîncearcă la conflict 409 (până la 3 încercări)', async () => {
  let getCount = 0;
  let putCount = 0;
  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      const store = {
        version: 1,
        updatedAt: null,
        entries: getCount === 1 ? [] : [{
          id: 'existing',
          responsabil: 'X',
          cnp: '1',
          telefon: '',
          quantities: { plicCocaina: 1, joint: 0, tigara: 0, redFire: 0, greenHaze: 0, blueCurrent: 0 },
          taxCollected: false,
          createdAt: '2020-01-01T00:00:00.000Z',
        }],
      };
      const content = Buffer.from(JSON.stringify(store), 'utf8').toString('base64');
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: `sha-${getCount}`, content }),
      };
    }

    putCount += 1;
    if (putCount <= 2) {
      return {
        ok: false,
        status: 409,
        json: async () => ({ message: 'Conflict' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: { sha: 'sha-final' } }),
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
    config: {
      owner: 'VladBobes',
      repo: 'RulotaGrim',
      branch: 'main',
      path: 'evidenta-rulota.json',
      token: 'test-token',
    },
    fetchImpl,
    itemList: items,
    sha: 'sha-stale',
    data: normalizeStore({ version: 1, entries: [] }, items),
  });

  // attempt1: local sha → 409; attempt2: GET+PUT → 409; attempt3: GET+PUT → ok
  assert.equal(getCount, 2);
  assert.equal(putCount, 3);
  assert.equal(result.sha, 'sha-final');
  assert.ok(result.store.entries.some((e) => e.cnp === '2'));
  assert.ok(result.store.entries.some((e) => e.id === 'existing'));
});

test('mutateEvidenta renunță după epuizarea reîncercărilor 409', async () => {
  let putCount = 0;
  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      const store = { version: 1, updatedAt: null, entries: [] };
      const content = Buffer.from(JSON.stringify(store), 'utf8').toString('base64');
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: 'sha-remote', content }),
      };
    }
    putCount += 1;
    return {
      ok: false,
      status: 409,
      json: async () => ({ message: 'Conflict' }),
    };
  };

  await assert.rejects(
    () => mutateEvidenta((store) => store, {
      config: {
        owner: 'VladBobes',
        repo: 'RulotaGrim',
        branch: 'main',
        path: 'evidenta-rulota.json',
        token: 'test-token',
      },
      fetchImpl,
      itemList: items,
      sha: 'sha-local',
      data: normalizeStore({ version: 1, entries: [] }, items),
      maxAttempts: 3,
    }),
    (err) => err && err.status === 409,
  );
  assert.equal(putCount, 3);
});
