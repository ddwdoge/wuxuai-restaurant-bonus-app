import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COUNTRY_LAUNCH_MESSAGES } from '../src/shared/i18n/countryLaunchMessages.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20260911004000_country_launch_gate.sql');
test('country policy is data-driven with exactly AT enabled initially', () => {
  assert.match(sql, /values \('AT',true\),\('DE',false\),\('CH',false\),\('FR',false\),\('IT',false\),\('ES',false\)/);
  assert.match(sql, /allowed is distinct from true/);
  assert.match(sql, /where country_code=code for share/);
});
test('country policy and context have RLS and no browser writes', () => {
  for (const table of ['policy','existing_businesses','audit','creation_context']) {
    assert.match(sql, new RegExp(`alter table public.country_launch_${table} enable row level security`));
  }
  assert.match(sql, /country_launch_creation_context from public, anon, authenticated/);
  assert.doesNotMatch(sql, /disable row level security|set_config\(/i);
});
test('country control requires separate platform authority, exact target confirmation and request identity', () => {
  assert.match(sql, /current_platform_role\(\) in \('platform_owner','platform_admin'\)/);
  assert.match(sql, /input_confirmation is distinct from 'CONFIRMED:'\|\|code/);
  assert.match(sql, /COUNTRY_REQUEST_CONFLICT/);
  assert.match(sql, /COUNTRY_AUDIT_IMMUTABLE/);
});
test('country-less trial and completion delegates are private', () => {
  assert.match(sql, /revoke all on function public.start_restaurant_owner_trial_country_internal\(text,text,text\) from public,anon,authenticated/);
  assert.match(sql, /complete_restaurant_onboarding_country_internal\(uuid,jsonb,jsonb,boolean,uuid\) from public,anon,authenticated/);
});
test('existing Owner resume is a read-only authoritative lookup, not country-less creation', () => {
  const start = sql.slice(sql.indexOf('create function public.start_restaurant_owner_trial('));
  const resume = start.slice(0,start.indexOf('code:=public.require_launch_country(input_country)'));
  assert.match(resume, /where r.owner_id=auth.uid\(\)/);
  assert.match(resume, /m.role='owner'/);
  assert.match(resume, /if result is not null then return result/);
  assert.doesNotMatch(resume, /insert into|update public\./);
});
test('country guards cover business boundaries without Customer geographic blocking', () => {
  for (const table of ['restaurants','organizations','branches','branch_subscriptions','restaurant_legal_profiles','organization_legal_profiles','kassa_compliance_acknowledgements']) {
    assert.match(sql, new RegExp(`on public.${table}\\n?\\s+for each row execute function public.guard_country_launch`));
  }
  assert.doesNotMatch(sql, /on public\.(customers|customer_accounts|customer_account_memberships|customer_legal_acceptances)/);
  assert.doesNotMatch(sql, /request\.headers|ip_address|geoip/i);
});
test('existing business protection cannot be forged by toggling frontend status', () => {
  assert.match(sql, /insert into public.country_launch_existing_businesses\nselect id from public.restaurants where onboarding_status in \('ready','completed'\)/);
  assert.match(sql, /COUNTRY_ONBOARDING_RPC_REQUIRED/);
});
test('Owner registration sends explicit country and does not derive authorization from language', () => {
  const service = read('src/modules/auth/registerOwnerService.ts');
  assert.match(service, /input_country: input.country \|\| null/);
  assert.match(service, /await requireRegistrationCountry\(input.country\)/);
  assert.match(service, /business_country: input.country/);
  assert.doesNotMatch(service, /country:.*(?:browserEmailLanguage|navigator|\?\? "AT")/);
});
test('onboarding has no silent Austria default and uses server-provided countries', () => {
  const page = read('src/modules/admin/pages/RestaurantOnboarding.tsx');
  assert.match(page, /<LaunchCountrySelect/);
  assert.doesNotMatch(page, /legalCountry: "Österreich"|country \?\? "AT"/);
});
test('Platform country UI writes only via confirmed RPC, retaining retry key', () => {
  const panel = read('src/modules/platform/PlatformCountryLaunchPanel.tsx');
  assert.match(panel, /rpc\("set_platform_country_launch_status"/);
  assert.match(panel, /request.current.id/);
  assert.doesNotMatch(panel, /\.from\(/);
});
test('country copy has complete seven-language key parity', () => {
  for (const locale of ['de','en','fr','it','es','zh','ko']) {
    assert.deepEqual(Object.keys(COUNTRY_LAUNCH_MESSAGES[locale]), Object.keys(COUNTRY_LAUNCH_MESSAGES.de));
    assert.ok(Object.values(COUNTRY_LAUNCH_MESSAGES[locale]).every(value => typeof value === 'string' && value.length > 0));
  }
});
test('Country confirmation portal keeps its own 44px touch target scope', () => {
  const panel = read('src/modules/platform/PlatformCountryLaunchPanel.tsx');
  const styles = read('src/styles.css');
  assert.match(panel, /<form className="form country-launch-confirmation"/);
  assert.match(styles, /\.country-launch-confirmation \.button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
});
