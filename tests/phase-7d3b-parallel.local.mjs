import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const dbContainer = "supabase_db_wuxuai-phase7d3b-isolated";
async function sql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", dbContainer, "psql", "-U", "postgres",
      "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", () => undefined);
    child.on("error", () => reject(new Error("D3B_LOCAL_DATABASE_STAGE_FAILED")));
    child.on("close", (code) => code === 0
      ? resolve(output.trim().split("\n").filter(Boolean).at(-1) ?? "")
      : reject(new Error("D3B_LOCAL_DATABASE_STAGE_FAILED")));
    child.stdin.end(input);
  });
}

const source = readFileSync(new URL("phase-7d3b-secure-redemption.local.sql", import.meta.url), "utf8");
const setup = source.split("do $check$")[0]
  .replaceAll("redemption_fixture", "d3b_parallel_fixture")
  .replace("create temporary table d3b_parallel_fixture", "create table public.d3b_parallel_fixture") + "\ncommit;";
await sql(setup);
if (process.env.D3B_SETUP_ONLY === "1") {
  console.log("D3B_LOCAL_SYNTHETIC_FIXTURE_CREATED");
  process.exit(0);
}

const fields = (await sql("select owner_id,staff_id,customer_user_id,restaurant_id,branch_id,customer_id,reward_id from public.d3b_parallel_fixture;")).split("|");
const [owner, staff, customer, restaurant, branch, customerId, reward] = fields;
for (const field of fields) assert.match(field, /^[0-9a-f-]{36}$/);
const restaurantSlug = `d3b-${restaurant.slice(0, 12)}`;
const uuid = () => randomUUID();
const call = async (actor, payload) => {
  const text = JSON.stringify({ request_id: uuid(), correlation_id: payload.correlation_id ?? uuid(),
    idempotency_key: uuid(), ...payload });
  const query = `begin; set local role service_role;
    select set_config('request.jwt.claim.role','service_role',true);
    select public.secure_redemption_edge_mutate('${actor}'::uuid,$payload$${text}$payload$::jsonb);
    commit;`;
  try {
    return JSON.parse(await sql(query));
  } catch {
    return { success: false, blocked: true };
  }
};
const start = async () => {
  const result = await call(customer, { action: "start", restaurant_slug: restaurantSlug,
    source_type: "points", entitlement_id: reward });
  assert.equal(result.status, "REQUESTED");
  return result;
};
const rotate = await call(owner, { action: "rotate_pin", restaurant_slug: restaurantSlug });
assert.match(rotate.pin, /^\d{6}$/);

const staffRequest = await start();
const staffResults = await Promise.all(Array.from({ length: 24 }, () => call(staff,
  { action: "approve", redemption_id: staffRequest.redemption_id,
    correlation_id: staffRequest.correlation_id })));
assert.equal(staffResults.filter((item) => item.success && !item.already_confirmed).length, 1);
assert.equal((await sql(`select count(*) from public.reward_redemption_events
  where customer_id='${customerId}' and reward_id='${reward}'`)), "1");

const pinRequest = await start();
const verified = await call(customer, { action: "verify_pin", redemption_id: pinRequest.redemption_id,
  correlation_id: pinRequest.correlation_id, pin: rotate.pin });
assert.equal(verified.status, "PIN_VERIFIED");
const pinResults = await Promise.all(Array.from({ length: 24 }, () => call(customer,
  { action: "swipe", redemption_id: pinRequest.redemption_id,
    correlation_id: pinRequest.correlation_id })));
assert.equal(pinResults.filter((item) => item.success && !item.already_confirmed).length, 1);

const mixedRequest = await start();
const mixedResults = await Promise.all(Array.from({ length: 24 }, (_, index) => index % 2 === 0
  ? call(staff, { action: "approve", redemption_id: mixedRequest.redemption_id,
    correlation_id: mixedRequest.correlation_id })
  : (async () => {
    const proof = await call(customer, { action: "verify_pin", redemption_id: mixedRequest.redemption_id,
      correlation_id: mixedRequest.correlation_id, pin: rotate.pin });
    return proof.success ? call(customer, { action: "swipe", redemption_id: mixedRequest.redemption_id,
      correlation_id: mixedRequest.correlation_id }) : { success: false };
  })()));
assert.equal(mixedResults.filter((item) => item.success && !item.already_confirmed).length, 1);
assert.equal((await sql(`select points_balance from public.customers where id='${customerId}'`)), "700");
assert.equal((await sql(`select count(*) from public.reward_redemption_events
  where customer_id='${customerId}' and reward_id='${reward}'`)), "3");
assert.equal((await sql(`select count(*) from public.secure_redemption_requests
  where customer_id='${customerId}' and status='REDEEMED'`)), "3");
const limitedRequest = await start();
const wrongPin = rotate.pin === "000000" ? "000001" : "000000";
await Promise.all(Array.from({ length: 24 }, () => call(customer,
  { action: "verify_pin", redemption_id: limitedRequest.redemption_id,
    correlation_id: limitedRequest.correlation_id, pin: wrongPin })));
assert.equal((await sql(`select failed_pin_attempts from public.secure_redemption_requests
  where id='${limitedRequest.redemption_id}'`)), "5");
assert.equal((await sql(`select count(*) from public.secure_redemption_pin_attempts
  where redemption_id='${limitedRequest.redemption_id}'`)), "5");
console.log("D3B_24_STAFF_24_PIN_24_MIXED_ONE_REDEMPTION_AND_24_WRONG_ATTEMPTS_LIMITED_TO_5_PASS");
