import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { preparePlanOverrideRequest } from '../src/modules/platform/planOverrideRequest.mjs';
import { PLAN_OVERRIDE_MESSAGES } from '../src/shared/i18n/planOverrideMessages.mjs';
import { translateStructural } from '../src/shared/i18n/catalog.mjs';
import * as formatters from '../src/shared/i18n/formatters.mjs';

const now = Date.parse('2026-09-11T10:00:00Z');
const base = { restaurantId: 'isolated-test-restaurant', overrideId: 'override-one', action: 'activate', reason: 'Isolated test approval', confirmation: 'CONFIRMED', expiresAt: '2026-09-12T10:00:00Z' };
const request = (changes = {}, previous = null) => preparePlanOverrideRequest({ ...base, ...changes }, previous, now, () => 'operation-one');

test('activation defaults to immediate and preserves exact expiry and confirmation', () => {
  const result = request();
  assert.equal(result.startsAt, null);
  assert.equal(result.expiresAt, '2026-09-12T10:00:00.000Z');
  assert.equal(result.confirmation, 'CONFIRMED');
});
test('activation requires future expiry', () => {
  for (const expiresAt of ['', 'invalid', '2026-09-11T10:00:00Z', '2026-09-10T10:00:00Z']) {
    assert.throws(() => request({ expiresAt }), /expiry/);
  }
});
test('scheduled activation validates start ordering', () => {
  assert.equal(request({ startsAt: '2026-09-11T11:00:00Z' }).startsAt, '2026-09-11T11:00:00.000Z');
  for (const startsAt of ['invalid', '2026-09-10T10:00:00Z', base.expiresAt]) assert.throws(() => request({ startsAt }), /start/);
});
test('both actions require reason and exact confirmation', () => {
  for (const action of ['activate', 'end']) {
    assert.throws(() => request({ action, reason: 'short' }), /reason/);
    for (const confirmation of ['', 'confirmed', ' CONFIRMED', 'CONFIRMED ']) assert.throws(() => request({ action, confirmation }), /confirmation/);
  }
});
test('ending requires no new expiry and ignores activation date fields', () => {
  const result = request({ action: 'end', expiresAt: '', startsAt: 'invalid' });
  assert.equal(result.startsAt, null);
  assert.equal(result.expiresAt, null);
});
test('identical retry retains request object and never generates another key', () => {
  const first = request();
  const next = preparePlanOverrideRequest(base, first, now + 1000, () => { throw new Error('duplicate key'); });
  assert.equal(next, first);
});
test('different tenant, action, dates or reason cannot reuse prior operation identity', () => {
  const first = request();
  for (const change of [{ restaurantId: 'other' }, { action: 'end' }, { reason: 'Different support reason' }, { expiresAt: '2026-09-13T10:00:00Z' }, { startsAt: '2026-09-11T11:00:00Z' }]) {
    const next = preparePlanOverrideRequest({ ...base, ...change }, first, now, () => 'operation-two');
    assert.equal(next.idempotencyKey, 'operation-two');
  }
});

const require = createRequire(import.meta.url);
function compile(path, overrides) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: name => name in overrides ? overrides[name] : require(name), crypto: { randomUUID: () => 'unexpected-new-key' } });
  return exports;
}
test('service activates only PRO through canonical RPC and preserves retry key', async () => {
  const calls = [];
  const service = compile('../src/modules/platform/platformAdminService.ts', { '../../shared/lib/supabase': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { success: true }, error: null }; } } } });
  const immediate = request();
  await service.submitPlatformPlanOverride(immediate);
  await service.submitPlatformPlanOverride(immediate);
  assert.equal(calls[0].name, 'set_platform_restaurant_plan_override');
  assert.equal(calls[0].args.input_plan_key, 'PRO');
  assert.equal(calls[0].args.input_idempotency_key, calls[1].args.input_idempotency_key);
  assert.equal(calls[0].args.input_starts_at, null);
  assert.equal(calls[0].args.input_restaurant_id, base.restaurantId);
  await service.submitPlatformPlanOverride(request({ startsAt: '2026-09-11T11:00:00Z' }));
  assert.equal(calls[2].args.input_starts_at, '2026-09-11T11:00:00.000Z');
  await service.submitPlatformPlanOverride(request({ action: 'end' }));
  assert.equal(calls[3].name, 'end_platform_restaurant_plan_override');
  assert.equal(calls[3].args.input_override_id, 'override-one');
  assert.equal('input_plan_key' in calls[3].args, false);
});
test('service propagates authorization failure without an alternate write path', async () => {
  let count = 0;
  const denied = new Error('permission denied');
  const service = compile('../src/modules/platform/platformAdminService.ts', { '../../shared/lib/supabase': { supabase: { rpc: async () => { count++; return { data: null, error: denied }; } } } });
  await assert.rejects(service.submitPlatformPlanOverride(request()), error => error === denied);
  assert.equal(count, 1);
});

const fixture = { effective_plan: 'PRO', plan_key: 'PRO', stored_plan_key: 'BASIC', entitlement_source: 'PLATFORM_ADMIN_OVERRIDE',
  effective_from: '2026-09-11T11:00:00Z', effective_until: '2026-09-12T11:00:00Z',
  effective: { offer_limit: null, offer_limit_unlimited: true, offer_notifications: true, reward_notifications: true },
  override: { id: 'override-one', plan_key: 'PRO', status: 'VALID', effective_from: '2026-09-11T11:00:00Z', expires_at: '2026-09-12T11:00:00Z' } };
function render(language, canWrite) {
  let index = 0;
  const values = [fixture, false, false, '', '', false, '', '', '', ''];
  const panel = compile('../src/modules/platform/PlatformPlanEntitlementsPanel.tsx', {
    react: { ...React, useState: initial => [values[index++] ?? initial, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: () => {} },
    '../../shared/i18n/I18nProvider': { useI18n: () => ({ language, translateKey: key => translateStructural(key, language) }) },
    '../../shared/i18n/formatters.mjs': formatters,
    './planOverrideRequest.mjs': { preparePlanOverrideRequest },
    './platformAdminService': {},
    '../../shared/ui/UiDialog': { UiDialog: ({ open, children }) => open ? React.createElement('div', { role: 'dialog' }, children) : null },
  });
  return renderToStaticMarkup(React.createElement(panel.PlatformPlanEntitlementsPanel, { canWrite, restaurantId: base.restaurantId }));
}
test('all seven languages have identical keysets and preserve CONFIRMED and PRO', () => {
  const keys = Object.keys(PLAN_OVERRIDE_MESSAGES.de);
  for (const [language, messages] of Object.entries(PLAN_OVERRIDE_MESSAGES)) {
    assert.deepEqual(Object.keys(messages), keys);
    for (const key of keys) {
      assert.ok(messages[key]?.trim());
      assert.equal(translateStructural(key, language), messages[key]);
    }
    assert.match(messages['platform.planOverride.confirmation'], /CONFIRMED/);
    assert.match(messages['platform.planOverride.activate'], /PRO/);
  }
});
test('rendered plan UI is localized, separates subscription and exposes no legacy toggles', () => {
  for (const language of Object.keys(PLAN_OVERRIDE_MESSAGES)) {
    const html = render(language, true);
    assert.ok(html.includes(PLAN_OVERRIDE_MESSAGES[language]['platform.planOverride.activate']));
    assert.match(html, />PRO</);
    assert.match(html, />BASIC</);
    assert.match(html, /datetime-local/);
    assert.doesNotMatch(html, /platform\.planOverride\.|PREMIUM|Paket speichern|Manuelle Ausnahmen entfernen/);
  }
});
test('read-only role sees effective server plan without any mutation controls', () => {
  const html = render('de', false);
  assert.match(html, /Nur Ansicht/);
  assert.doesNotMatch(html, /textarea|<input|PRO aktivieren|Freischaltung beenden/);
});
test('ending is bound to the selected override and cannot reuse a different target retry', () => {
  assert.throws(() => request({ action: 'end', overrideId: undefined }), /target/);
  const first = request({ action: 'end' });
  const next = preparePlanOverrideRequest({ ...base, action: 'end', overrideId: 'override-two' }, first, now, () => 'operation-two');
  assert.equal(next.idempotencyKey, 'operation-two');
});
test('an unchanged ambiguous response may be replayed after its window elapsed', () => {
  const first = request();
  assert.equal(preparePlanOverrideRequest(base, first, now + 3 * 86400000, () => { throw Error('new request'); }), first);
});
