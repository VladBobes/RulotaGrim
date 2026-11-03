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

  /** Discord option names / snake_case aliases → allocation item keys. */
  const QUANTITY_KEY_ALIASES = {
    plic_cocaina: 'plicCocaina',
    pliccocaina: 'plicCocaina',
    'plic cocaina': 'plicCocaina',
    'plic cocaină': 'plicCocaina',
    joint: 'joint',
    tigara: 'tigara',
    țigară: 'tigara',
    tigara_: 'tigara',
    red_fire: 'redFire',
    redfire: 'redFire',
    'red fire': 'redFire',
    green_haze: 'greenHaze',
    greenhaze: 'greenHaze',
    'green haze': 'greenHaze',
    blue_current: 'blueCurrent',
    bluecurrent: 'blueCurrent',
    'blue current': 'blueCurrent',
  };

  function emptyQuantities(itemList) {
    return Object.fromEntries((itemList || []).map((item) => [item.key, 0]));
  }

  function camelToSnake(key) {
    return String(key || '').replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  }

  function coerceQuantity(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.floor(num);
  }

  function lookupRawQuantity(raw, item) {
    if (!raw || typeof raw !== 'object') return 0;
    const candidates = [
      item.key,
      camelToSnake(item.key),
      item.name,
      item.name && String(item.name).toLowerCase(),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(raw, candidate)) {
        return coerceQuantity(raw[candidate]);
      }
    }
    return 0;
  }

  /**
   * Map quantity bags onto allocation item keys.
   * Without itemList, preserve numeric keys as-is (never wipe to {} on fetch).
   * With itemList, also accept snake_case / Discord option / display-name aliases.
   */
  function normalizeQuantities(raw, itemList) {
    if (!itemList || !itemList.length) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const preserved = {};
      for (const [key, value] of Object.entries(raw)) {
        const aliased = QUANTITY_KEY_ALIASES[String(key).toLowerCase()] || key;
        preserved[aliased] = coerceQuantity(value);
      }
      return preserved;
    }

    const quantities = emptyQuantities(itemList);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return quantities;

    const remapped = {};
    for (const [key, value] of Object.entries(raw)) {
      const aliased = QUANTITY_KEY_ALIASES[String(key).toLowerCase()] || key;
      remapped[aliased] = value;
    }

    for (const item of itemList) {
      quantities[item.key] = Object.prototype.hasOwnProperty.call(remapped, item.key)
        ? coerceQuantity(remapped[item.key])
        : lookupRawQuantity(raw, item);
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
      ? raw.entries.map((entry) => {
          const nested = entry && entry.quantities;
          const hasNested = nested && typeof nested === 'object' && !Array.isArray(nested);
          let quantities;
          if (itemList && itemList.length) {
            const fromNested = normalizeQuantities(hasNested ? nested : {}, itemList);
            const nestedSum = Object.values(fromNested).reduce((sum, n) => sum + n, 0);
            if (nestedSum > 0) {
              quantities = fromNested;
            } else {
              // Legacy / mis-shaped: quantities on the entry root (joint: 2) or only aliases.
              const fromFlat = normalizeQuantities(entry || {}, itemList);
              quantities = Object.values(fromFlat).reduce((sum, n) => sum + n, 0) > 0
                ? fromFlat
                : fromNested;
            }
          } else {
            // No catalog: preserve the nested bag; never treat responsabil/cnp as quantities.
            quantities = normalizeQuantities(hasNested ? nested : {}, null);
          }
          return {
            id: String(entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
            responsabil: String(entry.responsabil || '').trim(),
            cnp: String(entry.cnp || '').trim(),
            telefon: String(entry.telefon || '').trim(),
            quantities,
            taxCollected: Boolean(entry.taxCollected),
            createdAt: entry.createdAt || null,
          };
        })
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

  async function fetchEvidenta(config, fetchImpl, itemList) {
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
    // Always pass itemList when available — normalizeStore without it used to wipe quantities to {}.
    return { data: normalizeStore(payload, itemList), raw: payload };
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
      const remote = await fetchEvidenta(cfg, fetchImpl, itemList);
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
