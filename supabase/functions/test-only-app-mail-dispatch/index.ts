import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import nodemailer from "npm:nodemailer@6.9.16";

const PROJECT_REF = "mbgveqbhessaunrhfudm";
const BACKEND_URL = `https://${PROJECT_REF}.supabase.co`;
const AUTH_ISSUER = `${BACKEND_URL}/auth/v1`;
const APP_ORIGIN = "https://staging-v2.bonus.wuxuaisbi.com";
const EVENT_TYPE = "TEST_ONLY_APP_MAIL_SMOKE";
const EVENT_VERSION = 1;
const CONTENT_SHA256 = "1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb";
const LOCAL_FROM = "test-only@wuxuai.invalid";
const LOCAL_REPLY_TO = "noreply@wuxuai.invalid";
const SUBJECT = "[TEST_ONLY] WUXUAI Staging-v2 App-Mail";
const TEXT = "TEST_ONLY – synthetischer Staging-v2-App-Mailnachweis.\n\n"
  + "Dieses Ereignis ist kein Angebot, keine Aktivierung und keine reale Kundenkommunikation.\n\n"
  + `Projekt: ${PROJECT_REF}\nOrigin: ${APP_ORIGIN}\nVertrag: ${EVENT_TYPE}/v${EVENT_VERSION}`;
const HTML = `<!doctype html><html lang="de"><body><h1>TEST_ONLY</h1><p>Synthetischer `
  + "Staging-v2-App-Mailnachweis.</p><p>Dieses Ereignis ist kein Angebot, keine Aktivierung "
  + `und keine reale Kundenkommunikation.</p><p>Projekt: ${PROJECT_REF}<br>Origin: ${APP_ORIGIN}`
  + `<br>Vertrag: ${EVENT_TYPE}/v${EVENT_VERSION}</p></body></html>`;

type TestRequest = {
  mode: "single_recipient_test";
  event_type: typeof EVENT_TYPE;
  event_version: 1;
  content_sha256: typeof CONTENT_SHA256;
  binding_id: string;
  request_id: string;
  synthetic_test: true;
};

type ReservedDelivery = {
  delivery_id: string;
  event_type: typeof EVENT_TYPE;
  event_version: 1;
  content_sha256: typeof CONTENT_SHA256;
  email: string;
  deterministic_message_id: string;
  attempt_count: 1;
};

const mode = Deno.env.get("TEST_ONLY_APP_MAIL_MODE") ?? "paused";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const schedulerSecret = Deno.env.get("TEST_ONLY_APP_MAIL_SCHEDULER_SECRET") ?? "";
const runtimeProjectRef = Deno.env.get("TEST_ONLY_APP_MAIL_PROJECT_REF") ?? "";
const runtimeIssuer = Deno.env.get("WUXUAI_AUTH_ISSUER") ?? "";
const runtimeOrigin = Deno.env.get("WUXUAI_APP_ORIGIN") ?? "";
const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "";
const smtpHost = Deno.env.get("SMTP_HOST") ?? "";
const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "1025");
const smtpUsername = Deno.env.get("SMTP_USERNAME") ?? "";
const smtpPassword = Deno.env.get("SMTP_PASSWORD") ?? "";
const smtpFromEmail = (Deno.env.get("SMTP_FROM_EMAIL") ?? "").trim().toLowerCase();
const smtpReplyTo = (Deno.env.get("SMTP_REPLY_TO") ?? "").trim().toLowerCase();
const expectedSmtpHostSha256 = (Deno.env.get("TEST_ONLY_APP_MAIL_SMTP_HOST_SHA256") ?? "").toLowerCase();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return difference === 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseRequest(value: unknown): TestRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  const expected = [
    "binding_id", "content_sha256", "event_type", "event_version",
    "mode", "request_id", "synthetic_test",
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (body.mode !== "single_recipient_test" || body.event_type !== EVENT_TYPE
    || body.event_version !== EVENT_VERSION || body.content_sha256 !== CONTENT_SHA256
    || body.synthetic_test !== true || !isUuid(body.binding_id) || !isUuid(body.request_id)) return null;
  return body as TestRequest;
}

function localSmtpHostAllowed(host: string) {
  return host === "127.0.0.1" || host === "localhost" || host === "host.docker.internal"
    || host === "mailpit" || host === "inbucket" || /^supabase_inbucket_[a-z0-9_-]+$/.test(host);
}

async function environmentReady() {
  const computedContentSha256 = await sha256(JSON.stringify({
    subject: SUBJECT,
    text: TEXT,
    html: HTML,
  }));
  if (runtimeProjectRef !== PROJECT_REF || runtimeIssuer !== AUTH_ISSUER || runtimeOrigin !== APP_ORIGIN
    || !supabaseUrl || !serviceRoleKey || !schedulerSecret
    || computedContentSha256 !== CONTENT_SHA256
    || !smtpHost || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) return false;
  if (mode === "local_catcher") {
    return localSmtpHostAllowed(smtpHost) && smtpFromEmail === LOCAL_FROM
      && smtpReplyTo === LOCAL_REPLY_TO && !smtpUsername && !smtpPassword
      && (/^https?:\/\/(?:127\.0\.0\.1|localhost|host\.docker\.internal)(?::\d+)?$/.test(supabaseUrl)
        || supabaseUrl === "http://kong:8000");
  }
  if (mode === "hosted_single_recipient") {
    return supabaseUrl === BACKEND_URL
      && new RegExp(`^${PROJECT_REF}_[0-9a-f-]{36}_[0-9]+$`).test(deploymentId)
      && Boolean(smtpUsername && smtpPassword && smtpFromEmail && smtpReplyTo)
      && expectedSmtpHostSha256.length === 64
      && await secureEqual(await sha256(smtpHost.trim().toLowerCase()), expectedSmtpHostSha256);
  }
  return false;
}

function safeErrorCode(error: unknown) {
  const candidate = error && typeof error === "object"
    ? String((error as Record<string, unknown>).code ?? (error as Record<string, unknown>).name ?? "PROVIDER_OUTCOME_UNKNOWN")
    : "PROVIDER_OUTCOME_UNKNOWN";
  return candidate.toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 120)
    || "PROVIDER_OUTCOME_UNKNOWN";
}

function logResult(event: string, deliveryId?: string, detail?: string) {
  console.info(JSON.stringify({
    event,
    delivery_ref: deliveryId?.slice(0, 8) ?? null,
    detail: detail ?? null,
  }));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!await environmentReady()) return json({ error: "test_only_app_mail_not_configured" }, 503);
  if (!await secureEqual(
    request.headers.get("x-wuxuai-test-only-app-mail-secret") ?? "",
    schedulerSecret,
  )) return json({ error: "not_authorized" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "request_invalid" }, 400); }
  const testRequest = parseRequest(body);
  if (!testRequest) return json({ error: "test_only_contract_required" }, 403);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: serverBinding, error: bindingError } = await service.rpc("get_server_project_binding");
  if (bindingError || !serverBinding
    || serverBinding.project_ref !== PROJECT_REF || serverBinding.backend_url !== BACKEND_URL
    || serverBinding.auth_issuer !== AUTH_ISSUER || serverBinding.app_origin !== APP_ORIGIN) {
    return json({ error: "project_binding_required" }, 503);
  }

  const { data: enqueued, error: enqueueError } = await service.rpc("enqueue_test_only_app_mail", {
    input_binding_id: testRequest.binding_id,
    input_request_id: testRequest.request_id,
    input_event_version: EVENT_VERSION,
    input_content_sha256: CONTENT_SHA256,
  });
  if (enqueueError || !enqueued?.delivery_id) return json({ error: "test_event_rejected" }, 409);

  const { data: reservedRows, error: reserveError } = await service.rpc("reserve_test_only_app_mail", {
    input_request_id: testRequest.request_id,
  });
  if (reserveError) return json({ error: "test_event_reservation_failed" }, 500);
  const deliveries = (reservedRows ?? []) as ReservedDelivery[];
  if (deliveries.length === 0) {
    const { data: result } = await service.rpc("get_test_only_app_mail_result", {
      input_request_id: testRequest.request_id,
    });
    return json({ processed: 0, replay: true, status: result?.status ?? null });
  }
  if (deliveries.length !== 1) return json({ error: "test_event_cardinality_violation" }, 500);
  const delivery = deliveries[0];
  if (delivery.event_type !== EVENT_TYPE || delivery.event_version !== EVENT_VERSION
    || delivery.content_sha256 !== CONTENT_SHA256 || delivery.attempt_count !== 1) {
    return json({ error: "test_event_snapshot_mismatch" }, 409);
  }

  const transporter = nodemailer.createTransport(mode === "local_catcher" ? {
    host: smtpHost,
    port: smtpPort,
    secure: false,
    ignoreTLS: true,
  } : {
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: { user: smtpUsername, pass: smtpPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });

  // This is the final database check. No rendering, lookup or other await is
  // allowed between this result and the dedicated provider handoff.
  const { data: beginRows, error: beginError } = await service.rpc(
    "begin_test_only_app_mail_delivery", { input_delivery_id: delivery.delivery_id },
  );
  const authorization = Array.isArray(beginRows) ? beginRows[0] : beginRows;
  if (beginError || authorization?.authorized !== true) {
    logResult("test_only_app_mail_blocked", delivery.delivery_id,
      String(authorization?.reason_code ?? "FINAL_RECHECK_FAILED"));
    return json({ processed: 1, handed_over: 0, reason: "final_recheck_blocked" }, 409);
  }

  try {
    const provider = await transporter.sendMail({
      from: { name: "WUXUAI® Bonus TEST_ONLY", address: smtpFromEmail },
      replyTo: smtpReplyTo,
      to: delivery.email,
      subject: SUBJECT,
      text: TEXT,
      html: HTML,
      messageId: delivery.deterministic_message_id,
    });
    const accepted = Array.isArray(provider.accepted)
      && provider.accepted.some((value) => String(value).toLowerCase() === delivery.email.toLowerCase());
    const providerMessageId = typeof provider.messageId === "string" && provider.messageId.trim()
      ? provider.messageId.trim() : delivery.deterministic_message_id;
    const { data: completed, error: completionError } = await service.rpc(
      "complete_test_only_app_mail_delivery", {
        input_delivery_id: delivery.delivery_id,
        input_outcome: accepted ? "ACCEPTED" : "UNKNOWN",
        input_provider_message_id: providerMessageId,
        input_error_code: accepted ? null : "PROVIDER_ACCEPTANCE_UNCONFIRMED",
      },
    );
    if (completionError || completed !== true) {
      logResult("test_only_app_mail_completion_uncertain", delivery.delivery_id,
        "DELIVERY_COMPLETION_UNCONFIRMED");
      return json({ processed: 1, handed_over: accepted ? 1 : 0, uncertain: true }, 502);
    }
    logResult(accepted ? "test_only_app_mail_accepted" : "test_only_app_mail_unknown",
      delivery.delivery_id);
    return json({ processed: 1, handed_over: accepted ? 1 : 0, uncertain: !accepted });
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await service.rpc("complete_test_only_app_mail_delivery", {
      input_delivery_id: delivery.delivery_id,
      input_outcome: "UNKNOWN",
      input_provider_message_id: delivery.deterministic_message_id,
      input_error_code: errorCode,
    });
    logResult("test_only_app_mail_unknown", delivery.delivery_id, errorCode);
    return json({ processed: 1, handed_over: 0, uncertain: true }, 502);
  }
});
