// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS,
  ACTIVITIES,
  LANGUAGES,
  PARK_MODES,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  WIDGETS,
} from '../src/constants.js';
import { BOUNDS, DEFAULTS } from '../src/config.js';
import { mowerOf } from '../src/automower/model.js';
import { mowerEvents, nextReading } from '../src/triggers.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.location, undefined, 'no house location needed');
  assert.match(manifest.gladys_version, />=5\.1\.0/);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-automower:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/LM1LC3N7/gladys-automower/main/cover.png',
  );
  assert.deepEqual(manifest.categories, ['appliances']);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
    assert.match(manifest.config_schema[0].description[lang], /Unofficial|non officiel/);
    assert.match(read(`docs/${lang}.md`), /not affiliated with Husqvarna|sans lien avec Husqvarna/);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  for (const field of manifest.config_schema) {
    for (const link of field.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const key of ['app_key', 'app_secret']) {
    assert.equal(fields[key].type, 'secret', key);
    assert.equal(fields[key].required, true, key);
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
    if (BOUNDS[key]) {
      assert.deepEqual([fields[key].min, fields[key].max], BOUNDS[key], key);
    }
  }
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((w) => w.key).sort(), Object.values(WIDGETS).sort());
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(index.includes(`onAction(ACTIONS.${name}`), name);
  }
  const triggers = Object.fromEntries(manifest.scene_triggers.map((t) => [t.key, t]));
  assert.deepEqual(
    triggers[SCENE_TRIGGERS.ACTIVITY].fields
      .find((f) => f.key === 'activity')
      .options.map((o) => o.value),
    ACTIVITIES,
  );
  const park = manifest.scene_actions.find((a) => a.key === SCENE_ACTIONS.PARK);
  const mode = park.fields.find((f) => f.key === 'mode');
  assert.deepEqual(
    mode.options.map((o) => o.value),
    Object.values(PARK_MODES),
  );
  assert.equal(mode.default, PARK_MODES.NEXT_SCHEDULE, 'a required field keeps a default');
});

test('every trigger field and variable is a key of the events the code fires', () => {
  const base = mowerOf(fixture('mowers.json').data[0], { timeZone: 'Europe/Paris' });
  const steps = [
    {},
    { activity: 'leaving', state: 'in_operation' },
    { activity: 'mowing', state: 'in_operation' },
    { activity: 'stopped_in_garden', state: 'error', errorCode: 9, connected: false },
  ];
  let previous;
  const events = [];
  steps.forEach((overrides, i) => {
    const reading = nextReading(previous, { ...base, ...overrides }, FIXTURE_NOW + i * 60_000);
    events.push(...mowerEvents('ext:automower:mower:x', previous, reading));
    previous = reading;
  });
  for (const trigger of manifest.scene_triggers) {
    const event = events.find((e) => e.key === trigger.key);
    assert.ok(event, `${trigger.key} is fired by the code`);
    for (const { key } of [...trigger.fields, ...trigger.variables]) {
      assert.ok(key in event.data, `${trigger.key}: "${key}" is in the event data`);
    }
    assert.ok(Object.keys(event.data).length <= 30);
  }
});
