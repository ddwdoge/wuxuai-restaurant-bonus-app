import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261009131212_offer_email_confirmation_delivery.sql");
const requestEdge = await read("../supabase/functions/customer-offer-email-request/index.ts");
const worker = await read("../supabase/functions/customer-offer-email-confirmation-dispatch/index.ts");
const config = await read("../supabase/config.toml");
const { runOfferEmailConfirmationDelivery } = await import(
  "../supabase/functions/_shared/offerEmailConfirmationDelivery.mjs");

function body(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${name} has no complete body`);
  return migration.slice(start, end);
}

test("dedicated outbox retains history and never stores a raw link secret", () => {
  assert.match(migration, /create table public\.customer_offer_email_confirmation_outbox/);
  assert.match(migration, /request_id uuid primary key references public\.customer_offer_email_request_receipts/);
  assert.match(migration, /drop constraint customer_offer_email_tokens_offer_email_request_id_key/);
  assert.match(migration, /where used_at is null/);
  assert.doesNotMatch(migration, /\b(token|link|recipient_email)\s+text\s*[,\n]/i);
  assert.doesNotMatch(migration, /insert into public\.platform_legal_document_versions/i);
});

test("service-only claim mints a token, final recheck precedes irreversible handoff", () => {
  const claim = body("claim_customer_offer_email_confirmation_delivery");
  const begin = body("begin_customer_offer_email_confirmation_delivery");
  const complete = body("complete_customer_offer_email_confirmation_delivery");
  assert.match(claim, /for update skip locked limit 1/);
  assert.match(claim, /status='PENDING' or[\s\S]*status='CLAIMED'/);
  assert.match(claim, /offer_email_confirmation_delivery_valid_internal/);
  assert.match(claim, /extensions\.gen_random_bytes\(32\)/);
  assert.match(claim, /public\.hash_public_token\(raw_token\)/);
  assert.match(begin, /delivery\.claim_id is distinct from input_claim_id/);
  assert.match(begin, /offer_email_confirmation_delivery_valid_internal/);
  assert.match(begin, /set status='SUBMITTING'/);
  assert.match(complete, /status='SUBMITTING'/);
  assert.match(complete, /'ACCEPTED' else 'UNKNOWN'/);
  assert.doesNotMatch(claim, /SUBMITTING'\s+and/i);
  for (const name of [
    "claim_customer_offer_email_confirmation_delivery",
    "begin_customer_offer_email_confirmation_delivery",
    "complete_customer_offer_email_confirmation_delivery",
  ]) {
    assert.match(body(name), /auth\.role\(\) is distinct from 'service_role'/);
  }
});

test("current identity, tenant, PRO, session and document hash gate delivery", () => {
  const gate = body("offer_email_confirmation_delivery_valid_internal");
  for (const required of [
    /receipt\.document_version_id=document_row\.id/,
    /receipt\.document_version=document_row\.version/,
    /receipt\.document_sha256=document_row\.content_sha256/,
    /account\.auth_user_id=receipt\.auth_user_id/,
    /join auth\.sessions s/,
    /m\.restaurant_id=consent\.restaurant_id/,
    /m\.customer_id=consent\.customer_id/,
    /b\.id=customer\.branch_id and b\.restaurant_id=r\.id/,
    /consent\.pending_offer_email_request_id=receipt\.request_id/,
    /restaurant_entitlement_enabled\(consent\.restaurant_id,'offer_notifications'\)/,
  ]) assert.match(gate, required);
  const request = body("request_authenticated_customer_offer_email_confirmation_v2");
  assert.match(request, /update public\.customer_offer_email_tokens set used_at=clock_timestamp\(\)/);
  assert.match(request, /status in \('PENDING','CLAIMED'\)/);
  assert.match(request, /customer_offer_email_confirmation_outbox/);
  assert.match(request, /interval '24 hours'/);
});

test("browser response is generic; scheduler cannot reach any general queue", () => {
  assert.match(requestEdge, /request_authenticated_customer_offer_email_confirmation_v2/);
  assert.match(requestEdge, /return reply\(\{ accepted: true \}, 202, origin\)/);
  assert.doesNotMatch(requestEdge, /input_confirmation_token|sendMail|SMTP_|customer-offer-email-local-test/);
  assert.match(worker, /OFFER_EMAIL_CONFIRMATION_SCHEDULER_SECRET/);
  assert.match(worker, /OFFER_EMAIL_CONFIRMATION_MODE/);
  assert.match(worker, /mode !== "enabled"/);
  assert.match(worker, /claim_customer_offer_email_confirmation_delivery/);
  assert.match(worker, /begin_customer_offer_email_confirmation_delivery/);
  assert.match(worker, /complete_customer_offer_email_confirmation_delivery/);
  assert.match(worker, /runOfferEmailConfirmationDelivery/);
  assert.doesNotMatch(worker, /reserve_customer_transactional_email|reserve_customer_offer_email_delivery|claim_customer_transactional_email/);
  assert.match(config, /\[functions\.customer-offer-email-confirmation-dispatch\]\s*\nverify_jwt = false/);
});

test("confirmation link is registry-bound before claim and rechecked before handoff", () => {
  assert.match(worker, /import \{ requireProjectBinding \} from "\.\.\/_shared\/projectBinding\.mjs"/);
  assert.doesNotMatch(worker, /APP_BASE_URL|configuredAppOrigin|staging-app\.bonus/);
  assert.match(worker, /new URL\("\/customer\/email\/confirm", binding\.app_origin\)/);
  assert.ok(worker.indexOf("binding = await requireProjectBinding(service, runtime)")
    < worker.indexOf('"claim_customer_offer_email_confirmation_delivery"'));
  assert.match(worker, /current\.binding_id !== binding\.binding_id/);
  assert.match(worker, /current\.app_origin !== binding\.app_origin/);
  assert.ok(worker.indexOf("const current = await requireProjectBinding(service, runtime)")
    < worker.indexOf('"begin_customer_offer_email_confirmation_delivery"'));
  assert.doesNotMatch(worker, /request\.json\(|request\.url|headers\.get\("origin"\)/);
});

test("isolated worker adapter never touches other queues and delivers at most once", async () => {
  const calls = [];
  const delivery = { claimed: true, request_id: "synthetic-request", token: "synthetic-token" };
  const components = {
    claim: async () => { calls.push("claim-confirmation-only"); return delivery; },
    prepare: () => { calls.push("prepare"); return { synthetic: true }; },
    begin: async () => { calls.push("final-recheck"); return true; },
    deliver: async () => { calls.push("capture-only"); return true; },
    complete: async () => { calls.push("complete"); return true; },
  };
  assert.deepEqual(await runOfferEmailConfirmationDelivery(components),
    { claimed: 1, handed_over: 1, uncertain: false });
  assert.deepEqual(calls,
    ["claim-confirmation-only", "prepare", "final-recheck", "capture-only", "complete"]);
  assert.deepEqual(await runOfferEmailConfirmationDelivery({
    ...components, claim: async () => ({ claimed: false }),
  }), { claimed: 0, handed_over: 0 });
  assert.equal(calls.filter((call) => call === "capture-only").length, 1);
});

test("revocation, timeout and uncertain provider result do not retry handoff", async () => {
  const delivery = { claimed: true, request_id: "synthetic-request" };
  let handoffs = 0;
  const base = {
    claim: async () => delivery,
    prepare: () => ({}),
    begin: async () => true,
    deliver: async () => { handoffs += 1; return true; },
    complete: async () => true,
  };
  assert.deepEqual(await runOfferEmailConfirmationDelivery({
    ...base, begin: async () => false,
  }), { claimed: 1, handed_over: 0, reason: "final_recheck_blocked" });
  assert.equal(handoffs, 0);
  let completionCalls = 0;
  assert.deepEqual(await runOfferEmailConfirmationDelivery({
    ...base,
    deliver: async () => { handoffs += 1; throw Error("unknown provider outcome"); },
    complete: async (_delivery, accepted) => {
      assert.equal(accepted, false);
      completionCalls += 1;
      return true;
    },
  }), { claimed: 1, handed_over: 0, uncertain: true });
  assert.equal(handoffs, 1);
  assert.equal(completionCalls, 1);
  assert.deepEqual(await runOfferEmailConfirmationDelivery({
    ...base, complete: async () => false,
  }), { claimed: 1, handed_over: 1, uncertain: true });
  assert.equal(handoffs, 2);
});

test("outbox and RPCs deny browser EXECUTE and direct table rights", () => {
  assert.match(migration, /alter table public\.customer_offer_email_confirmation_outbox enable row level security/);
  assert.match(migration, /revoke all on public\.customer_offer_email_confirmation_outbox\s+from public,anon,authenticated,service_role/);
  for (const name of [
    "request_authenticated_customer_offer_email_confirmation_v2",
    "claim_customer_offer_email_confirmation_delivery",
    "begin_customer_offer_email_confirmation_delivery",
    "complete_customer_offer_email_confirmation_delivery",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.match(migration, /revoke all on function public\.offer_email_confirmation_delivery_valid_internal\(uuid\)\s+from public,anon,authenticated,service_role/);
});
