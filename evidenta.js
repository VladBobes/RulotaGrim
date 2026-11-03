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
      apiBaseUrl: '',
    };
  }

  function resolveApiBaseUrl(config) {
    const cfg = config || getConfig();
    return String((cfg && cfg.apiBaseUrl) || '').trim().replace(/\/+$/, '');
  }

  /** Empty apiBaseUrl = same-origin relative (/api/evidenta) — intended on Oracle. */
  function hasApiBaseUrl(config) {
    return resolveApiBaseUrl(config).length > 0;
  }

  function isGitHubPagesHost() {
    if (typeof location === 'undefined') return false;
    return /\.github\.io$/i.test(location.hostname || '');
  }

  function isMixedContentRisk(config) {
    if (typeof location === 'undefined') return false;
    if (location.protocol !== 'https:') return false;
    const base = resolveApiBaseUrl(config);
    return /^http:/i.test(base);
  }

  function evidentaApiUrl(config) {
    const base = resolveApiBaseUrl(config);
    return `${base}/api/evidenta`;
  }

  function oracleSiteUrl(config) {
    const base = resolveApiBaseUrl(config);
    if (!base) return '';
    return `${base}/`;
  }

  function cloneStore(raw, itemList) {
    return normalizeStore(JSON.parse(JSON.stringify(raw || {})), itemList);
  }

  async function fetchEvidenta(config, fetchImpl) {
    const cfg = config || getConfig();
    const fetchFn = fetchImpl || fetch;
    const response = await fetchFn(evidentaApiUrl(cfg), {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const err = new Error(`API GET failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const payload = await response.json();
    return { data: normalizeStore(payload), raw: payload };
  }

  async function saveEvidenta(store, config, fetchImpl) {
    const cfg = config || getConfig();
    const fetchFn = fetchImpl || fetch;
    const response = await fetchFn(evidentaApiUrl(cfg), {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      body: JSON.stringify(store),
      cache: 'no-store',
    });
    if (!response.ok) {
      const err = new Error(`API PUT failed: ${response.status}`);
      err.status = response.status;
      try {
        err.details = await response.json();
      } catch (e) {}
      throw err;
    }
    return response.json();
  }

  /**
   * Apply mutator and PUT the full document to the Oracle API.
   * Uses options.data when present (shared in-memory state); otherwise GETs first.
   */
  async function mutateEvidenta(mutator, options) {
    const cfg = (options && options.config) || getConfig();
    const fetchImpl = options && options.fetchImpl;
    const itemList = options && options.itemList;

    let data = options && options.data != null ? options.data : null;
    if (data == null) {
      const remote = await fetchEvidenta(cfg, fetchImpl);
      data = remote.data;
    }

    const next = normalizeStore(mutator(cloneStore(data, itemList), itemList), itemList);
    next.updatedAt = new Date().toISOString();
    const result = await saveEvidenta(next, cfg, fetchImpl);
    return { store: normalizeStore(result, itemList), result };
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
    resolveApiBaseUrl,
    hasApiBaseUrl,
    isGitHubPagesHost,
    isMixedContentRisk,
    evidentaApiUrl,
    oracleSiteUrl,
    fetchEvidenta,
    saveEvidenta,
    mutateEvidenta,
  };
});
