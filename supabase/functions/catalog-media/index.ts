import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import jpeg from "npm:jpeg-js@0.4.4";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const bucket = "restaurant-menu-private";
const maxBytes = 10 * 1024 * 1024;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function headers(origin: string | null): Headers {
  const result = new Headers({ "cache-control": "private, no-store, max-age=0", vary: "Origin" });
  if (origin && (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
    || origin === "https://staging-app.bonus.wuxuaisbi.com"
    || origin === "https://app.bonus.wuxuaisbi.com")) {
    result.set("access-control-allow-origin", origin);
  }
  result.set("access-control-allow-methods", "POST, OPTIONS");
  result.set("access-control-allow-headers", "authorization, apikey, content-type, x-menu-action, x-restaurant-id, x-branch-id, x-file-name");
  return result;
}

function fail(code: string, status: number, origin: string | null): Response {
  console.warn("CATALOG_MEDIA_REJECTED", code, status);
  const result = headers(origin);
  result.set("content-type", "application/json");
  return new Response(JSON.stringify({ error: code }), { status, headers: result });
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1];
    while (marker === 0xff) marker = bytes[++offset + 1];
    if (marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 7) return null;
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 && width * height <= 20_000_000 ? { width, height } : null;
    }
    offset += length + 2;
  }
  return null;
}

async function validatedPageCount(bytes: Uint8Array, mime: string): Promise<number | null> {
  if (bytes.length < 16 || bytes.length > maxBytes) return null;
  if (mime === "image/jpeg") {
    const dimensions = jpegDimensions(bytes);
    if (!dimensions) return null;
    try {
      const image = jpeg.decode(bytes, { formatAsRGBA: false, maxResolutionInMP: 20, maxMemoryUsageInMB: 96 });
      return image.width === dimensions.width && image.height === dimensions.height ? 1 : null;
    } catch { return null; }
  }
  if (mime !== "application/pdf") return null;
  if (new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-") !== true) return null;
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    const count = document.getPageCount();
    return count >= 1 && count <= 50 ? count : null;
  } catch { return null; }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

async function cleanupOrphans(actorId: string, restaurantId: string, branchId: string): Promise<number> {
  const { data, error } = await admin.rpc("claim_owner_menu_orphan_cleanup", {
    input_actor_id: actorId, input_restaurant_id: restaurantId,
    input_branch_id: branchId, input_limit: 50,
  });
  if (error || data?.restaurant_id !== restaurantId || data?.branch_id !== branchId
    || !Array.isArray(data?.objects)) throw new Error("MENU_CLEANUP_CLAIM_FAILED");
  let deleted = 0;
  for (const object of data.objects) {
    if (typeof object?.path !== "string" || !uuid(object?.object_id)) {
      throw new Error("MENU_CLEANUP_CLAIM_INVALID");
    }
    if (object.missing !== true) {
      const removed = await admin.storage.from(bucket).remove([object.path]);
      if (removed.error) throw new Error("MENU_CLEANUP_STORAGE_FAILED");
    }
    const finished = await admin.rpc("finalize_owner_menu_orphan_cleanup", {
      input_actor_id: actorId, input_restaurant_id: restaurantId,
      input_branch_id: branchId, input_storage_path: object.path,
      input_object_id: object.object_id,
    });
    if (finished.error || finished.data?.deleted !== true) {
      throw new Error("MENU_CLEANUP_FINALIZE_FAILED");
    }
    deleted += 1;
  }
  return deleted;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const common = headers(origin);
  if (origin && !common.has("access-control-allow-origin")) return fail("ORIGIN_DENIED", 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: common });
  if (request.method !== "POST") return fail("METHOD_DENIED", 405, origin);
  if (!url || !serviceKey || !anonKey) return fail("SERVICE_UNAVAILABLE", 503, origin);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  const action = request.headers.get("x-menu-action");
  if (action === "upload" || action === "cleanup") {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > maxBytes) return fail("FILE_TOO_LARGE", 413, origin);
    const { data: userResult, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !userResult.user) return fail("OWNER_AUTH_REQUIRED", 401, origin);
    const restaurantId = request.headers.get("x-restaurant-id");
    const branchId = request.headers.get("x-branch-id");
    if (!uuid(restaurantId) || !uuid(branchId)) return fail("TARGET_INVALID", 400, origin);
    const owner = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: catalog, error: ownerError } = await owner.rpc("get_owner_menu_catalog", { input_restaurant_id: restaurantId });
    if (ownerError || catalog?.branch_id !== branchId) return fail("OWNER_SCOPE_DENIED", 403, origin);
    let cleaned: number;
    try { cleaned = await cleanupOrphans(userResult.user.id, restaurantId, branchId); }
    catch { return fail("CLEANUP_UNAVAILABLE", 503, origin); }
    if (action === "cleanup") {
      const output = headers(origin);
      output.set("content-type", "application/json");
      return new Response(JSON.stringify({ deleted: cleaned }), { headers: output });
    }
    const mime = request.headers.get("content-type")?.split(";")[0] ?? "";
    const body = new Uint8Array(await request.arrayBuffer());
    const pageCount = await validatedPageCount(body, mime);
    if (pageCount === null) return fail("FILE_INVALID", 400, origin);
    let filename: string;
    try { filename = decodeURIComponent(request.headers.get("x-file-name") ?? "").trim(); }
    catch { return fail("FILE_NAME_INVALID", 400, origin); }
    if (!filename || filename.length > 160) return fail("FILE_NAME_INVALID", 400, origin);
    const pageId = crypto.randomUUID();
    const path = `${restaurantId}/${branchId}/${pageId}.${mime === "image/jpeg" ? "jpg" : "pdf"}`;
    const contentHash = await sha256(body);
    const reserved = await admin.rpc("reserve_owner_menu_upload", {
      input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
      input_branch_id: branchId, input_page_id: pageId, input_storage_path: path,
      input_mime_type: mime, input_byte_size: body.length,
      input_content_sha256: contentHash, input_page_count: pageCount,
    });
    if (reserved.error || reserved.data?.reserved !== true) return fail("UPLOAD_QUOTA_OR_SCOPE_DENIED", 403, origin);
    const release = async () => {
      const result = await admin.rpc("release_owner_menu_upload_reservation", {
        input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
        input_branch_id: branchId, input_storage_path: path,
      });
      if (result.error) console.warn("CATALOG_MEDIA_RESERVATION_PENDING");
    };
    if (request.signal.aborted) { await release(); return fail("UPLOAD_ABORTED", 499, origin); }
    const { error: storageError } = await admin.storage.from(bucket).upload(path, body, {
      contentType: mime, upsert: false, cacheControl: "0",
    });
    if (storageError) {
      // A definite client-side Storage rejection did not create an object.
      // A server/transport error is ambiguous: keep its reservation charged
      // until the guarded reconciliation grace has elapsed.
      if ([400, 413, 415].includes(Number(storageError.statusCode))) await release();
      return fail("UPLOAD_FAILED", 500, origin);
    }
    if (request.signal.aborted) {
      const removed = await admin.storage.from(bucket).remove([path]);
      if (!removed.error) await release();
      return fail("UPLOAD_ABORTED", 499, origin);
    }
    const { data, error } = await admin.rpc("register_owner_menu_upload", {
      input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
      input_branch_id: branchId, input_page_id: pageId, input_storage_path: path,
      input_mime_type: mime, input_byte_size: body.length,
      input_content_sha256: contentHash, input_filename: filename,
      input_page_count: pageCount,
    });
    if (error || data?.page_id !== pageId || !Number.isInteger(data?.draft_revision)) {
      // A lost RPC response does not prove that the transaction rolled back.
      // Claim the exact unregistered object under DB locks before deletion.
      const reconciled = await admin.rpc("claim_owner_menu_failed_upload", {
        input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
        input_branch_id: branchId, input_page_id: pageId,
        input_storage_path: path, input_content_sha256: contentHash,
      });
      if (reconciled.error) return fail("REGISTER_OUTCOME_UNKNOWN", 503, origin);
      if (reconciled.data?.state === "REGISTERED"
        && reconciled.data?.page_id === pageId
        && Number.isInteger(reconciled.data?.draft_revision)) {
        const output = headers(origin);
        output.set("content-type", "application/json");
        return new Response(JSON.stringify({ page_id: pageId,
          draft_revision: reconciled.data.draft_revision }), { headers: output });
      }
      if (reconciled.data?.state !== "CLAIMED" || !uuid(reconciled.data?.object_id)) {
        return fail("REGISTER_OUTCOME_UNKNOWN", 503, origin);
      }
      const removed = await admin.storage.from(bucket).remove([path]);
      if (removed.error) return fail("REGISTER_CLEANUP_PENDING", 503, origin);
      const finalized = await admin.rpc("finalize_owner_menu_orphan_cleanup", {
        input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
        input_branch_id: branchId, input_storage_path: path,
        input_object_id: reconciled.data.object_id,
      });
      if (finalized.error || finalized.data?.deleted !== true) {
        return fail("REGISTER_CLEANUP_PENDING", 503, origin);
      }
      return fail("REGISTER_FAILED", 503, origin);
    }
    const output = headers(origin);
    output.set("content-type", "application/json");
    return new Response(JSON.stringify({ page_id: data.page_id, draft_revision: data.draft_revision }), { headers: output });
  }
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return fail("REQUEST_INVALID", 400, origin); }
  let resolved: { available?: boolean; path?: string; mime_type?: string; sha256?: string } | null = null;
  if (input.kind === "owner" && uuid(input.restaurantId) && uuid(input.pageId)) {
    const { data: userResult, error } = await admin.auth.getUser(bearer);
    if (error || !userResult.user) return fail("OWNER_AUTH_REQUIRED", 401, origin);
    const result = await admin.rpc("resolve_owner_menu_object_path", {
      input_actor_id: userResult.user.id,
      input_restaurant_id: input.restaurantId, input_page_id: input.pageId,
    });
    if (result.error) return fail("READ_DENIED", 403, origin);
    resolved = result.data;
  } else if (input.kind === "customer" && typeof input.slug === "string"
    && typeof input.token === "string" && uuid(input.pageId) && Number.isInteger(input.version)) {
    const result = await admin.rpc("resolve_customer_menu_object_path", {
      input_restaurant_slug: input.slug, input_customer_token: input.token,
      input_page_id: input.pageId, input_version: input.version,
    });
    if (result.error) return fail("READ_DENIED", 403, origin);
    resolved = result.data;
  } else return fail("REQUEST_INVALID", 400, origin);
  if (!resolved?.available || !resolved.path || !["image/jpeg", "application/pdf"].includes(resolved.mime_type ?? "")) {
    return fail("READ_DENIED", 403, origin);
  }
  const { data: object, error: storageError } = await admin.storage.from(bucket).download(resolved.path);
  if (storageError || !object) return fail("FILE_UNAVAILABLE", 404, origin);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256(bytes) !== resolved.sha256) return fail("FILE_HASH_MISMATCH", 409, origin);
  const output = headers(origin);
  output.set("content-type", resolved.mime_type!);
  output.set("x-content-type-options", "nosniff");
  output.set("content-disposition", "inline");
  return new Response(bytes, { headers: output });
});
