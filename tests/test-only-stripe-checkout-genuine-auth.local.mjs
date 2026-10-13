// Isolated local-only TEST_ONLY checkout contract proof. No hosted or Stripe calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_STRIPE_GENUINE_AUTH, '1');
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
assert.match(config, /^project_id = "wuxuai-phase7b4d-local"$/m);
const container = 'supabase_db_wuxuai-phase7b4d-local';
const sql = (query) => execFileSync('docker',
  ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (query) => JSON.parse(sql(query));
const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
}));
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1');
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const counters = () => json(`select jsonb_build_object(
  'receipts',(select count(*) from public.test_only_basic_access_receipts),
  'active_receipts',(select count(*) from public.test_only_basic_access_receipts where action='GRANT' and starts_at<=now() and expires_at>now()),
  'requests',(select count(*) from test_only_checkout.requests),
  'events',(select count(*) from test_only_checkout.events),
  'audit',(select count(*) from test_only_checkout.audit),
  'paid',(select count(*) from public.basic_paid_offer_acceptances),
  'entitlements',(select count(*) from public.branch_entitlement_overrides),
  'trial_claims',(select count(*) from public.billing_trial_claims),
  'subscriptions',(select count(*) from public.branch_subscriptions));`);
const fixture = json(`select jsonb_build_object('owner',r.owner_id,'email',u.email,
  'restaurant',r.id,'old_password',u.encrypted_password,'old_updated',u.updated_at,
  'old_instance',u.instance_id,
  'auth_fixture_tokens_null',u.confirmation_token is null and u.email_change is null
    and u.email_change_token_new is null and u.recovery_token is null,
  'old_last_sign_in',u.last_sign_in_at,
  'prior_receipt',(select x.id from public.test_only_basic_access_receipts x
    where x.restaurant_id=r.id order by x.created_at desc,x.id desc limit 1),
  'prior_receipt_reusable',(select x.reason='Synthetic local genuine-auth Stripe checkout proof'
    and x.action='GRANT' and x.starts_at<=now() and x.expires_at>now()
    from public.test_only_basic_access_receipts x where x.restaurant_id=r.id
    order by x.created_at desc,x.id desc limit 1),
  'old_session_count',(select count(*) from auth.sessions s where s.user_id=u.id))
  || jsonb_build_object('old_factor_count',(select count(*) from auth.mfa_factors f where f.user_id=u.id),
    'old_factor_secret_null',(select bool_and(f.secret is null) from auth.mfa_factors f where f.user_id=u.id))
  from public.restaurants r join auth.users u on u.id=r.owner_id
  where u.email like '%@example.invalid' and exists(select 1 from public.test_only_basic_access_receipts x where x.restaurant_id=r.id);`);
assert.ok(fixture?.owner && fixture.email.endsWith('@example.invalid'));
assert.equal(fixture.old_password ?? '', '');
assert.equal(json(`select count(*) from auth.identities where user_id=${lit(fixture.owner)}::uuid`), 0);
const before = counters();
let phase = 'PREFLIGHT', ownerSession = null, receiptAdded = false;
let safeCode = null;
let safeHttpStatus = null;
try {
  // Local fixture credential only. Never set JWT claims or a database role.
  phase = 'LOCAL_AUTH_SETUP';
  assert.equal(fixture.old_instance, null);
  assert.equal(fixture.auth_fixture_tokens_null, true);
  assert.equal(fixture.old_factor_count, 1);
  assert.equal(fixture.old_factor_secret_null, true);
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000'::uuid,
    confirmation_token='',email_change='',email_change_token_new='',recovery_token=''
    where id=${lit(fixture.owner)}::uuid and instance_id is null;`);
  sql(`update auth.mfa_factors set secret=encode(extensions.gen_random_bytes(20),'hex')
    where user_id=${lit(fixture.owner)}::uuid and secret is null;`);
  const password = `Aa!${randomBytes(24).toString('hex')}`;
  const changed = await admin.auth.admin.updateUserById(fixture.owner, { password });
  if (changed.error) {
    safeCode = /^[a-z_]{3,80}$/.test(changed.error.code ?? '') ? changed.error.code : 'auth_admin_error';
    safeHttpStatus = Number.isInteger(changed.error.status) ? changed.error.status : null;
  }
  assert.equal(changed.error, null, 'LOCAL_AUTH_SETUP_FAILED');
  phase = 'REGULAR_OWNER_LOGIN';
  const login = await browser.auth.signInWithPassword({ email: fixture.email, password });
  assert.equal(login.error, null, 'REGULAR_OWNER_LOGIN_FAILED');
  ownerSession = login.data.session;
  assert.ok(ownerSession?.access_token && ownerSession.user?.id === fixture.owner);
  const owner = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${ownerSession.access_token}` } },
  });
  const bound = await owner.rpc('project_binding_session_matches');
  assert.equal(bound.error, null, 'OWNER_PROJECT_BINDING_QUERY_FAILED');
  assert.equal(bound.data, true, 'OWNER_PROJECT_BINDING_FAILED');
  phase = 'LOCAL_TEST_RECEIPT';
  const receiptId = fixture.prior_receipt_reusable ? fixture.prior_receipt : randomUUID();
  // Append-only local fixture. Historical failed-run receipts remain untouched.
  if (!fixture.prior_receipt_reusable) {
    sql(`insert into public.test_only_basic_access_receipts(id,restaurant_id,organization_id,branch_id,action,actor_id,request_id,
    previous_receipt_id,readiness_receipt_id,readiness_snapshot_sha256,customer_join_receipt_id,starts_at,expires_at,reason,
    decision_payload,auth_evidence,result,receipt_sha256,created_at)
    select ${lit(receiptId)},restaurant_id,organization_id,branch_id,'GRANT',actor_id,${lit(randomUUID())},id,
      readiness_receipt_id,readiness_snapshot_sha256,customer_join_receipt_id,clock_timestamp(),clock_timestamp()+interval '2 minutes',
      'Synthetic local genuine-auth Stripe checkout proof',decision_payload,auth_evidence,result,
      repeat('a',64),clock_timestamp()
    from public.test_only_basic_access_receipts where id=${lit(fixture.prior_receipt)};`);
    receiptAdded = true;
  }
  assert.equal(sql(`select test_only_checkout.access_active(${lit(fixture.restaurant)}::uuid,${lit(receiptId)}::uuid)`), 't');
  phase = 'OWNER_CHECKOUT_RPC';
  const requestId = randomUUID();
  const prepared = await owner.rpc('prepare_test_only_stripe_checkout', {
    input_restaurant_id: fixture.restaurant, input_request_id: requestId,
    input_return_route: '/admin/settings/konto-testphase',
  });
  assert.equal(prepared.error, null, 'OWNER_CHECKOUT_RPC_FAILED');
  assert.equal(prepared.data?.status, 'PREPARED');
  assert.equal(prepared.data?.amount_minor, 5900);
  assert.equal(prepared.data?.livemode, false);
  const repeated = await owner.rpc('prepare_test_only_stripe_checkout', {
    input_restaurant_id: fixture.restaurant, input_request_id: requestId,
    input_return_route: '/admin/settings/konto-testphase',
  });
  assert.equal(repeated.error, null, 'OWNER_REPLAY_FAILED');
  assert.equal(repeated.data?.idempotent, true);
  phase = 'LOCAL_PROVIDER_SIMULATION';
  const providerAccount = 'acct_synthetic123';
  const providerSession = `cs_test_${randomUUID().replaceAll('-', '')}`;
  const boundSession = await admin.rpc('bind_test_only_stripe_checkout_session', {
    input_checkout_request_id: prepared.data.id, input_provider_account_id: providerAccount,
    input_provider_session_id: providerSession, input_price_id: prepared.data.price_id,
    input_livemode: false,
  });
  assert.equal(boundSession.error, null, 'LOCAL_SESSION_BIND_FAILED');
  assert.equal(boundSession.data?.status, 'SESSION_CREATED');
  const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
  const event = await admin.rpc('record_test_only_stripe_checkout_completed', {
    input_event_id: eventId, input_payload_sha256: 'c'.repeat(64), input_event_created_at: new Date().toISOString(),
    input_provider_account_id: providerAccount, input_provider_session_id: providerSession,
    input_restaurant_id: fixture.restaurant, input_request_id: requestId,
    input_price_id: prepared.data.price_id, input_amount_total: 5900,
    input_currency: 'EUR', input_livemode: false,
  });
  assert.equal(event.error, null, 'LOCAL_EVENT_FAILED');
  const replay = await admin.rpc('record_test_only_stripe_checkout_completed', {
    input_event_id: eventId, input_payload_sha256: 'c'.repeat(64), input_event_created_at: new Date().toISOString(),
    input_provider_account_id: providerAccount, input_provider_session_id: providerSession,
    input_restaurant_id: fixture.restaurant, input_request_id: requestId,
    input_price_id: prepared.data.price_id, input_amount_total: 5900,
    input_currency: 'EUR', input_livemode: false,
  });
  assert.equal(replay.error, null, 'LOCAL_EVENT_REPLAY_FAILED');
  assert.equal(replay.data?.idempotent, true);
  const after = counters();
  assert.deepEqual(['paid','entitlements','trial_claims','subscriptions'].map(k => after[k]),
    ['paid','entitlements','trial_claims','subscriptions'].map(k => before[k]));
  assert.equal(after.receipts - before.receipts, receiptAdded ? 1 : 0);
  assert.equal(after.requests - before.requests, 1);
  assert.equal(after.events - before.events, 1);
  assert.equal(after.audit - before.audit, 3);
  console.log(JSON.stringify({ status: 'LOCAL_GENUINE_AUTH_E2E_PASS',
    login: 'REGULAR_AUTH', owner_binding: true, provider: 'SYNTHETIC_ONLY',
    receipt_delta: receiptAdded ? 1 : 0, request_delta: 1, event_delta: 1, audit_delta: 3,
    real_billing_delta: 0, replay: true }));
} catch {
  console.log(JSON.stringify({ status: 'LOCAL_GENUINE_AUTH_E2E_FAIL', phase, safe_code: safeCode, http_status: safeHttpStatus,
    receipt_added: receiptAdded, raw_errors_withheld: true }));
  process.exitCode = 1;
} finally {
  // Remove the temporary local credential and session, but keep immutable checkout evidence.
  try {
    if (ownerSession) await browser.auth.signOut();
    sql(`update auth.mfa_factors set secret=null
      where user_id=${lit(fixture.owner)}::uuid and secret is not null;`);
    sql(`update auth.users set encrypted_password=${lit(fixture.old_password ?? '')},
      updated_at=${lit(fixture.old_updated)}::timestamptz,
      instance_id=null,
      confirmation_token=null,email_change=null,email_change_token_new=null,recovery_token=null,
      last_sign_in_at=${fixture.old_last_sign_in ? `${lit(fixture.old_last_sign_in)}::timestamptz` : 'null'}
      where id=${lit(fixture.owner)}::uuid and email=${lit(fixture.email)};
      select jsonb_build_object('credential_restored',encrypted_password=${lit(fixture.old_password ?? '')},
        'session_count_restored',(select count(*) from auth.sessions s where s.user_id=auth.users.id)=${fixture.old_session_count})
      from auth.users where id=${lit(fixture.owner)}::uuid;`);
    const cleanup = json(`select jsonb_build_object('credential_restored',encrypted_password=${lit(fixture.old_password ?? '')},
      'instance_restored',instance_id is null,
      'fixture_tokens_restored',confirmation_token is null and email_change is null
        and email_change_token_new is null and recovery_token is null,
      'factor_restored',(select count(*)=${fixture.old_factor_count} and bool_and(secret is null)
        from auth.mfa_factors f where f.user_id=auth.users.id),
      'session_count_restored',(select count(*) from auth.sessions s where s.user_id=auth.users.id)=${fixture.old_session_count})
      from auth.users where id=${lit(fixture.owner)}::uuid;`);
    console.log(JSON.stringify({ cleanup }));
    if (!cleanup.credential_restored || !cleanup.instance_restored || !cleanup.fixture_tokens_restored || !cleanup.factor_restored || !cleanup.session_count_restored) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ cleanup: 'FAILED', raw_errors_withheld: true }));
    process.exitCode = 1;
  }
}
