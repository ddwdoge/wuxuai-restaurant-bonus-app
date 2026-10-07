import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const api = "http://127.0.0.1:56121";
const publicKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
assert.ok(publicKey?.startsWith("sb_publishable_"));
assert.ok(serviceKey);
const service = createClient(api, serviceKey, { auth: { persistSession: false } });
const sql = (statement) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "56122", "-U", "postgres",
  "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement],
{ encoding: "utf8", env: process.env }).trim();
const count = (query) => Number(sql(`select count(*) from ${query}`));

async function makeOwner() {
  const client = createClient(api, publicKey, { auth: { persistSession: false } });
  const signup = await client.auth.signUp({
    email: `menu-errors-${randomBytes(8).toString("hex")}@example.invalid`,
    password: randomBytes(32).toString("hex"),
  });
  assert.ifError(signup.error);
  const created = await client.rpc("start_restaurant_owner_trial", {
    input_owner_name: "Synthetic Menu Owner", input_restaurant_name: "WUXUAI TEST MENU ERRORS",
    input_phone: null, input_country: "AT",
  });
  assert.ifError(created.error);
  assert.equal(created.data.subscription.status, "pending_activation");
  const session = (await client.auth.getSession()).data.session;
  assert.ok(session?.access_token);
  return { client, actor: signup.data.user.id, token: session.access_token,
    restaurant: created.data.restaurant.id, branch: created.data.restaurant.branch_id };
}
const owner = await makeOwner();
const foreign = await makeOwner();
const bucket = "restaurant-menu-private";
const prefix = `${owner.restaurant}/${owner.branch}/`;
const upload = (bytes, mime, name, token = owner.token, restaurant = owner.restaurant, branch = owner.branch) =>
  fetch(`${api}/functions/v1/catalog-media`, { method: "POST", headers: {
    authorization: `Bearer ${token}`, apikey: publicKey, "x-menu-action": "upload",
    "x-restaurant-id": restaurant, "x-branch-id": branch,
    "x-file-name": name, "x-page-count": "1", "content-type": mime,
  }, body: bytes });
const cleanup = () => fetch(`${api}/functions/v1/catalog-media`, { method: "POST", headers: {
  authorization: `Bearer ${owner.token}`, apikey: publicKey, "x-menu-action": "cleanup",
  "x-restaurant-id": owner.restaurant, "x-branch-id": owner.branch,
} });

function makePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Contents 6 0 R >>",
    "<< /Length 0 >>\nstream\nendstream",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}
const browserModule = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE || "playwright");
const browser = await browserModule.chromium.launch({ headless: true });
let jpeg;
try {
  const page = await browser.newPage();
  jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    canvas.getContext("2d").fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }), "base64");
} finally { await browser.close(); }

const pdf = makePdf();
const pdfResult = await upload(pdf, "application/pdf", "two-pages.pdf");
assert.equal(pdfResult.status, 200, `real two-page PDF upload: ${pdfResult.status}`);
const pdfPage = (await pdfResult.json()).page_id;
const pdfPath = `${prefix}${pdfPage}.pdf`;
assert.equal(sql(`select p.value->>'page_count' from public.restaurant_menu_catalogs c,
  lateral jsonb_array_elements(c.draft_pages) p where c.restaurant_id='${owner.restaurant}'
  and p.value->>'id'='${pdfPage}'`), "2", "false client page hint cannot override actual PDF pages");
const committedReadback = await service.rpc("claim_owner_menu_failed_upload", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_page_id: pdfPage,
  input_storage_path: pdfPath,
  input_content_sha256: createHash("sha256").update(pdf).digest("hex"),
});
assert.ifError(committedReadback.error);
assert.equal(committedReadback.data?.state, "REGISTERED", "lost response resolves to committed receipt");
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name='${pdfPath}'`), 1);
// Publication holds Catalog first. A concurrent Restaurant lock must make
// its capacity guard fail promptly, not wait while cleanup needs Catalog.
const blocker = spawn("psql", ["-h", "127.0.0.1", "-p", "56122", "-U", "postgres",
  "-d", "postgres", "-X", "-q", "-c", `begin;
  select 1 from public.restaurants where id='${owner.restaurant}' for update;
  select pg_sleep(3); commit;`], { env: process.env, stdio: "ignore" });
try {
  let sleeping = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (count(`pg_stat_activity where query like '%pg_sleep(3)%'
      and state='active' and pid<>pg_backend_pid()`)>0) { sleeping = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(sleeping, "local Restaurant lock holder is active");
  const start = Date.now();
  assert.throws(() => sql(`update public.restaurant_menu_catalogs
    set published_pages=draft_pages, published_at=clock_timestamp(),
      published_version=1,published_hash='${"a".repeat(64)}'
    where restaurant_id='${owner.restaurant}'`),
  "concurrent publication must reject instead of deadlocking");
  assert.ok(Date.now()-start<2500, "NOWAIT rejects before the competing lock releases");
  assert.equal(count(`public.restaurant_menu_catalogs where restaurant_id='${owner.restaurant}'
    and published_at is not null`), 0);
} finally {
  await new Promise((resolve) => blocker.once("close", resolve));
}
assert.ok((await service.rpc("claim_owner_menu_failed_upload", {
  input_actor_id: foreign.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_page_id: pdfPage,
  input_storage_path: pdfPath,
  input_content_sha256: createHash("sha256").update(pdf).digest("hex"),
})).error, "foreign actor cannot reconcile another tenant's upload");
const beforeInvalid = count(`public.restaurant_menu_upload_reservations where restaurant_id='${owner.restaurant}'`);
assert.equal((await upload(Buffer.from("%PDF-1.4 invalid"), "application/pdf", "invalid.pdf")).status, 400);
assert.equal(count(`public.restaurant_menu_upload_reservations where restaurant_id='${owner.restaurant}'`), beforeInvalid);
assert.equal((await upload(jpeg, "image/jpeg", "foreign.jpg", foreign.token)).status, 403);
const directStorage = await owner.client.storage.from(bucket).upload(`${prefix}${randomUUID()}.jpg`, jpeg,
  { contentType: "image/jpeg", upsert: false });
assert.ok(directStorage.error, "owner cannot bypass Edge reservation through Storage API");
assert.ok((await owner.client.storage.from(bucket).download(pdfPath)).error,
  "direct owner read cannot bypass the gateway");
const directList = await owner.client.storage.from(bucket).list(`${owner.restaurant}/${owner.branch}`);
assert.ok(directList.error || directList.data?.length === 0,
  "direct owner listing reveals no private menu objects");
await owner.client.storage.from(bucket).remove([pdfPath]);
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name='${pdfPath}'`), 1);
const draftRevision = Number(sql(`select draft_revision from public.restaurant_menu_catalogs
  where restaurant_id='${owner.restaurant}'`));
assert.ifError((await owner.client.rpc("remove_owner_menu_draft_page", {
  input_restaurant_id: owner.restaurant, input_branch_id: owner.branch,
  input_page_id: pdfPage, input_expected_draft_revision: draftRevision,
})).error);
sql(`update storage.objects set created_at=now()-interval '2 hours'
  where bucket_id='${bucket}' and name='${pdfPath}'`);
assert.equal((await cleanup()).status, 200);
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name='${pdfPath}'`), 1,
  "registered file is retained after draft removal regardless of age");

// Local-only fault: Storage rejects JPEG after DB reservation; no product guard or trigger is disabled.
const releasedBefore = count(`public.restaurant_menu_upload_reservations where restaurant_id='${owner.restaurant}' and released_at is not null`);
try {
  sql(`update storage.buckets set allowed_mime_types=array['application/pdf']
    where id='${bucket}'`);
  assert.equal((await upload(jpeg, "image/jpeg", "storage-failure.jpg")).status, 500);
} finally {
  sql(`update storage.buckets set allowed_mime_types=array['image/jpeg','application/pdf']
    where id='${bucket}'`);
}
assert.equal(count(`public.restaurant_menu_upload_reservations where restaurant_id='${owner.restaurant}'
  and released_at is not null`), releasedBefore + 1);
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name like '${prefix}%'`), 1);

// Local-only fault: expire the exact synthetic reservation as Storage commits.
// Edge must fail registration, delete its just-uploaded object and release the claim.
const faultFunction = `create function public.menu_upload_test_expire() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.bucket_id='${bucket}' and new.name like '${prefix}%' then
   update public.restaurant_menu_upload_reservations set expires_at=clock_timestamp()-interval '1 second'
   where storage_path=new.name and registered_at is null;
 end if;
 return new;
end $$`;
try {
  sql(faultFunction);
  sql(`create trigger menu_upload_test_expire_after_insert after insert on storage.objects
    for each row execute function public.menu_upload_test_expire()`);
  assert.equal((await upload(jpeg, "image/jpeg", "register-failure.jpg")).status, 503);
} finally {
  sql("drop trigger if exists menu_upload_test_expire_after_insert on storage.objects");
  sql("drop function if exists public.menu_upload_test_expire()");
}
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name like '${prefix}%'`), 1);
assert.equal(count(`public.restaurant_menu_upload_reservations where restaurant_id='${owner.restaurant}'
  and released_at is not null`), releasedBefore + 2);
assert.equal((await upload(jpeg, "image/jpeg", "retry.jpg")).status, 200,
  "retry after post-upload rollback succeeds with new reservation");

// An expired, unresolved reservation remains charged; its path is not reusable.
const timeoutId = randomUUID();
const timeoutPath = `${prefix}${timeoutId}.jpg`;
const hash = createHash("sha256").update(jpeg).digest("hex");
const reservationRequest = {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_page_id: timeoutId,
  input_storage_path: timeoutPath, input_mime_type: "image/jpeg",
  input_byte_size: jpeg.length, input_content_sha256: hash, input_page_count: 1,
};
assert.ifError((await service.rpc("reserve_owner_menu_upload", reservationRequest)).error);
sql(`update public.restaurant_menu_upload_reservations set expires_at=clock_timestamp()-interval '1 second'
  where storage_path='${timeoutPath}'`);
assert.ok((await service.rpc("reserve_owner_menu_upload", reservationRequest)).error,
  "expired path cannot be re-reserved");
assert.ifError((await service.storage.from(bucket).upload(timeoutPath, jpeg,
  { contentType: "image/jpeg", upsert: false })).error);
const late = await service.rpc("register_owner_menu_upload", {
  ...reservationRequest, input_filename: "late.jpg",
});
assert.ok(late.error, "late registration cannot consume an expired reservation");
sql(`update storage.objects set created_at=now()-interval '2 hours'
  where bucket_id='${bucket}' and name='${timeoutPath}'`);
assert.equal((await cleanup()).status, 200);
assert.equal(count(`storage.objects where bucket_id='${bucket}' and name='${timeoutPath}'`), 0);
assert.ok((await service.rpc("register_owner_menu_upload", {
  ...reservationRequest, input_filename: "late.jpg",
})).error, "claimed/deleted path cannot register late");
assert.equal(count(`public.restaurant_menu_catalogs where restaurant_id='${foreign.restaurant}'`), 0);
const interruptedId = randomUUID();
const interruptedPath = `${prefix}${interruptedId}.jpg`;
assert.ifError((await service.rpc("reserve_owner_menu_upload", {
  ...reservationRequest, input_page_id: interruptedId,
  input_storage_path: interruptedPath,
})).error);
assert.ifError((await service.storage.from(bucket).upload(interruptedPath, jpeg,
  { contentType: "image/jpeg", upsert: false })).error);
sql(`update storage.objects set created_at=now()-interval '2 hours'
  where bucket_id='${bucket}' and name='${interruptedPath}'`);
const interruptedClaim = await service.rpc("claim_owner_menu_orphan_cleanup", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_limit: 50,
});
assert.ifError(interruptedClaim.error);
assert.ok(interruptedClaim.data?.objects?.some((item) => item.path === interruptedPath));
assert.ifError((await service.storage.from(bucket).remove([interruptedPath])).error);
const recovered = await cleanup();
assert.equal(recovered.status, 200, "missing-object claim can be finalized on retry");
assert.equal((await recovered.json()).deleted, 1);
assert.equal(count(`public.restaurant_menu_storage_cleanup_claims
  where storage_path='${interruptedPath}' and deleted_at is not null`), 1);
const raceId = randomUUID();
const racePath = `${prefix}${raceId}.jpg`;
const raceRequest = { ...reservationRequest, input_page_id: raceId,
  input_storage_path: racePath };
assert.ifError((await service.rpc("reserve_owner_menu_upload", raceRequest)).error);
assert.ifError((await service.storage.from(bucket).upload(racePath, jpeg,
  { contentType: "image/jpeg", upsert: false })).error);
const raceClaim = await service.rpc("claim_owner_menu_failed_upload", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_page_id: raceId,
  input_storage_path: racePath, input_content_sha256: hash,
});
assert.ifError(raceClaim.error);
assert.equal(raceClaim.data?.state, "CLAIMED");
const finalizeRace = () => service.rpc("finalize_owner_menu_orphan_cleanup", {
  input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
  input_branch_id: owner.branch, input_storage_path: racePath,
  input_object_id: raceClaim.data.object_id,
});
assert.ok((await finalizeRace()).error, "present object prevents premature finalization");
assert.ifError((await service.storage.from(bucket).remove([racePath])).error);
const raceResults = await Promise.all([
  ...Array.from({ length: 6 }, finalizeRace),
  ...Array.from({ length: 6 }, () => service.rpc("claim_owner_menu_failed_upload", {
    input_actor_id: owner.actor, input_restaurant_id: owner.restaurant,
    input_branch_id: owner.branch, input_page_id: raceId,
    input_storage_path: racePath, input_content_sha256: hash,
  })),
]);
assert.ok(raceResults.every((result) => !result.error),
  "parallel finalization and reconciliation avoid deadlock");
assert.equal(count(`public.restaurant_menu_storage_cleanup_claims
  where storage_path='${racePath}' and deleted_at is not null`), 1);
const reservationPaths = [];
const fileClaims = await Promise.all(Array.from({ length: 50 }, () => {
  const id = randomUUID();
  const path = `${foreign.restaurant}/${foreign.branch}/${id}.jpg`;
  reservationPaths.push(path);
  return service.rpc("reserve_owner_menu_upload", {
    input_actor_id: foreign.actor, input_restaurant_id: foreign.restaurant,
    input_branch_id: foreign.branch, input_page_id: id, input_storage_path: path,
    input_mime_type: "image/jpeg", input_byte_size: 1,
    input_content_sha256: createHash("sha256").update(path).digest("hex"), input_page_count: 1,
  });
}));
assert.equal(fileClaims.filter((item) => !item.error).length, 50);
sql(`update public.restaurant_menu_upload_reservations
  set expires_at=clock_timestamp()-interval '1 second'
  where storage_path='${reservationPaths[0]}'`);
const extraId = randomUUID();
const extraRequest = {
  input_actor_id: foreign.actor, input_restaurant_id: foreign.restaurant,
  input_branch_id: foreign.branch, input_page_id: extraId,
  input_storage_path: `${foreign.restaurant}/${foreign.branch}/${extraId}.jpg`,
  input_mime_type: "image/jpeg", input_byte_size: 1,
  input_content_sha256: "a".repeat(64), input_page_count: 1,
};
assert.ok((await service.rpc("reserve_owner_menu_upload", extraRequest)).error,
  "file 51 stays rejected while expired upload outcome is unresolved");
sql(`update public.restaurant_menu_upload_reservations
  set expires_at=clock_timestamp()-interval '2 hours'
  where storage_path='${reservationPaths[0]}'`);
assert.ifError((await service.rpc("claim_owner_menu_orphan_cleanup", {
  input_actor_id: foreign.actor, input_restaurant_id: foreign.restaurant,
  input_branch_id: foreign.branch, input_limit: 1,
})).error);
assert.equal(count(`public.restaurant_menu_upload_reservations
  where storage_path='${reservationPaths[0]}' and released_at is not null`), 1);
assert.ifError((await service.rpc("reserve_owner_menu_upload", extraRequest)).error,
  "proven idle absent-object reservation releases capacity after grace");
console.log("MENU_UPLOAD_ERRORS_PASS real_owner=2 pdf_actual_pages=2 invalid=1 direct_storage_rwld_denied=1 registered_file_retained=1 lock_inversion_nowait=1 storage_failure_release=1 post_upload_rollback=1 committed_readback=1 missing_claim_retry=1 parallel_finalize_claim=1 retry=1 timeout=1 late_registration=1 file_50_51=1 expiry_interleave=1 grace_release=1 foreign=1");
