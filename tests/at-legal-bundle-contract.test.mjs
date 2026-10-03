import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../supabase/migrations/20261003001000_at_legal_bundle_publication_contract.sql', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../supabase/migrations/20260927003000_manual_kyb_legal_publication_gate.sql', import.meta.url), 'utf8');
const encoder = (value) => {
  if (Array.isArray(value)) return 'a' + value.map(encoder).join('') + ';';
  if (value !== null && typeof value === 'object') return 'o' + Object.keys(value).sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b))).map(key => Buffer.byteLength(key) + ':' + key + encoder(value[key])).join('') + ';';
  const kind = value === null ? 'n' : typeof value === 'string' ? 's' : typeof value === 'boolean' ? 'b' : 'n';
  const atom = typeof value === 'string' ? value : JSON.stringify(value);
  return kind + Buffer.byteLength(atom) + ':' + atom;
};
const manifestBytes = (m) => 'WUXUAI_LEGAL_BUNDLE_V1' + ['schema_version','restaurant_id','country','locale','terms','privacy','policy'].map(k => encoder(m[k])).join('');
const hash = (m) => createHash('sha256').update(manifestBytes(m), 'utf8').digest('hex');
const vector = { schema_version: 1, restaurant_id: '70000000-0000-4000-8000-000000000003', country: 'AT', locale: 'de-AT', terms: { id: '70000000-0000-4000-8000-000000000010', version: 'Ä:1', sha256: 'a'.repeat(64) }, privacy: { id: '70000000-0000-4000-8000-000000000018', version: '1', sha256: 'b'.repeat(64) }, policy: { change_ref: 'TEST', legal_status: 'VERIFIED' } };

test('V1 UTF-8 byte contract has a fixed independent SHA-256 test vector', () => {
  assert.equal(hash(vector), 'f9ac101fdc634e1af78bce233d36e8da754035bfb16f47ced6e1c8bc920b78d3');
  assert.equal(hash(vector), hash({ ...vector, terms: { sha256: 'a'.repeat(64), version: 'Ä:1', id: vector.terms.id } }));
  assert.notEqual(encoder(['a:1', 'b']), encoder(['a', ':1b']));
  assert.match(sql, /octet_length\(atom\)/);
  assert.match(sql, /order by key collate "C"/);
  assert.match(sql, /WUXUAI_LEGAL_BUNDLE_V1/);
});

test('each version, document hash, identity and policy revision changes bundle identity', () => {
  for (const section of ['terms','privacy','policy']) {
    for (const key of Object.keys(vector[section])) {
      const changed = structuredClone(vector);
      changed[section][key] += '-changed';
      assert.notEqual(hash(changed), hash(vector));
    }
  }
  assert.match(sql, /bundle_id='bundle-'\|\|bundle_sha256/);
  assert.match(sql, /LEGAL_BUNDLE_HASH_COLLISION/);
  assert.match(sql, /legal_bundle_policy_revisions/);
});

test('legal approval and operator KYB remain independent; original gates are retained', () => {
  assert.doesNotMatch(sql, /(?:insert into|update|alter table|delete from) public\.(?:legal_operator_publication_decisions|business_verification_cases|business_verified_profile_revisions)\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.legal_operator_publication_ready_internal/);
  const oldStart = legacy.indexOf('  select public.legal_operator_publication_ready_internal(input_restaurant_id');
  const oldEnd = legacy.indexOf('  );', oldStart);
  assert.ok(sql.includes(legacy.slice(oldStart, oldEnd)));
  assert.match(sql, /legal_bundle_effective_status_internal\(s\.bundle_id\)='PUBLISHED'/);
  assert.match(sql, /and public\.restaurant_legal_bundle_is_current\(input_restaurant_id,input_as_of\)/);
});

test('all Browser RPCs share current Platform role and canonical recent TOTP', () => {
  assert.match(sql, /auth\.role\(\) is distinct from 'authenticated'/);
  assert.match(sql, /current_platform_role\(\) in \('platform_owner','platform_admin'\)/);
  assert.match(sql, /perform public\.require_recent_platform_auth_internal\(\)/);
  assert.equal((sql.match(/perform public\.require_legal_bundle_admin_internal\(\)/g) ?? []).length, 5);
  assert.doesNotMatch(sql, /grant.*to (?:anon|public|service_role)/i);
});

test('atomic receipts serialize request keys, reject conflicting replay and bind actor', () => {
  assert.match(sql, /legal-bundle-request:/);
  assert.match(sql, /legal-bundle-restaurant:/);
  assert.match(sql, /request_payload is distinct from payload/);
  assert.match(sql, /actor_id is distinct from actor/);
  assert.match(sql, /and bundle_id=input_expected_bundle_id and actor_id=auth\.uid\(\)/);
  assert.match(sql, /return prior\.result/);
  assert.match(sql, /for update/);
  assert.match(sql, /get_platform_legal_bundle_preflight/);
});

test('publication preserves draft, policy, staleness and explicit withdrawal gates', () => {
  for (const field of ['real_intake_status','legal_status','privacy_status','document_catalog_status','retention_status']) assert.match(sql, new RegExp(field));
  assert.match(sql, /is distinct from 'REVIEWED'/);
  assert.match(sql, /input_external_approval_confirmed is distinct from true/);
  assert.match(sql, /legal_bundle_effective_status_internal\(input_bundle_id,true\)<>'READY'/);
  assert.match(sql, /return 'STALE'/);
  assert.match(sql, /return 'WITHDRAWN'/);
  assert.match(sql, /before update or delete or truncate/);
  assert.match(sql, /revoke all on table public\.%I from public,anon,authenticated,service_role/);
});

test('migration is additive and contains no publication seed or business action', () => {
  assert.doesNotMatch(sql, /insert into public\.legal_bundle_publication_events[^;]*\bselect\b/i);
  assert.doesNotMatch(sql, /(?:update|insert into|delete from) public\.(?:restaurants|customers|active_rewards|points_transactions|branch_subscriptions|country_kyb_intake_policies)\b/i);
  assert.doesNotMatch(sql, /service_role.*(?:key|secret)|register_restaurant_customer|award_points|stripe_customer_id/i);
});
