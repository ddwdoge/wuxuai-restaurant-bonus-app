import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const api = "http://127.0.0.1:56121";
const publicKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
assert.ok(publicKey?.startsWith("sb_publishable_"));
assert.ok(serviceKey);
const service = createClient(api, serviceKey, { auth: { persistSession: false } });
const sql = (statement) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "56122", "-U", "postgres",
  "-d", "postgres", "-X", "-q", "-A", "-t", "-c", statement],
{ encoding: "utf8", env: process.env }).trim();
const makeOwner = async () => {
  const client = createClient(api, publicKey, { auth: { persistSession: false } });
  const email = `menu-reservation-${randomBytes(8).toString("hex")}@example.invalid`;
  const signup = await client.auth.signUp({ email, password: randomBytes(32).toString("hex") });
  assert.ifError(signup.error);
  const created = await client.rpc("start_restaurant_owner_trial", {
    input_owner_name: "Synthetic Menu Owner", input_restaurant_name: "WUXUAI TEST MENU RESERVATION",
    input_phone: null, input_country: "AT",
  });
  assert.ifError(created.error);
  assert.equal(created.data.subscription.status, "pending_activation");
  return { client, actor: signup.data.user.id, restaurant: created.data.restaurant.id,
    branch: created.data.restaurant.branch_id };
};
const reserve = (owner, pageId = randomUUID(), bytes = 10 * 1024 * 1024) => {
  const path = `${owner.restaurant}/${owner.branch}/${pageId}.jpg`;
  return { path, pageId, promise: service.rpc("reserve_owner_menu_upload", {
    input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
    input_branch_id: owner.branch, input_page_id: pageId, input_storage_path: path,
    input_mime_type: "image/jpeg", input_byte_size: bytes,
    input_content_sha256: createHash("sha256").update(path).digest("hex"), input_page_count: 1,
  }) };
};
const release = (owner, path) => service.rpc("release_owner_menu_upload_reservation", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_storage_path: path,
});

const owner = await makeOwner();
const foreign = await makeOwner();
assert.equal(sql(`select public.resolve_restaurant_entitlements_internal('${owner.restaurant}')->>'reason_code'`),
  "PENDING_ACTIVATION");
const attempts = Array.from({ length: 12 }, () => reserve(owner));
const results = await Promise.all(attempts.map((item) => item.promise));
const granted = attempts.filter((_, index) => !results[index].error);
assert.equal(granted.length, 5, "parallel 10 MiB claims cannot exceed 50 MiB");
assert.equal(sql(`select count(*) from public.restaurant_menu_upload_reservations
  where restaurant_id='${owner.restaurant}' and released_at is null`), "5");
const denied = await reserve(owner).promise;
assert.ok(denied.error, "full byte quota fails before Storage write");
const session = (await owner.client.auth.getSession()).data.session;
assert.ok(session?.access_token);
const playwright = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE || "playwright");
const browser = await playwright.chromium.launch({ headless: true });
let jpeg;
try {
  const page = await browser.newPage();
  jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    canvas.getContext("2d").fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }), "base64");
} finally { await browser.close(); }
const upload = () => fetch(`${api}/functions/v1/catalog-media`, {
  method: "POST", headers: {
    authorization: `Bearer ${session.access_token}`, apikey: publicKey,
    "x-menu-action": "upload", "x-restaurant-id": owner.restaurant,
    "x-branch-id": owner.branch, "x-file-name": "synthetic.jpg", "content-type": "image/jpeg",
  }, body: jpeg,
});
assert.equal((await upload()).status, 403, "Edge must not upload when reservation fails");
assert.equal(sql(`select count(*) from storage.objects where bucket_id='restaurant-menu-private'
  and name like '${owner.restaurant}/${owner.branch}/%'`), "0");
const crossRelease = await release(foreign, granted[0].path);
assert.ok(crossRelease.error, "foreign actor cannot release another tenant's claim");
for (const item of granted) assert.equal((await release(owner, item.path)).data.released, true);
const successfulUpload = await upload();
assert.equal(successfulUpload.status, 200, `upload after release: ${successfulUpload.status}`);
const uploaded = await successfulUpload.json();
assert.equal(sql(`select count(*) from public.restaurant_menu_upload_reservations
  where restaurant_id='${owner.restaurant}' and page_id='${uploaded.page_id}'
    and registered_at is not null and released_at is null`), "1");
assert.equal(sql(`select count(*) from public.restaurant_menu_catalogs c,
  lateral jsonb_array_elements(c.draft_pages) p where c.restaurant_id='${owner.restaurant}'
    and p->>'id'='${uploaded.page_id}'`), "1");

const anonymous = createClient(api, publicKey, { auth: { persistSession: false } });
const direct = await anonymous.rpc("reserve_owner_menu_upload", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_page_id: randomUUID(), input_storage_path: "invalid",
  input_mime_type: "image/jpeg", input_byte_size: 1,
  input_content_sha256: "0".repeat(64), input_page_count: 1,
});
assert.ok(direct.error, "browser cannot execute the service-only reservation RPC");
assert.equal(sql(`select has_table_privilege('authenticated','public.restaurant_menu_upload_reservations','SELECT')`), "f");
assert.equal(sql(`select has_function_privilege('authenticated',
  'public.reserve_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,integer)','EXECUTE')`), "f");
assert.equal(sql(`select has_function_privilege('service_role',
  'public.reserve_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,integer)','EXECUTE')`), "t");
console.log("MENU_UPLOAD_RESERVATION_PASS real_owner=2 parallel=12 granted=5 edge_quota=1 released_upload=1 atomic_register=1 foreign=1 acl=1");
