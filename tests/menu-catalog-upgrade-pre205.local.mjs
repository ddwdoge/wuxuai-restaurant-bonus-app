import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const api = "http://127.0.0.1:56121";
const publicKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
assert.ok(publicKey?.startsWith("sb_publishable_"));
assert.ok(serviceKey);
const owner = createClient(api, publicKey, { auth: { persistSession: false } });
const service = createClient(api, serviceKey, { auth: { persistSession: false } });
const signup = await owner.auth.signUp({
  email: `menu-upgrade-${randomBytes(8).toString("hex")}@example.invalid`,
  password: randomBytes(32).toString("hex"),
});
assert.ifError(signup.error);
const created = await owner.rpc("start_restaurant_owner_trial", {
  input_owner_name: "Synthetic Menu Upgrade Owner",
  input_restaurant_name: "WUXUAI TEST MENU 205 UPGRADE",
  input_phone: null, input_country: "AT",
});
assert.ifError(created.error);
assert.equal(created.data.subscription.status, "pending_activation");
const restaurant = created.data.restaurant.id;
const branch = created.data.restaurant.branch_id;
const pageId = randomUUID();
const path = `${restaurant}/${branch}/${pageId}.jpg`;
const playwright = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE || "playwright");
const browser = await playwright.chromium.launch({ headless: true });
let jpeg;
try {
  const page = await browser.newPage();
  jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    canvas.getContext("2d").fillRect(0, 0, 32, 32);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }), "base64");
} finally { await browser.close(); }
assert.ifError((await service.storage.from("restaurant-menu-private").upload(path, jpeg, {
  contentType: "image/jpeg", upsert: false,
})).error);
const registered = await service.rpc("register_owner_menu_upload", {
  input_actor_id: signup.data.user.id, input_restaurant_id: restaurant,
  input_branch_id: branch, input_page_id: pageId, input_storage_path: path,
  input_mime_type: "image/jpeg", input_byte_size: jpeg.length,
  input_content_sha256: createHash("sha256").update(jpeg).digest("hex"),
  input_filename: "pre205.jpg",
});
assert.ifError(registered.error);
console.log("MENU_PRE205_FIXTURE_PASS real_owner=1 existing_draft=1 existing_storage=1");
