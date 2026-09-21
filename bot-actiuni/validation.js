const { parseBucharestDateTime } = require('./datetime');

const ACTION_TYPES = [
  { name: 'Patrula', requiresLocation: true, requiresTitle: false },
  { name: 'Maldive', requiresLocation: false, requiresTitle: false },
  { name: 'Cayo', requiresLocation: false, requiresTitle: false },
  { name: 'Plimbare cu motoarele', requiresLocation: true, requiresTitle: false },
  { name: 'Farm', requiresLocation: false, requiresTitle: false },
  { name: 'Sedinta', requiresLocation: false, requiresTitle: false },
  { name: 'Custom', requiresLocation: true, requiresTitle: true },
];

function findActionType(tip) {
  const value = String(tip || '').trim();
  return ACTION_TYPES.find(type => type.name === value) || null;
}

function validatePlanifica(input = {}) {
  const type = findActionType(input.tip);
  if (!type) {
    return { ok: false, code: 'tip', message: 'Tip de acțiune necunoscut.' };
  }

  const descriere = String(input.descriere || '').trim();
  if (!descriere) {
    return { ok: false, code: 'descriere', message: 'Descrierea este obligatorie.' };
  }

  const titlu = String(input.titlu || '').trim();
  if (type.requiresTitle && !titlu) {
    return { ok: false, code: 'titlu', message: 'Titlul este obligatoriu pentru acțiunile Custom.' };
  }

  const locatie = String(input.locatie || '').trim();
  if (type.requiresLocation && !locatie) {
    return { ok: false, code: 'locatie', message: 'Locația este obligatorie pentru acest tip de acțiune.' };
  }

  const parsed = parseBucharestDateTime(input.data, input.ora);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    action: {
      tip: type.name,
      titlu: type.requiresTitle ? titlu : type.name,
      descriere,
      locatie: type.requiresLocation ? locatie : null,
      at: parsed.date.toISOString(),
      dateLabel: parsed.dateLabel,
      dateTimeLabel: parsed.dateTimeLabel,
    },
  };
}

function actionChoiceLabel(action) {
  const title = action?.titlu || action?.tip || 'Acțiune';
  const dateLabel = action?.dateLabel || '';
  return dateLabel ? `${title} ${dateLabel}` : title;
}

module.exports = {
  ACTION_TYPES,
  findActionType,
  validatePlanifica,
  actionChoiceLabel,
};
