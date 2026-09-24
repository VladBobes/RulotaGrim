const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validatePlanifica,
  validateBanca,
  actionChoiceLabel,
  BANKS,
  bancaButtonCustomId,
  bancaResultButtonCustomId,
  parseBancaResultButtonCustomId,
  bancaResultLabel,
} = require('../bot-actiuni/validation');
const { parseBucharestDateTime, formatBucharest, isExpired, isClosed } = require('../bot-actiuni/datetime');
const {
  applyPresent,
  applyPosition,
  applyResult,
  applyAbsent,
  formatListaActiuni,
  formatAttendanceSections,
  formatPositionSections,
  formatPositionTotal,
  positionTotal,
  groupPositions,
  chunkText,
} = require('../bot-actiuni/attendance');
const { createStore } = require('../bot-actiuni/store');
const { createBankResultsStore, formatBankResults } = require('../bot-actiuni/bank-results');
const { authorizeCommand, authorizeStaff } = require('../bot-actiuni/roles');

function validBase(overrides = {}) {
  return {
    tip: 'Farm',
    descriere: 'Farm de seară',
    data: '23.09.2026',
    ora: '20:00',
    ...overrides,
  };
}

test('Custom fără titlu este respins; Patrula/Farm/Sedinta fără locație sunt respinse; Maldive fără locație este acceptată', () => {
  const custom = validatePlanifica(validBase({ tip: 'Custom', locatie: 'Lac' }));
  assert.equal(custom.ok, false);
  assert.equal(custom.code, 'titlu');
  assert.match(custom.message, /Titlul este obligatoriu/);

  const customOk = validatePlanifica(validBase({ tip: 'Custom', titlu: 'Pescuit', locatie: 'Lac' }));
  assert.equal(customOk.ok, true);
  assert.equal(customOk.action.titlu, 'Pescuit');
  assert.equal(customOk.action.locatie, 'Lac');
  assert.equal(customOk.action.tip, 'Custom');

  const patrula = validatePlanifica(validBase({ tip: 'Patrula' }));
  assert.equal(patrula.ok, false);
  assert.equal(patrula.code, 'locatie');

  const maldive = validatePlanifica(validBase({ tip: 'Maldive', locatie: 'ignorată' }));
  assert.equal(maldive.ok, true);
  assert.equal(maldive.action.titlu, 'Maldive');
  assert.equal(maldive.action.locatie, null);

  const farmWithout = validatePlanifica(validBase({ tip: 'Farm' }));
  assert.equal(farmWithout.ok, false);
  assert.equal(farmWithout.code, 'locatie');

  const sedintaWithout = validatePlanifica(validBase({ tip: 'Sedinta' }));
  assert.equal(sedintaWithout.ok, false);
  assert.equal(sedintaWithout.code, 'locatie');

  const farmOk = validatePlanifica(validBase({ tip: 'Farm', locatie: 'Paleto' }));
  assert.equal(farmOk.ok, true);
  assert.equal(farmOk.action.tip, 'Farm');
  assert.equal(farmOk.action.titlu, 'Farm');
  assert.equal(farmOk.action.locatie, 'Paleto');
});

test('parsează data și ora în Europe/Bucharest', () => {
  const summer = parseBucharestDateTime('23.09.2026', '20:00');
  assert.equal(summer.ok, true);
  assert.equal(summer.date.toISOString(), '2026-09-23T17:00:00.000Z');
  assert.equal(summer.dateLabel, '23.09.2026');
  assert.equal(summer.dateTimeLabel, '23.09.2026 20:00');

  const winter = parseBucharestDateTime('15.01.2026', '12:00');
  assert.equal(winter.ok, true);
  assert.equal(winter.date.toISOString(), '2026-01-15T10:00:00.000Z');
  assert.equal(formatBucharest(winter.date), '15.01.2026 12:00');

  assert.equal(parseBucharestDateTime('32.01.2026', '12:00').ok, false);
  assert.equal(parseBucharestDateTime('31.02.2026', '12:00').ok, false);
  assert.equal(parseBucharestDateTime('23.09.2026', '24:00').ok, false);
  assert.equal(parseBucharestDateTime('23-09-2026', '20:00').code, 'date_format');
  assert.equal(parseBucharestDateTime('23.09.2026', '8:00').code, 'time_format');

  const gap = parseBucharestDateTime('29.03.2026', '03:30');
  assert.equal(gap.ok, false);
  assert.equal(gap.code, 'tz_gap');
});

test('prezența: un vot, al doilea ignorat, absent mută utilizatorul', () => {
  const action = {
    id: 'a1',
    tip: 'Cayo',
    titlu: 'Cayo',
    dateLabel: '23.09.2026',
    attendees: {},
    absences: {},
  };

  const first = applyPresent(action, 'u1', 'Vlad');
  assert.equal(first.ok, true);
  assert.equal(first.action.attendees.u1.displayName, 'Vlad');
  assert.equal(Object.keys(first.action.attendees).length, 1);

  const second = applyPresent(first.action, 'u1', 'Vlad');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'already');
  assert.equal(second.message, 'Ești deja înscris la acțiunea asta.');
  assert.equal(Object.keys(second.action.attendees).length, 1);

  const absent = applyAbsent(first.action, 'u1', 'Vlad');
  assert.equal(absent.ok, true);
  assert.equal(absent.action.attendees.u1, undefined);
  assert.equal(absent.action.absences.u1.displayName, 'Vlad');

  const afterAbsent = applyPresent(absent.action, 'u1', 'Vlad');
  assert.equal(afterAbsent.ok, false);
  assert.equal(afterAbsent.code, 'marked_absent');
  assert.equal(afterAbsent.message, 'Ai fost marcat absent la acțiunea asta.');

  const never = applyAbsent(action, 'u2', 'Madalin');
  assert.equal(never.ok, false);
  assert.equal(never.code, 'never_present');

  const already = applyAbsent(absent.action, 'u1', 'Vlad');
  assert.equal(already.ok, false);
  assert.equal(already.code, 'already_absent');

  const expired = applyPresent(null, 'u1', 'Vlad');
  assert.equal(expired.ok, false);
  assert.equal(expired.message, 'Acțiunea nu mai este activă.');
});

test('store persistă acțiuni, refuză votul dublu și expiră după reset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actiuni-'));
  const store = createStore(path.join(dir, 'actiuni.json'));
  const created = store.createAction({
    tip: 'Cayo',
    titlu: 'Cayo',
    descriere: 'Heist',
    at: '2026-12-31T18:00:00.000Z',
    dateLabel: '31.12.2026',
    dateTimeLabel: '31.12.2026 20:00',
  });
  store.setMessageRef(created.id, 'chan', 'msg');

  const first = store.markPresent(created.id, 'u1', 'Vlad');
  assert.equal(first.ok, true);
  const second = store.markPresent(created.id, 'u1', 'Vlad');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'already');

  const moved = store.markAbsent(created.id, 'u1', 'Vlad');
  assert.equal(moved.ok, true);
  assert.equal(store.getAction(created.id).absences.u1.displayName, 'Vlad');
  assert.equal(store.getAction(created.id).attendees.u1, undefined);

  const resetAt = new Date('2026-09-28T17:01:00.000Z');
  const reset = store.reset(resetAt);
  assert.equal(reset.lastResetAt, resetAt.toISOString());
  assert.equal(store.getAction(created.id), null);
  assert.equal(store.markPresent(created.id, 'u1', 'Vlad').message, 'Acțiunea nu mai este activă.');
  assert.equal(store.getState().actions.length, 0);
});

test('formatterul de listă păstrează intervalul, numără doar prezenții și pune absențele la final', () => {
  const state = {
    lastResetAt: '2026-09-22T16:59:00.000Z',
    actions: [
      {
        tip: 'Cayo',
        titlu: 'Cayo',
        dateLabel: '23.09.2026',
        at: '2026-09-23T17:00:00.000Z',
        attendees: { vlad: { displayName: 'Vlad' } },
        absences: {},
      },
      {
        tip: 'Maldive',
        titlu: 'Maldive',
        dateLabel: '24.09.2026',
        at: '2026-09-24T17:00:00.000Z',
        attendees: { madalin: { displayName: 'Madalin' } },
        absences: { vlad: { displayName: 'Vlad' } },
      },
      {
        tip: 'Patrula',
        titlu: 'Patrula',
        dateLabel: '24.09.2026',
        at: '2026-09-24T18:00:00.000Z',
        attendees: { vlad: { displayName: 'Vlad' } },
        absences: {},
      },
      {
        tip: 'Custom',
        titlu: 'Pescuit',
        dateLabel: '28.09.2026',
        at: '2026-09-28T16:00:00.000Z',
        attendees: { vlad: { displayName: 'Vlad' }, madalin: { displayName: 'Madalin' } },
        absences: {},
      },
    ],
  };

  const text = formatListaActiuni(state, new Date('2026-09-28T17:01:00.000Z'));
  assert.equal(
    text,
    [
      'În intervalul 22.09.2026 19:59 - 28.09.2026 20:01:',
      'Vlad - 3 acțiuni (Cayo 23.09.2026, Patrula 24.09.2026, Pescuit 28.09.2026), 1 absență (Maldive 24.09.2026)',
      'Madalin - 2 acțiuni (Maldive 24.09.2026, Pescuit 28.09.2026)',
    ].join('\n')
  );
  assert.doesNotMatch(text, /\bCustom\b/);
  assert.equal(actionChoiceLabel(state.actions[3]), 'Pescuit 28.09.2026');

  const empty = formatListaActiuni({ lastResetAt: '2026-09-22T16:59:00.000Z', actions: [] }, new Date('2026-09-28T17:01:00.000Z'));
  assert.match(empty, /Nimeni nu are prezență în interval/);
  assert.match(empty, /În intervalul 22.09.2026 19:59 - 28.09.2026 20:01:/);

  const noReset = formatListaActiuni({ lastResetAt: null, actions: [] }, new Date('2026-09-28T17:01:00.000Z'));
  assert.match(noReset, /fără reset anterior/);
});

test('secțiunile de prezență rămân pe mesaj și textul lung se taie la 2000 de caractere', () => {
  const empty = formatAttendanceSections({ attendees: {}, absences: {} });
  assert.equal(empty, 'Prezenți (0):\nnimeni încă');

  const withAbsent = formatAttendanceSections({
    attendees: { a: { displayName: 'Vlad' } },
    absences: { b: { displayName: 'Madalin' } },
  });
  assert.equal(withAbsent, 'Prezenți (1):\nVlad\n\nAbsenți (1):\nMadalin');

  const long = `${'x'.repeat(1900)}\n${'y'.repeat(1900)}`;
  const chunks = chunkText(long, 2000);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every(part => part.length <= 2000));
});

test('verificarea de rol refuză configurația goală cu același mesaj', () => {
  const member = { roles: ['111'] };
  const empty = authorizeCommand('planifica', member, {});
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'unconfigured');
  assert.equal(empty.message, 'Lista de roluri nu este configurată pe bot.');
  assert.equal(authorizeCommand('lista_actiuni', member, { STAFF_ROLE_IDS: '  , ' }).code, 'unconfigured');
  assert.equal(authorizeCommand('absent', member, { STAFF_ROLE_IDS: '999' }).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeCommand('banca', member, { STAFF_ROLE_IDS: '999' }).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeCommand('banca', { roles: ['999'] }, { STAFF_ROLE_IDS: '999' }).ok, true);
  assert.equal(authorizeCommand('reset_actiuni', { roles: ['999'] }, { STAFF_ROLE_IDS: '999' }).ok, true);
  assert.equal(authorizeCommand('rezultate-banci', member, { STAFF_ROLE_IDS: '999' }).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeCommand('rezultate-banci', { roles: ['999'] }, { STAFF_ROLE_IDS: '999' }).ok, true);
  assert.equal(authorizeCommand('rezultate-banci', member, {}).message, 'Lista de roluri nu este configurată pe bot.');
  assert.equal(authorizeCommand('prezent', member, {}).ok, true);
});

test('banca: mută utilizatorul între poziții, permite apăsări multiple și blochează după absent', () => {
  const action = {
    id: 'b1',
    tip: 'banca',
    bankName: 'Banca Centrala',
    titlu: 'Banca Centrala',
    dateLabel: '22.09.2026',
    positionNames: BANKS.find(bank => bank.name === 'Banca Centrala').positions,
    positions: {},
    absences: {},
  };

  const hotel = applyPosition(action, 'u1', 'Vlad', 'Hotel');
  assert.equal(hotel.ok, true);
  assert.equal(hotel.action.positions.u1.name, 'Vlad');
  assert.equal(hotel.action.positions.u1.position, 'Hotel');
  assert.equal(Object.keys(hotel.action.positions).length, 1);

  const banca = applyPosition(hotel.action, 'u1', 'Vlad', 'In banca');
  assert.equal(banca.ok, true);
  assert.equal(banca.action.positions.u1.position, 'In banca');
  assert.equal(Object.keys(banca.action.positions).length, 1);

  const again = applyPosition(banca.action, 'u1', 'Vlad', 'Pe banca');
  assert.equal(again.ok, true);
  assert.equal(again.action.positions.u1.position, 'Pe banca');
  assert.equal(Object.keys(again.action.positions).length, 1);

  const jumper = applyPosition(again.action, 'u1', 'Vlad', 'Jumper');
  assert.equal(jumper.ok, true);
  assert.equal(jumper.action.positions.u1.position, 'Jumper');

  const absent = applyAbsent(jumper.action, 'u1', 'Vlad');
  assert.equal(absent.ok, true);
  assert.equal(absent.action.positions.u1, undefined);
  assert.equal(absent.action.absences.u1.displayName, 'Vlad');

  const blocked = applyPosition(absent.action, 'u1', 'Vlad', 'Hotel');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'marked_absent');
  assert.equal(blocked.message, 'Ai fost marcat absent la acțiunea asta.');
  assert.equal(blocked.action.positions.u1, undefined);
  assert.equal(blocked.action.absences.u1.displayName, 'Vlad');

  const never = applyAbsent(action, 'u2', 'Madalin');
  assert.equal(never.ok, false);
  assert.equal(never.code, 'never_present');

  const already = applyAbsent(absent.action, 'u1', 'Vlad');
  assert.equal(already.ok, false);
  assert.equal(already.code, 'already_absent');
});

test('banca: validare, customId scurt și lista pune banca lângă Cayo', () => {
  const unknown = validateBanca({ banca: 'Banca Inexistentă', data: '22.09.2026', ora: '21:00' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'banca');

  const badDate = validateBanca({ banca: 'Banca Dusty', data: '32.09.2026', ora: '21:00' });
  assert.equal(badDate.ok, false);

  const ok = validateBanca({ banca: 'Banca Dusty', data: '22.09.2026', ora: '21:00' });
  assert.equal(ok.ok, true);
  assert.equal(ok.action.tip, 'banca');
  assert.equal(ok.action.bankName, 'Banca Dusty');
  assert.equal(ok.action.titlu, 'Banca Dusty');
  assert.equal(ok.action.dateTimeLabel, '22.09.2026 21:00');
  assert.deepEqual(ok.action.positionNames, ['Service', 'Motel', 'Cafe', 'In banca', 'Pe banca', 'Patrula']);
  assert.equal(ok.action.descriere, undefined);
  assert.equal(ok.action.locatie, undefined);

  const longest = bancaButtonCustomId('123e4567-e89b-12d3-a456-426614174000', 11);
  assert.ok(longest.length <= 100);
  assert.match(longest, /^actiuni:banca:/);

  const resultId = bancaResultButtonCustomId('123e4567-e89b-12d3-a456-426614174000', 'pierduta');
  assert.ok(resultId.length <= 100);
  assert.match(resultId, /^actiuni:banca-rezultat:/);
  assert.deepEqual(parseBancaResultButtonCustomId(resultId), {
    actionId: '123e4567-e89b-12d3-a456-426614174000',
    result: 'pierduta',
  });

  const sections = formatPositionSections({
    tip: 'banca',
    bankName: 'Banca Dusty',
    positionNames: ['Service', 'Motel', 'Cafe', 'In banca', 'Pe banca'],
    positions: { u1: { name: 'Vlad', position: 'Service' } },
    absences: { u2: { displayName: 'Madalin' } },
  });
  assert.match(sections, /Total: 1/);
  assert.match(sections, /Service:\nVlad/);
  assert.match(sections, /Motel:\n—/);
  assert.match(sections, /Cafe:\n—/);
  assert.match(sections, /In banca:\n—/);
  assert.match(sections, /Pe banca:\n—/);
  assert.match(sections, /Absenți \(1\):\nMadalin/);

  const state = {
    lastResetAt: '2026-09-21T16:59:00.000Z',
    actions: [
      {
        tip: 'Cayo',
        titlu: 'Cayo',
        dateLabel: '23.09.2026',
        at: '2026-09-23T17:00:00.000Z',
        attendees: { vlad: { displayName: 'Vlad' } },
        absences: {},
      },
      {
        tip: 'banca',
        bankName: 'Banca Dusty',
        titlu: 'Banca Dusty',
        dateLabel: '22.09.2026',
        at: '2026-09-22T18:00:00.000Z',
        positions: { vlad: { name: 'Vlad', position: 'Service' } },
        absences: { madalin: { displayName: 'Madalin' } },
      },
    ],
  };

  const text = formatListaActiuni(state, new Date('2026-09-28T17:01:00.000Z'));
  assert.equal(
    text,
    [
      'În intervalul 21.09.2026 19:59 - 28.09.2026 20:01:',
      'Vlad - 1 acțiune (Cayo 23.09.2026)',
    ].join('\n')
  );
  assert.doesNotMatch(text, /Banca Dusty/);
  assert.doesNotMatch(text, /Madalin/);
  assert.equal(actionChoiceLabel(state.actions[1]), 'Banca Dusty 22.09.2026');
  assert.equal(actionChoiceLabel({ tip: 'banca', bankName: 'Banca Centrala', dateLabel: '22.09.2026' }), 'Banca Centrala 22.09.2026');
});

test('store păstrează acțiunile regulate și băncile până la reset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actiuni-'));
  const store = createStore(path.join(dir, 'actiuni.json'));
  const cayo = store.createAction({
    tip: 'Cayo',
    titlu: 'Cayo',
    descriere: 'Heist',
    at: '2026-12-31T18:00:00.000Z',
    dateLabel: '31.12.2026',
    dateTimeLabel: '31.12.2026 20:00',
  });
  const bank = store.createAction({
    tip: 'banca',
    bankName: 'Banca Centrala',
    titlu: 'Banca Centrala',
    positionNames: BANKS.find(item => item.name === 'Banca Centrala').positions,
    at: '2026-12-31T19:00:00.000Z',
    dateLabel: '31.12.2026',
    dateTimeLabel: '31.12.2026 21:00',
  });

  assert.equal(store.markPresent(cayo.id, 'u1', 'Vlad').ok, true);
  assert.equal(store.markPosition(bank.id, 'u1', 'Vlad', 'Hotel').ok, true);
  assert.equal(store.markPosition(bank.id, 'u1', 'Vlad', 'In banca').ok, true);
  assert.equal(store.getAction(bank.id).positions.u1.position, 'In banca');
  assert.equal(store.getAction(cayo.id).attendees.u1.displayName, 'Vlad');

  const moved = store.markAbsent(bank.id, 'u1', 'Vlad');
  assert.equal(moved.ok, true);
  assert.equal(store.getAction(bank.id).positions.u1, undefined);
  assert.equal(store.markPosition(bank.id, 'u1', 'Vlad', 'Hotel').code, 'marked_absent');
  assert.equal(store.markResult(bank.id, 'luata').ok, true);
  assert.equal(store.getAction(bank.id).result, 'luata');
  assert.equal(store.markResult(bank.id, 'pierduta').ok, true);
  assert.equal(store.getAction(bank.id).result, 'pierduta');

  store.reset(new Date('2026-09-28T17:01:00.000Z'));
  assert.equal(store.getState().actions.length, 0);
  assert.equal(store.getAction(cayo.id), null);
  assert.equal(store.getAction(bank.id), null);
});

test('listele de bănci înlocuiesc Banca cu In banca și Pe banca', () => {
  const expected = {
    'Banca Centrala': [
      'Hotel',
      'Ambasada',
      'Parc',
      'Noodle',
      'In banca',
      'Pe banca',
      'Spate Banca',
      'Jumper',
      'Hotdog',
      'Gunshop',
      'Principala',
      'Secundara',
      'Laterala',
      'Patrula',
    ],
    'Banca Dusty': ['Service', 'Motel', 'Cafe', 'In banca', 'Pe banca', 'Patrula'],
    'Banca Cartele': [
      'Lifeinvader',
      'Residence',
      'Hotel',
      'Parcare',
      'In banca',
      'Pe banca',
      'Supraetajata Banca',
      'Patrula',
    ],
    'Banca Pillbox': [
      'In banca',
      'Pe banca',
      'Cladire Banca',
      'Motel',
      'Skate',
      'Vent',
      'Market',
      'Hotel',
      'Principala',
      'Secundara',
      'Patrula',
    ],
    'Banca Highway': [
      'Magazin',
      'Surf',
      'In banca',
      'Pe banca',
      'Cladire Secundara',
      'Guvid',
      'Principala',
      'Secundara',
      'Patrula',
    ],
  };

  for (const bank of BANKS) {
    assert.deepEqual(bank.positions, expected[bank.name]);
    assert.ok(bank.positions.includes('In banca'));
    assert.ok(bank.positions.includes('Pe banca'));
    assert.ok(bank.positions.includes('Patrula'));
    assert.equal(bank.positions.at(-1), 'Patrula');
    assert.ok(!bank.positions.includes('Banca'));
    assert.ok(bank.positions.includes('In banca') && bank.positions.includes('Pe banca'));
  }

  const grouped = groupPositions({
    tip: 'banca',
    bankName: 'Banca Dusty',
    positionNames: expected['Banca Dusty'],
    positions: { u1: { name: 'Vlad', position: 'In banca' } },
  });
  assert.deepEqual(grouped.positions, expected['Banca Dusty']);
  assert.deepEqual(grouped.groups['In banca'], ['Vlad']);
  assert.deepEqual(grouped.groups['Pe banca'], []);
  assert.equal(grouped.groups.Banca, undefined);
});

test('evenimentele vechi cu poziția Banca rămân afișate ca Banca', () => {
  const sections = formatPositionSections({
    tip: 'banca',
    bankName: 'Banca Dusty',
    positionNames: ['Service', 'Motel', 'Cafe', 'Banca'],
    positions: { u1: { name: 'Vlad', position: 'Banca' } },
    absences: {},
  });
  assert.match(sections, /Total: 1/);
  assert.match(sections, /Banca:\nVlad/);
  assert.doesNotMatch(sections, /In banca/);
  assert.doesNotMatch(sections, /Pe banca/);

  const stay = applyPosition(
    {
      tip: 'banca',
      positionNames: ['Service', 'Motel', 'Cafe', 'Banca'],
      positions: { u1: { name: 'Vlad', position: 'Banca' } },
      absences: {},
      at: '2026-12-31T18:00:00.000Z',
    },
    'u1',
    'Vlad',
    'Banca'
  );
  assert.equal(stay.ok, true);
  assert.equal(stay.action.positions.u1.position, 'Banca');
});

test('isExpired: ieri în București e expirat, azi și mâine nu', () => {
  const now = new Date('2026-09-23T17:00:00.000Z');
  const yesterday = parseBucharestDateTime('22.09.2026', '20:00');
  const today = parseBucharestDateTime('23.09.2026', '20:00');
  const tomorrow = parseBucharestDateTime('24.09.2026', '20:00');

  assert.equal(yesterday.ok, true);
  assert.equal(isExpired(yesterday.date, now), true);
  assert.equal(isExpired(yesterday.date.toISOString(), now), true);
  assert.equal(isExpired(today.date, now), false);
  assert.equal(isExpired(tomorrow.date, now), false);

  const lateSameDay = new Date('2026-09-22T20:59:59.999Z');
  assert.equal(isExpired(parseBucharestDateTime('22.09.2026', '10:00').date, lateSameDay), false);

  const justAfterMidnight = new Date('2026-09-22T21:00:00.000Z');
  assert.equal(isExpired(parseBucharestDateTime('22.09.2026', '23:00').date, justAfterMidnight), true);
});

test('prezent și poziție sunt respinse după expirare; absent și rezultat rămân permise', () => {
  const expiredAt = parseBucharestDateTime('22.09.2026', '20:00').date.toISOString();
  const now = new Date('2026-09-23T00:00:00.000Z');

  const action = {
    id: 'a-exp',
    tip: 'Cayo',
    titlu: 'Cayo',
    at: expiredAt,
    attendees: { u1: { displayName: 'Vlad' } },
    absences: {},
  };
  const present = applyPresent(action, 'u2', 'Madalin', undefined, now);
  assert.equal(present.ok, false);
  assert.equal(present.code, 'expired');
  assert.equal(present.message, 'Acțiunea s-a încheiat. Nu mai poți vota prezent.');
  assert.equal(present.action.attendees.u2, undefined);

  const bank = {
    id: 'b-exp',
    tip: 'banca',
    bankName: 'Banca Dusty',
    at: expiredAt,
    positionNames: BANKS.find(item => item.name === 'Banca Dusty').positions,
    positions: { u1: { name: 'Vlad', position: 'In banca' } },
    absences: {},
  };
  const position = applyPosition(bank, 'u2', 'Madalin', 'Pe banca', undefined, now);
  assert.equal(position.ok, false);
  assert.equal(position.code, 'expired');
  assert.equal(position.message, 'Acțiunea s-a încheiat. Nu mai poți schimba poziția.');
  assert.equal(position.action.positions.u2, undefined);
  assert.equal(position.action.positions.u1.position, 'In banca');

  const absent = applyAbsent(bank, 'u1', 'Vlad');
  assert.equal(absent.ok, true);
  assert.equal(absent.action.positions.u1, undefined);
  assert.equal(absent.action.absences.u1.displayName, 'Vlad');

  const lateResult = applyResult({ ...bank, at: expiredAt }, 'luata');
  assert.equal(lateResult.ok, true);
  assert.equal(lateResult.action.result, 'luata');
  assert.equal(bancaResultLabel(lateResult.action.result), 'Banca luată');
});

test('rezultatul de bancă: ultima apăsare rămâne și butoanele cer staff', () => {
  const action = {
    id: 'b-res',
    tip: 'banca',
    bankName: 'Banca Dusty',
    positionNames: BANKS.find(item => item.name === 'Banca Dusty').positions,
    positions: {},
    absences: {},
    at: '2026-12-31T18:00:00.000Z',
  };

  const taken = applyResult(action, 'luata');
  assert.equal(taken.ok, true);
  assert.equal(taken.action.result, 'luata');
  assert.equal(bancaResultLabel(taken.action.result), 'Banca luată');

  const lost = applyResult(taken.action, 'pierduta');
  assert.equal(lost.ok, true);
  assert.equal(lost.action.result, 'pierduta');
  assert.equal(bancaResultLabel(lost.action.result), 'Banca pierdută');

  const again = applyResult(lost.action, 'luata');
  assert.equal(again.ok, true);
  assert.equal(again.action.result, 'luata');

  const invalid = applyResult(action, 'altceva');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.action.result, undefined);

  const staff = { roles: ['999'] };
  const outsider = { roles: ['111'] };
  const env = { STAFF_ROLE_IDS: '999' };
  assert.equal(authorizeStaff(staff, env).ok, true);
  assert.equal(authorizeStaff(outsider, env).ok, false);
  assert.equal(authorizeStaff(outsider, env).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeCommand('banca', outsider, env).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeStaff(outsider, {}).message, 'Lista de roluri nu este configurată pe bot.');
});

test('isClosed: banca cu rezultat se închide imediat; planifica doar la final de zi', () => {
  const now = new Date('2026-09-23T17:00:00.000Z');
  const today = parseBucharestDateTime('23.09.2026', '20:00').date.toISOString();
  const yesterday = parseBucharestDateTime('22.09.2026', '20:00').date.toISOString();

  assert.equal(isClosed({ tip: 'Cayo', at: today }, now), false);
  assert.equal(isClosed({ tip: 'Cayo', at: yesterday }, now), true);
  assert.equal(isClosed({ tip: 'banca', at: today }, now), false);
  assert.equal(isClosed({ tip: 'banca', at: today, result: 'luata' }, now), true);
  assert.equal(isClosed({ tip: 'banca', at: today, result: 'pierduta' }, now), true);
  assert.equal(isClosed({ tip: 'banca', at: yesterday }, now), true);
  assert.equal(isClosed(null, now), false);
});

test('rezultatul de bancă închide votul de poziție; expirarea închide planifica; absent rămâne permis', () => {
  const today = parseBucharestDateTime('23.09.2026', '20:00').date.toISOString();
  const now = new Date('2026-09-23T17:30:00.000Z');

  const planifica = {
    id: 'p-open',
    tip: 'Cayo',
    titlu: 'Cayo',
    at: today,
    attendees: { u1: { displayName: 'Vlad' } },
    absences: {},
  };
  const stillOpen = applyPresent(planifica, 'u2', 'Madalin', undefined, now);
  assert.equal(stillOpen.ok, true);
  assert.equal(stillOpen.action.attendees.u2.displayName, 'Madalin');

  const bank = {
    id: 'b-close',
    tip: 'banca',
    bankName: 'Banca Dusty',
    at: today,
    positionNames: BANKS.find(item => item.name === 'Banca Dusty').positions,
    positions: { u1: { name: 'Vlad', position: 'In banca' } },
    absences: {},
  };
  const openPos = applyPosition(bank, 'u2', 'Madalin', 'Patrula', undefined, now);
  assert.equal(openPos.ok, true);
  assert.equal(openPos.action.positions.u2.position, 'Patrula');
  assert.equal(positionTotal(openPos.action), 2);
  assert.equal(formatPositionTotal(openPos.action), 'Total: 2');

  const closed = applyResult(openPos.action, 'luata');
  assert.equal(closed.ok, true);
  assert.equal(isClosed(closed.action, now), true);

  const blocked = applyPosition(closed.action, 'u3', 'Alex', 'Pe banca', undefined, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'expired');
  assert.equal(blocked.message, 'Acțiunea s-a încheiat. Nu mai poți schimba poziția.');
  assert.equal(blocked.action.positions.u3, undefined);
  assert.equal(positionTotal(blocked.action), 2);

  const switched = applyResult(closed.action, 'pierduta');
  assert.equal(switched.ok, true);
  assert.equal(switched.action.result, 'pierduta');
  const stillBlocked = applyPosition(switched.action, 'u3', 'Alex', 'Pe banca', undefined, now);
  assert.equal(stillBlocked.ok, false);
  assert.equal(stillBlocked.code, 'expired');
  assert.equal(stillBlocked.message, 'Acțiunea s-a încheiat. Nu mai poți schimba poziția.');

  const absent = applyAbsent(closed.action, 'u1', 'Vlad');
  assert.equal(absent.ok, true);
  assert.equal(absent.action.positions.u1, undefined);
  assert.equal(absent.action.absences.u1.displayName, 'Vlad');
  assert.equal(positionTotal(absent.action), 1);
  assert.equal(formatPositionTotal(absent.action), 'Total: 1');

  const nextDay = new Date('2026-09-23T21:00:00.000Z');
  const expiredPlanifica = applyPresent(planifica, 'u3', 'Alex', undefined, nextDay);
  assert.equal(expiredPlanifica.ok, false);
  assert.equal(expiredPlanifica.code, 'expired');
  assert.equal(expiredPlanifica.message, 'Acțiunea s-a încheiat. Nu mai poți vota prezent.');
});

test('istoricul rezultate-banci persistă după reset_actiuni și ultima apăsare înlocuiește scorul', () => {
  assert.equal(formatBankResults({}), 'Castigate: 0 | Pierdute: 0');
  assert.equal(formatBankResults(), 'Castigate: 0 | Pierdute: 0');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actiuni-'));
  const store = createStore(path.join(dir, 'actiuni.json'));
  const results = createBankResultsStore(path.join(dir, 'bank-results.json'));

  assert.equal(results.formatTotals(), 'Castigate: 0 | Pierdute: 0');

  const win = store.createAction({
    tip: 'banca',
    bankName: 'Banca Dusty',
    titlu: 'Banca Dusty',
    positionNames: BANKS.find(item => item.name === 'Banca Dusty').positions,
    at: '2026-12-31T19:00:00.000Z',
    dateLabel: '31.12.2026',
    dateTimeLabel: '31.12.2026 21:00',
  });
  const loss = store.createAction({
    tip: 'banca',
    bankName: 'Banca Highway',
    titlu: 'Banca Highway',
    positionNames: BANKS.find(item => item.name === 'Banca Highway').positions,
    at: '2026-12-31T20:00:00.000Z',
    dateLabel: '31.12.2026',
    dateTimeLabel: '31.12.2026 22:00',
  });

  assert.equal(store.markResult(win.id, 'luata').ok, true);
  assert.equal(results.upsert(win.id, 'luata').ok, true);
  assert.equal(store.markResult(loss.id, 'pierduta').ok, true);
  assert.equal(results.upsert(loss.id, 'pierduta').ok, true);
  assert.equal(results.formatTotals(), 'Castigate: 1 | Pierdute: 1');

  store.reset(new Date('2026-09-28T17:01:00.000Z'));
  assert.equal(store.getState().actions.length, 0);
  assert.equal(store.getAction(win.id), null);
  assert.equal(results.formatTotals(), 'Castigate: 1 | Pierdute: 1');
  assert.equal(results.getState()[win.id], 'luata');
  assert.equal(results.getState()[loss.id], 'pierduta');

  const switched = createBankResultsStore(path.join(dir, 'switch.json'));
  assert.equal(switched.upsert('e1', 'luata').ok, true);
  assert.equal(switched.formatTotals(), 'Castigate: 1 | Pierdute: 0');
  assert.equal(switched.upsert('e1', 'pierduta').ok, true);
  assert.equal(switched.formatTotals(), 'Castigate: 0 | Pierdute: 1');
  assert.equal(Object.keys(switched.getState()).length, 1);
});
