const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validatePlanifica, actionChoiceLabel } = require('../bot-actiuni/validation');
const { parseBucharestDateTime, formatBucharest } = require('../bot-actiuni/datetime');
const {
  applyPresent,
  applyAbsent,
  formatListaActiuni,
  formatAttendanceSections,
  chunkText,
} = require('../bot-actiuni/attendance');
const { createStore } = require('../bot-actiuni/store');
const { authorizeCommand } = require('../bot-actiuni/roles');

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
    at: '2026-09-23T17:00:00.000Z',
    dateLabel: '23.09.2026',
    dateTimeLabel: '23.09.2026 20:00',
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
  assert.equal(authorizeCommand('reset_actiuni', { roles: ['999'] }, { STAFF_ROLE_IDS: '999' }).ok, true);
  assert.equal(authorizeCommand('prezent', member, {}).ok, true);
});
