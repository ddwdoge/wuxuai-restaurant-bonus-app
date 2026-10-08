// Opt-in local handler/RPC checks; no provider traffic or modified readiness gates.
// Run only against the isolated Docker test DB. Immutable receipts remain in its local volume.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { sanitizeStripeTestEvent, signFakeWebhook, verifyRawWebhook, sha256Hex } from '../supabase/functions/_shared/billingArchitecture.mjs';

const execute = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN;
const container = process.env.LOCAL_WEBHOOK_DB_CONTAINER;
if (!docker || !container || !/^supabase_db_[a-z0-9_-]+$/.test(container)) throw new Error('Explicit local Docker binary and DB container required');
const sql = async query => {
  const { stdout } = await execute(docker, ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  return stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
};
const quote = value => value == null ? 'null' : typeof value === 'boolean' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const run = randomUUID().replaceAll('-', '');
const secret = 'whsec_' + randomBytes(32).toString('hex');
const now = Math.floor(Date.now() / 1000);
const metadata = { restaurant_id: randomUUID(), acceptance_id: randomUUID(), request_id: randomUUID(), correlation_id: randomUUID() };
const eventIds = new Set();
const bindings = [];
let dbCalls = 0;
let handler;
const baseline = (await sql(`select jsonb_build_object('restaurants',(select count(*) from public.restaurants),
  'subscriptions',(select count(*) from public.branch_subscriptions),'checkouts',(select count(*) from public.basic_test_checkout_requests),
  'events',(select count(*) from public.basic_stripe_test_event_inbox));`))[0];
assert.equal(baseline.restaurants, 0, 'This harness requires the empty, isolated local snapshot');
const [existing] = await sql(`select jsonb_build_object('foreign',count(*)) from public.basic_stripe_test_event_inbox
  where event_id not like 'evt_LOCAL_%' or processing_status <> 'UNMATCHED';`);
assert.equal(existing.foreign, 0, 'Only prior local UNMATCHED test receipts may exist');

function invoice(label, shape = 'parent') {
  const id = `evt_LOCAL_${run}_${label}`;
  eventIds.add(id);
  return { id, livemode: false, type: 'invoice.paid', created: now,
    data: { object: { id: `in_LOCAL_${run}`, status: 'paid', metadata: {}, customer: `cus_LOCAL_${run}`,
      period_start: now, period_end: now + 2592000,
      ...(shape === 'parent' ? { parent: { type: 'subscription_details', subscription_details: { subscription: `sub_LOCAL_${run}`, metadata: { ...metadata } } } }
        : { subscription: `sub_LOCAL_${run}`, subscription_details: { metadata: { ...metadata } } }),
    } } };
}

const source = readFileSync(new URL('../supabase/functions/billing-stripe-test-webhook/index.ts', import.meta.url), 'utf8');
const context = vm.createContext({ Response, Uint8Array, TextDecoder, sanitizeStripeTestEvent, sha256Hex, verifyRawWebhook,
  fetch: () => { throw new Error('Provider/network access forbidden'); },
  Deno: { serve: fn => { handler = fn; }, env: { get: key => ({
    SUPABASE_URL: 'https://bwhvfjuwixgwduoeqaya.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'unusable-local-placeholder',
    STRIPE_TEST_WEBHOOK_SECRET: secret, BASIC_BILLING_MODE: 'staging_test_only', BASIC_BILLING_PROJECT_REF: 'bwhvfjuwixgwduoeqaya',
  })[key] } },
  createClient: () => ({ rpc: async (name, args) => {
    assert.equal(name, 'record_basic_stripe_test_event');
    assert.ok(eventIds.has(args.input_event_id));
    bindings.push(args); dbCalls++;
    const invocation = `public.${name}(${Object.entries(args).map(([key, value]) => {
      assert.match(key, /^input_[a-z0-9_]+$/); return `${key} => ${quote(value)}`;
    }).join(',')})`;
    const [data] = await sql(`begin; set local role service_role;
      set local request.jwt.claims='{"role":"service_role"}'; select ${invocation}; commit;`);
    return { data, error: null };
  } }),
});
vm.runInContext(ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, context);
async function send(event, valid = true) {
  const raw = new TextEncoder().encode(JSON.stringify(event));
  const signature = await signFakeWebhook(raw, secret, now);
  const response = await handler(new Request('https://local.invalid/webhook', { method: 'POST',
    headers: { 'stripe-signature': valid ? signature : signature.replace(/v1=./, 'v1=z') }, body: raw }));
  return { status: response.status, ...(await response.json()) };
}

test('invalid signatures and conflicting tenant/request fields stop before real RPC', async () => {
  const before = dbCalls;
  assert.equal((await send(invoice('bad_signature'), false)).status, 400);
  for (const key of ['restaurant_id', 'acceptance_id', 'request_id', 'correlation_id']) {
    const event = invoice(`conflict_${key}`); event.data.object.metadata = { [key]: randomUUID() };
    assert.equal((await send(event)).status, 400);
  }
  assert.equal(dbCalls, before);
});

test('old and parent invoice shapes preserve exact signed binding through actual RPC; unknown binding is UNMATCHED', async () => {
  for (const shape of ['legacy', 'parent']) {
    const result = await send(invoice(shape, shape));
    assert.equal(result.status, 200); assert.equal(result.code, 'UNMATCHED');
    const bound = bindings.at(-1);
    for (const [key, value] of Object.entries(metadata)) assert.equal(bound[`input_${key}`], value);
    assert.equal(bound.input_provider_subscription_id, `sub_LOCAL_${run}`);
    assert.equal(bound.input_provider_customer_id, `cus_LOCAL_${run}`);
  }
});

test('six parallel deliveries and replay retain exactly one real local receipt', async () => {
  const event = invoice('parallel');
  const results = await Promise.all(Array.from({ length: 6 }, () => send(event)));
  assert.ok(results.every(r => r.status === 200 && r.code === 'UNMATCHED'));
  assert.equal(results.filter(r => r.details.replay === false).length, 1);
  assert.equal((await send(event)).details.replay, true);
  const [row] = await sql(`select jsonb_build_object('count',count(*)) from public.basic_stripe_test_event_inbox where event_id=${quote(event.id)};`);
  assert.equal(row.count, 1);
});

test('reversed unmatched events and a foreign tenant cannot create billing authority', async () => {
  const later = invoice('later'); later.created += 1;
  const earlier = invoice('earlier'); earlier.created -= 1;
  for (const event of [later, earlier]) assert.equal((await send(event)).code, 'UNMATCHED');
  const foreign = invoice('foreign'); foreign.data.object.parent.subscription_details.metadata.restaurant_id = randomUUID();
  assert.equal((await send(foreign)).code, 'UNMATCHED');
  const [row] = await sql(`select jsonb_build_object('subscriptions',(select count(*) from public.branch_subscriptions),
    'checkouts',(select count(*) from public.basic_test_checkout_requests));`);
  assert.equal(row.subscriptions, baseline.subscriptions); assert.equal(row.checkouts, baseline.checkouts);
});

test('real RPC/table ACL and RLS remain restricted', async () => {
  const [row] = await sql(`select jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),
    'rls',(select relrowsecurity from pg_class where oid='public.basic_stripe_test_event_inbox'::regclass),
    'browser_select',has_table_privilege('authenticated','public.basic_stripe_test_event_inbox','SELECT'),
    'browser_insert',has_table_privilege('authenticated','public.basic_stripe_test_event_inbox','INSERT'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_basic_stripe_test_event';`);
  assert.deepEqual(row, { anon: false, authenticated: false, service: true, rls: true, browser_select: false, browser_insert: false });
});

test('unknown bindings fail closed for payment, failure and cancellation, including recurring metadata absence', async () => {
  // Deliberately NOT a mismatch test against a valid activated subscription.
  // Such a fixture still requires the regular Pilot/activation/provider gates.
  for (const type of ['invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted']) {
    for (const variation of ['customer', 'subscription', 'tenant', 'request', 'missing']) {
      const event = invoice('matrix_' + type.replaceAll('.', '_') + '_' + variation);
      event.type = type;
      const object = event.data.object;
      const meta = object.parent.subscription_details.metadata;
      if (type.startsWith('customer.')) {
        object.id = object.parent.subscription_details.subscription;
        object.metadata = meta;
        delete object.parent;
      }
      if (variation === 'customer') object.customer = 'cus_LOCAL_FOREIGN_' + run;
      if (variation === 'subscription') {
        if (object.parent) object.parent.subscription_details.subscription = 'sub_LOCAL_FOREIGN_' + run;
        else object.id = 'sub_LOCAL_FOREIGN_' + run;
      }
      if (variation === 'tenant') meta.restaurant_id = randomUUID();
      if (variation === 'request') meta.request_id = randomUUID();
      if (variation === 'missing') {
        object.metadata = {};
        if (object.parent) object.parent.subscription_details.metadata = {};
      }
      const before = (await sql(`select jsonb_build_object('subscriptions',(select count(*) from public.branch_subscriptions),
        'checkouts',(select count(*) from public.basic_test_checkout_requests),
        'restaurants',(select count(*) from public.restaurants));`))[0];
      const result = await send(event);
      assert.equal(result.status, 200); assert.equal(result.code, 'UNMATCHED');
      assert.equal((await send(event)).details.replay, true);
      const after = (await sql(`select jsonb_build_object('subscriptions',(select count(*) from public.branch_subscriptions),
        'checkouts',(select count(*) from public.basic_test_checkout_requests),
        'restaurants',(select count(*) from public.restaurants));`))[0];
      assert.deepEqual(after, before);
    }
  }
});

after(async () => {
  const ids = [...eventIds].map(quote).join(',');
  // Never delete immutable evidence, even in a disposable local database.
  const [receipts] = await sql(`select jsonb_build_object('count',count(*),'unmatched',bool_and(processing_status='UNMATCHED'))
    from public.basic_stripe_test_event_inbox where event_id in (${ids});`);
  assert.deepEqual(receipts, { count: 21, unmatched: true });
  const [after] = await sql(`select jsonb_build_object('restaurants',(select count(*) from public.restaurants),
    'subscriptions',(select count(*) from public.branch_subscriptions),'checkouts',(select count(*) from public.basic_test_checkout_requests),
    'events',(select count(*) from public.basic_stripe_test_event_inbox));`);
  assert.deepEqual(after, { ...baseline, events: baseline.events + 21 });
});
