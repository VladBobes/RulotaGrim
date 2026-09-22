const { parseBucharestDateTime } = require('./datetime');

const ACTION_TYPES = [
  { name: 'Patrula', requiresLocation: true, requiresTitle: false },
  { name: 'Maldive', requiresLocation: false, requiresTitle: false },
  { name: 'Cayo', requiresLocation: false, requiresTitle: false },
  { name: 'Plimbare cu motoarele', requiresLocation: true, requiresTitle: false },
  { name: 'Farm', requiresLocation: true, requiresTitle: false },
  { name: 'Sedinta', requiresLocation: true, requiresTitle: false },
  { name: 'Custom', requiresLocation: true, requiresTitle: true },
];

const BANKS = [
  {
    name: 'Banca Centrala',
    positions: [
      'Hotel',
      'Ambasada',
      'Parc',
      'Noodle',
      'Banca',
      'Spate Banca',
      'Jumper',
      'Hotdog',
      'Gunshop',
      'Principala',
      'Secundara',
      'Laterala',
    ],
  },
  { name: 'Banca Dusty', positions: ['Service', 'Motel', 'Cafe', 'Banca'] },
  {
    name: 'Banca Cartele',
    positions: ['Lifeinvader', 'Residence', 'Hotel', 'Parcare', 'Banca', 'Supraetajata Banca'],
  },
  {
    name: 'Banca Pillbox',
    positions: [
      'Banca',
      'Cladire Banca',
      'Motel',
      'Skate',
      'Vent',
      'Market',
      'Hotel',
      'Principala',
      'Secundara',
    ],
  },
  {
    name: 'Banca Highway',
    positions: ['Magazin', 'Surf', 'Banca', 'Cladire Secundara', 'Guvid', 'Principala', 'Secundara'],
  },
];

const BANCA_BUTTON_PREFIX = 'actiuni:banca:';

function findActionType(tip) {
  const value = String(tip || '').trim();
  return ACTION_TYPES.find(type => type.name === value) || null;
}

function findBank(name) {
  const value = String(name || '').trim();
  return BANKS.find(bank => bank.name === value) || null;
}

function bankPositionNames(action) {
  if (Array.isArray(action?.positionNames) && action.positionNames.length) {
    return action.positionNames;
  }
  return findBank(action?.bankName)?.positions || [];
}

function bancaButtonCustomId(actionId, index) {
  return `${BANCA_BUTTON_PREFIX}${actionId}:${index}`;
}

function parseBancaButtonCustomId(customId) {
  const raw = String(customId || '');
  if (!raw.startsWith(BANCA_BUTTON_PREFIX)) return null;
  const rest = raw.slice(BANCA_BUTTON_PREFIX.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0) return null;
  const actionId = rest.slice(0, lastColon);
  const index = Number(rest.slice(lastColon + 1));
  if (!actionId || !Number.isInteger(index) || index < 0) return null;
  return { actionId, index };
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

function validateBanca(input = {}) {
  const bank = findBank(input.banca);
  if (!bank) {
    return { ok: false, code: 'banca', message: 'Bancă necunoscută.' };
  }

  const parsed = parseBucharestDateTime(input.data, input.ora);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    action: {
      tip: 'banca',
      bankName: bank.name,
      titlu: bank.name,
      positionNames: [...bank.positions],
      at: parsed.date.toISOString(),
      dateLabel: parsed.dateLabel,
      dateTimeLabel: parsed.dateTimeLabel,
    },
  };
}

function actionChoiceLabel(action) {
  const title =
    action?.tip === 'banca'
      ? action.bankName || action.titlu || 'Banca'
      : action?.titlu || action?.tip || 'Acțiune';
  const dateLabel = action?.dateLabel || '';
  return dateLabel ? `${title} ${dateLabel}` : title;
}

module.exports = {
  ACTION_TYPES,
  BANKS,
  BANCA_BUTTON_PREFIX,
  findActionType,
  findBank,
  bankPositionNames,
  bancaButtonCustomId,
  parseBancaButtonCustomId,
  validatePlanifica,
  validateBanca,
  actionChoiceLabel,
};
