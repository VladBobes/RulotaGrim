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

  function contentsUrl(config, options) {
    const path = encodeURIComponent(config.path).replace(/%2F/g, '/');
    const base = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
    if (options && options.forWrite) return base;
    const bust = options && options.cacheBust != null ? options.cacheBust : Date.now();
    return `${base}?ref=${encodeURIComponent(config.branch)}&_=${encodeURIComponent(String(bust))}`;
  }

  function authHeaders(config, extra) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(extra || {}),
    };
    const token = String((config && config.token) || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  /** Blob SHA needed for the next Contents API update (not the commit SHA). */
  function nextShaFromPutResponse(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.content && typeof payload.content.sha === 'string' && payload.content.sha) {
      return payload.content.sha;
    }
    if (typeof payload.sha === 'string' && payload.sha) return payload.sha;
    return null;
  }

  function cloneStore(raw, itemList) {
    return normalizeStore(JSON.parse(JSON.stringify(raw || {})), itemList);
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
      cache: 'no-store',
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
    const response = await fetchFn(contentsUrl(cfg, { forWrite: true }), {
      method: 'PUT',
      headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      cache: 'no-store',
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

  /**
   * Apply mutator and PUT. Uses options.sha / options.data when present (shared
   * in-memory state); on 409 reloads remote JSON+sha and re-applies the mutation.
   */
  async function mutateEvidenta(mutator, options) {
    const cfg = (options && options.config) || getConfig();
    const fetchImpl = options && options.fetchImpl;
    const itemList = options && options.itemList;
    const maxAttempts = Math.max(1, Number((options && options.maxAttempts) || 3));
    let sha = options && options.sha != null ? options.sha : null;
    let data = options && options.data != null ? options.data : null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const mustReload = sha == null || data == null || attempt > 1;
      if (mustReload) {
        const remote = await fetchEvidentaFile(cfg, fetchImpl);
        sha = remote.sha;
        data = remote.data;
      }

      const next = normalizeStore(mutator(cloneStore(data, itemList), itemList), itemList);
      next.updatedAt = new Date().toISOString();

      try {
        const result = await saveEvidentaFile(next, sha, cfg, fetchImpl, options && options.message);
        const newSha = nextShaFromPutResponse(result);
        return { store: next, result, sha: newSha };
      } catch (err) {
        lastError = err;
        if (err.status === 409 && attempt < maxAttempts) {
          sha = null;
          data = null;
          continue;
        }
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
    nextShaFromPutResponse,
    fetchEvidentaFile,
    saveEvidentaFile,
    mutateEvidenta,
  };
});
