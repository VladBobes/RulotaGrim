const fs = require('fs');
const path = require('path');

function emptyResults() {
  return {};
}

function outcomeValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.result;
  return null;
}

function formatBankResults(outcomes = {}) {
  let castigate = 0;
  let pierdute = 0;
  for (const value of Object.values(outcomes)) {
    const result = outcomeValue(value);
    if (result === 'luata') castigate += 1;
    else if (result === 'pierduta') pierdute += 1;
  }
  return `Castigate: ${castigate} | Pierdute: ${pierdute}`;
}

function createBankResultsStore(filePath) {
  function read() {
    if (!fs.existsSync(filePath)) return emptyResults();
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyResults();
      if (data.outcomes && typeof data.outcomes === 'object' && !Array.isArray(data.outcomes)) {
        return { ...data.outcomes };
      }
      return { ...data };
    } catch {
      return emptyResults();
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  function upsert(eventId, result) {
    const id = String(eventId || '').trim();
    if (!id) return { ok: false, code: 'event', message: 'Eveniment invalid.' };
    const outcome = String(result || '').trim();
    if (outcome !== 'luata' && outcome !== 'pierduta') {
      return { ok: false, code: 'result', message: 'Rezultat invalid.' };
    }
    const data = read();
    data[id] = outcome;
    write(data);
    return { ok: true, outcomes: read() };
  }

  function getState() {
    return read();
  }

  function formatTotals() {
    return formatBankResults(read());
  }

  return {
    upsert,
    getState,
    formatTotals,
    filePath,
  };
}

module.exports = {
  formatBankResults,
  createBankResultsStore,
};
