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

async function validate(bytes: Uint8Array, mime: string): Promise<boolean> {
  if (bytes.length < 16 || bytes.length > maxBytes) return false;
  if (mime === "image/jpeg") {
    const dimensions = jpegDimensions(bytes);
    if (!dimensions) return false;
    try {
      const image = jpeg.decode(bytes, { formatAsRGBA: false, maxResolutionInMP: 20, maxMemoryUsageInMB: 96 });
      return image.width === dimensions.width && image.height === dimensions.height;
    } catch { return false; }
  }
  if (mime !== "application/pdf") return false;
  if (new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-") !== true) return false;
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    return document.getPageCount() >= 1 && document.getPageCount() <= 50;
  } catch { return false; }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const common = headers(origin);
  if (origin && !common.has("access-control-allow-origin")) return fail("ORIGIN_DENIED", 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: common });
  if (request.method !== "POST") return fail("METHOD_DENIED", 405, origin);
  if (!url || !serviceKey || !anonKey) return fail("SERVICE_UNAVAILABLE", 503, origin);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  const upload = request.headers.get("x-menu-action") === "upload";
  if (upload) {
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
    const mime = request.headers.get("content-type")?.split(";")[0] ?? "";
    const body = new Uint8Array(await request.arrayBuffer());
    if (!(await validate(body, mime))) return fail("FILE_INVALID", 400, origin);
    let filename: string;
    try { filename = decodeURIComponent(request.headers.get("x-file-name") ?? "").trim(); }
    catch { return fail("FILE_NAME_INVALID", 400, origin); }
    if (!filename || filename.length > 160) return fail("FILE_NAME_INVALID", 400, origin);
    const pageId = crypto.randomUUID();
    const path = `${restaurantId}/${branchId}/${pageId}.${mime === "image/jpeg" ? "jpg" : "pdf"}`;
    const { error: storageError } = await admin.storage.from(bucket).upload(path, body, {
      contentType: mime, upsert: false, cacheControl: "0",
    });
    if (storageError) return fail("UPLOAD_FAILED", 500, origin);
    const { data, error } = await admin.rpc("register_owner_menu_upload", {
      input_actor_id: userResult.user.id, input_restaurant_id: restaurantId,
      input_branch_id: branchId, input_page_id: pageId, input_storage_path: path,
      input_mime_type: mime, input_byte_size: body.length,
      input_content_sha256: await sha256(body), input_filename: filename,
    });
    if (error) {
      await admin.storage.from(bucket).remove([path]);
      return fail("REGISTER_FAILED", 403, origin);
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
