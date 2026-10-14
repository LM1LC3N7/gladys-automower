// -----------------------------------------------------------------------------
// The "mower" widget: valid for the SDK's checker, localized, four buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { mowerOf } from '../src/automower/model.js';
import { WIDGET_ACTIONS } from '../src/constants.js';
import { nextReading } from '../src/triggers.js';
import { mowerWidget, shortWall } from '../src/widget.js';
import { FIXTURE_NOW, PELOUSE, fixture } from './helpers/fakeFetch.js';

const mower = mowerOf(fixture('mowers.json').data[0], { timeZone: 'Europe/Paris' });
const reading = (overrides = {}, previous) =>
  nextReading(previous, { ...mower, ...overrides }, FIXTURE_NOW);
const status = (content) => content.components.find((c) => c.type === 'status').items;

test('a docked mower: battery, next start, rows, four buttons', () => {
  const content = mowerWidget({ reading: reading(), startMinutes: 180, language: 'fr' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 300);
  assert.equal(content.components[0].text, 'Pelouse');
  const [battery, next] = content.components.filter((c) => c.type === 'value');
  assert.equal(battery.value, 100);
  assert.equal(battery.unit, '%');
  assert.equal(next.value, '14/10 10:00');
  const rows = status(content);
  assert.equal(rows[0].value, 'Garée à la station');
  assert.equal(rows[1].value, 'En attente · hors planning');
  assert.equal(rows[3].value, 'Aucune');
  assert.equal(rows[4].value, 'Connectée');
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    [WIDGET_ACTIONS.START, WIDGET_ACTIONS.PARK, WIDGET_ACTIONS.PAUSE, WIDGET_ACTIONS.RESUME],
  );
  assert.equal(buttons[0].label.fr, 'Démarrer 3 h');
  assert.deepEqual(buttons[0].action.params, { mower: PELOUSE });
});

test('a mower in error, then the last error once cleared, in English', () => {
  const failing = reading({
    activity: 'stopped_in_garden',
    state: 'error',
    errorCode: 9,
    errorWall: Date.UTC(2026, 9, 14, 8, 41),
    battery: 12,
    connected: false,
  });
  const content = mowerWidget({ reading: failing, startMinutes: 90, language: 'en' });
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = status(content);
  assert.equal(rows[3].value, 'Trapped · 14 Oct 08:41');
  assert.equal(rows[3].color, 'danger');
  assert.equal(rows[4].value, 'Disconnected');
  assert.equal(content.components.find((c) => c.type === 'value').color, 'danger');
  assert.equal(content.components.find((c) => c.type === 'button').label.en, 'Start 90 min');
  const cleared = mowerWidget({ reading: reading({}, failing), language: 'en' });
  assert.equal(status(cleared)[3].label.en, 'Last error');
  assert.equal(status(cleared)[3].value, 'Trapped · 14 Oct 08:41');
});

test('a mowing mower refreshes faster; no mower, a hint', () => {
  const mowing = mowerWidget({ reading: reading({ activity: 'mowing', state: 'in_operation' }) });
  assert.equal(mowing.ttl_seconds, 60);
  assert.equal(status(mowing)[0].color, 'success');
  const none = mowerWidget({ reading: undefined });
  assert.deepEqual(validateWidgetContent(none), []);
  assert.match(none.components[0].text.fr, /clé et le secret/);
  assert.equal(shortWall(null), null);
  assert.equal(shortWall(Date.UTC(2026, 0, 2, 3, 4), 'en'), '02 Jan 03:04');
});
