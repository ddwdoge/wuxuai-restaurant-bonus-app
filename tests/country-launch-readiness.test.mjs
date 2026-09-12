import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canActivateCountry, countryReadinessStatus, COUNTRY_READINESS_KEYS } from '../src/modules/platform/countryLaunchReadiness.mjs';
import { COUNTRY_LAUNCH_MESSAGES } from '../src/shared/i18n/countryLaunchMessages.mjs';
import { countryNameForCode } from '../src/shared/countries.mjs';
const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');
const sql = read('supabase/migrations/20260911005000_country_launch_readiness.sql');
const panel = read('src/modules/platform/PlatformCountryLaunchPanel.tsx');
const ready = () => ({currency_code:'EUR',readiness:{ready:true,checks:COUNTRY_READINESS_KEYS.map(key=>({key,status:'ready',document_version_refs:key==='required_documents'?['synthetic-version']:[]}))}});

test('activation requires server ready plus all eight evidence states',()=> {
  assert.equal(canActivateCountry(ready()),true);
  for(const key of COUNTRY_READINESS_KEYS) {
    for(const status of ['open','not_configured','expired','unknown']) {
      const country=ready(); country.readiness.checks.find(c=>c.key===key).status=status;
      assert.equal(canActivateCountry(country),false,`${key}: ${status}`);
    }
    const country=ready(); country.readiness.checks=country.readiness.checks.filter(c=>c.key!==key);
    assert.equal(canActivateCountry(country),false,`missing ${key}`);
  }
});
test('no fabricated readiness from active registration, missing response or currency',()=> {
  assert.equal(canActivateCountry({enabled:true}),false);
  const country=ready(); country.readiness.ready=false; assert.equal(canActivateCountry(country),false);
  country.readiness.ready=true; country.currency_code=null; assert.equal(canActivateCountry(country),false);
  assert.equal(countryReadinessStatus(undefined),'not_configured');
});
test('expiry and invalid expiry fail closed, version references required',()=> {
  const country=ready(); country.readiness.checks[0].valid_until='2026-01-01T00:00:00Z';
  assert.equal(canActivateCountry(country,Date.parse('2026-01-01T00:00:00Z')),false);
  country.readiness.checks[0].valid_until='invalid'; assert.equal(canActivateCountry(country),false);
  delete country.readiness.checks[0].valid_until;
  for(const refs of [[],[''],[null]]) {
    country.readiness.checks.find(c=>c.key==='required_documents').document_version_refs=refs;
    assert.equal(canActivateCountry(country),false);
  }
});
test('server mutation checks readiness before updating or writing successful audit',()=> {
  const rpc=sql.slice(sql.indexOf('create or replace function public.set_platform_country_launch_status'));
  assert.ok(rpc.indexOf('COUNTRY_READINESS_INCOMPLETE')<rpc.indexOf('update public.country_launch_policy'));
  assert.match(rpc,/for update/); assert.match(rpc,/COUNTRY_REQUEST_CONFLICT/);
  assert.match(sql,/country_market_readiness_guard before insert or update/);
  assert.match(sql,/count\(\*\)=8/); assert.match(sql,/valid_until>statement_timestamp\(\)/);
  assert.match(sql,/country_readiness_policy_lock before insert or update or delete/);
});
test('new readiness table has RLS and no browser writes or evidence setter',()=> {
  assert.match(sql,/alter table public.country_launch_readiness enable row level security/);
  assert.match(sql,/revoke all on public.country_launch_readiness from public,anon,authenticated/);
  assert.doesNotMatch(sql,/grant (?:all|update|insert|delete)|disable row level security|update public\.(restaurants|branches|legal_master_templates)|set enabled=true/i);
  assert.doesNotMatch(panel,/\.from\(/);
});
test('UI exposes currency, separate technical/public states and empty audit',()=> {
  for(const token of ['country.currency_code','t("registration")','t("market")','COUNTRY_READINESS_KEYS.map','t("no_history")','entry.actor_id','entry.before_state','entry.after_state','dateTime={entry.created_at}','entry.reason']) assert.ok(panel.includes(token),token);
  assert.match(panel,/disabled=\{busy \|\| !eligible/);
  assert.match(panel,/if \(target.enabled && !canActivateCountry\(target.country\)\) return/);
  assert.ok(panel.includes('closeLabel={t("close")}'));
  assert.ok(read('src/shared/components/AppDrawer.tsx').includes('closeLabel ?? t("common.close")'));
});
test('country UI copy parity across seven locales with every rendered readiness key',()=> {
  for(const locale of ['de','en','fr','it','es','zh','ko']) {
    assert.deepEqual(Object.keys(COUNTRY_LAUNCH_MESSAGES[locale]),Object.keys(COUNTRY_LAUNCH_MESSAGES.de));
    for(const key of [...COUNTRY_READINESS_KEYS,'ready','open','not_configured','expired','no_history','actor','before','after','prerequisites_missing','close']) assert.ok(COUNTRY_LAUNCH_MESSAGES[locale][`platform.country.${key}`]);
  }
});
test('ZH and KO names match canonical six-country language contract',()=> {
  const codes=['AT','DE','CH','FR','IT','ES'];
  assert.deepEqual(codes.map(c=>countryNameForCode(c,'zh')),['奥地利','德国','瑞士','法国','意大利','西班牙']);
  assert.deepEqual(codes.map(c=>countryNameForCode(c,'ko')),['오스트리아','독일','스위스','프랑스','이탈리아','스페인']);
});
test('no Intl.DisplayNames still uses current-language country fallback',async()=> {
  const saved=Intl.DisplayNames;
  try {
    Intl.DisplayNames=undefined;
    const fresh=await import('../src/shared/countries.mjs?country-fallback');
    assert.equal(fresh.countryNameForCode('ES','zh'),'西班牙');
    assert.equal(fresh.countryNameForCode('FR','ko'),'프랑스');
    assert.equal(fresh.countryNameForCode('DE','fr'),'Allemagne');
  } finally { Intl.DisplayNames=saved; }
});
