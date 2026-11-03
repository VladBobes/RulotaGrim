(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.keys(api).forEach((key) => {
    root[key] = api[key];
  });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const TAX_RATE = 0.1;

  function emptyQuantities(itemList) {
    return Object.fromEntries((itemList || []).map((item) => [item.key, 0]));
  }

  function normalizeQuantities(raw, itemList) {
    const quantities = emptyQuantities(itemList);
    if (!raw || typeof raw !== 'object') return quantities;
    for (const item of itemList || []) {
      const value = Number(raw[item.key]);
      quantities[item.key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }
    return quantities;
  }

  function entryDeliveredSum(entry, itemList) {
    const quantities = (entry && entry.quantities) || {};
    return (itemList || []).reduce((sum, item) => {
      return sum + ((quantities[item.key] || 0) * (item.price || 0));
    }, 0);
  }

  function entryTax(deliveredSum) {
    return Math.round(Number(deliveredSum || 0) * TAX_RATE);
  }

  function remainingCapacities(entries, groveCaps, itemList) {
    const remaining = { ...(groveCaps || {}) };
    const keys = itemList
      ? itemList.map((item) => item.key)
      : Object.keys(remaining);
    for (const key of keys) {
      const used = (entries || []).reduce((sum, entry) => {
        return sum + (((entry.quantities || {})[key]) || 0);
      }, 0);
      remaining[key] = (groveCaps && groveCaps[key] != null ? groveCaps[key] : 0) - used;
    }
    return remaining;
  }

  function totalsFromEntries(entries, itemList) {
    let deliveredTotal = 0;
    let taxTotal = 0;
    let taxUncollected = 0;
    for (const entry of entries || []) {
      const delivered = entryDeliveredSum(entry, itemList);
      const tax = entryTax(delivered);
      deliveredTotal += delivered;
      taxTotal += tax;
      if (!entry.taxCollected) taxUncollected += tax;
    }
    return { deliveredTotal, taxTotal, taxUncollected };
  }

  function createEntry({ responsabil, cnp, telefon, quantities, itemList, now }) {
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      responsabil: String(responsabil || '').trim(),
      cnp: String(cnp || '').trim(),
      telefon: String(telefon || '').trim(),
      quantities: normalizeQuantities(quantities, itemList),
      taxCollected: false,
      createdAt: (now || new Date()).toISOString(),
    };
  }

  function normalizeStore(raw, itemList) {
    const store = {
      version: 1,
      updatedAt: null,
      entries: [],
    };
    if (!raw || typeof raw !== 'object') return store;
    store.version = Number(raw.version) || 1;
    store.updatedAt = raw.updatedAt || null;
    store.entries = Array.isArray(raw.entries)
      ? raw.entries.map((entry) => ({
          id: String(entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
          responsabil: String(entry.responsabil || '').trim(),
          cnp: String(entry.cnp || '').trim(),
          telefon: String(entry.telefon || '').trim(),
          quantities: normalizeQuantities(entry.quantities, itemList),
          taxCollected: Boolean(entry.taxCollected),
          createdAt: entry.createdAt || null,
        }))
      : [];
    return store;
  }

  function getConfig() {
    return (root && root.EVIDENTA_CONFIG) || {
      owner: 'VladBobes',
      repo: 'RulotaGrim',
      branch: 'main',
      path: 'evidenta-rulota.json',
      token: '',
    };
  }

  function hasToken(config) {
    return Boolean(config && String(config.token || '').trim());
  }

  function contentsUrl(config) {
    const path = encodeURIComponent(config.path).replace(/%2F/g, '/');
    return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${encodeURIComponent(config.branch)}`;
  }

  function authHeaders(config, extra) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(extra || {}),
    };
    const token = String((config && config.token) || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function decodeBase64Utf8(content) {
    const cleaned = String(content || '').replace(/\n/g, '');
    if (typeof atob === 'function') {
      const binary = atob(cleaned);
      try {
        return decodeURIComponent(Array.from(binary, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
      } catch (e) {
        return binary;
      }
    }
    return Buffer.from(cleaned, 'base64').toString('utf8');
  }

  function encodeBase64Utf8(text) {
    if (typeof btoa === 'function') {
      const utf8 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      return btoa(utf8);
    }
    return Buffer.from(String(text), 'utf8').toString('base64');
  }

  async function fetchEvidentaFile(config, fetchImpl) {
    const cfg = config || getConfig();
    const fetchFn = fetchImpl || fetch;
    const response = await fetchFn(contentsUrl(cfg), {
      headers: authHeaders(cfg),
    });
    if (!response.ok) {
      const err = new Error(`GitHub GET failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const payload = await response.json();
    const text = decodeBase64Utf8(payload.content);
    const data = normalizeStore(JSON.parse(text));
    return { sha: payload.sha, data, raw: payload };
  }

  async function saveEvidentaFile(store, sha, config, fetchImpl, message) {
    const cfg = config || getConfig();
    if (!hasToken(cfg)) {
      const err = new Error('Token lipsă în evidenta-config.js');
      err.code = 'missing_token';
      throw err;
    }
    const fetchFn = fetchImpl || fetch;
    const body = {
      message: message || `Actualizare evidență rulotă ${new Date().toISOString()}`,
      content: encodeBase64Utf8(JSON.stringify(store, null, 2) + '\n'),
      branch: cfg.branch,
      sha,
    };
    const response = await fetchFn(contentsUrl(cfg).replace(/\?ref=.*$/, ''), {
      method: 'PUT',
      headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = new Error(`GitHub PUT failed: ${response.status}`);
      err.status = response.status;
      try {
        err.details = await response.json();
      } catch (e) {}
      throw err;
    }
    return response.json();
  }

  async function mutateEvidenta(mutator, options) {
    const cfg = (options && options.config) || getConfig();
    const fetchImpl = options && options.fetchImpl;
    const itemList = options && options.itemList;
    let attempt = 0;
    let lastError = null;

    while (attempt < 2) {
      attempt += 1;
      const { sha, data } = await fetchEvidentaFile(cfg, fetchImpl);
      const next = normalizeStore(mutator(normalizeStore(data, itemList), itemList), itemList);
      next.updatedAt = new Date().toISOString();
      try {
        const result = await saveEvidentaFile(next, sha, cfg, fetchImpl, options && options.message);
        return { store: next, result, sha: result.content && result.content.sha };
      } catch (err) {
        lastError = err;
        if (err.status === 409 && attempt < 2) continue;
        throw err;
      }
    }
    throw lastError;
  }

  return {
    TAX_RATE,
    emptyQuantities,
    normalizeQuantities,
    entryDeliveredSum,
    entryTax,
    remainingCapacities,
    totalsFromEntries,
    createEntry,
    normalizeStore,
    getConfig,
    hasToken,
    fetchEvidentaFile,
    saveEvidentaFile,
    mutateEvidenta,
  };
});
