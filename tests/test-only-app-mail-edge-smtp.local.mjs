// Opt-in Deno Edge + Mailpit proof. All HTTP and SMTP endpoints are loopback-only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_APP_MAIL_SMTP, "1");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionDir = resolve(root, "supabase/functions/test-only-app-mail-dispatch");
const edgeName = "wuxuai-test-only-app-mail-edge";
const mailpitName = "wuxuai-test-only-mailpit";
const edgePort = 56150;
const rpcPort = 56149;
const smtpPort = 1026;
const mailpitPort = 8026;
const secret = `${randomUUID()}${randomUUID()}`;
const projectRef = "mbgveqbhessaunrhfudm";
const origin = "https://staging-v2.bonus.wuxuaisbi.com";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const eventType = "TEST_ONLY_APP_MAIL_SMOKE";
const contentSha256 = "1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb";
const recipient = "synthetic-mail-recipient@example.invalid";

const run = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  ...options,
}).trim();
const removeContainer = (name) => {
  try { run(["rm", "-f", name]); } catch { /* exact local test container may not exist */ }
};
const waitFor = async (probe, attempts = 600) => {
  for (let index = 0; index < attempts; index += 1) {
    try { if (await probe()) return; } catch { /* not ready */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("LOCAL_RUNTIME_NOT_READY");
};

let state;
const freshState = () => ({
  bindingId: randomUUID(),
  deliveryId: randomUUID(),
  requestId: null,
  status: null,
  outcome: null,
  providerMessageId: null,
  errorCode: null,
  rpcCalls: [],
  completeCalls: 0,
});
const rpcServer = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch { /* invalid */ }
  const name = request.url?.split("/").at(-1) ?? "";
  state.rpcCalls.push(name);
  const send = (value, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(value));
  };
  if (request.method !== "POST") return send({ message: "method" }, 405);
  if (name === "get_server_project_binding") return send({
    project_ref: projectRef,
    backend_url: `https://${projectRef}.supabase.co`,
    auth_issuer: issuer,
    app_origin: origin,
  });
  if (name === "enqueue_test_only_app_mail") {
    if (body.input_binding_id !== state.bindingId || body.input_event_version !== 1
      || body.input_content_sha256 !== contentSha256) return send({ message: "binding" }, 409);
    if (state.requestId && state.requestId !== body.input_request_id) return send({ message: "single event" }, 409);
    const created = !state.requestId;
    state.requestId = body.input_request_id;
    state.status ??= "PENDING";
    return send({ delivery_id: state.deliveryId, created, replay: !created, status: state.status });
  }
  if (name === "reserve_test_only_app_mail") {
    if (body.input_request_id !== state.requestId || state.status !== "PENDING") return send([]);
    state.status = "RESERVED";
    return send([{
      delivery_id: state.deliveryId,
      event_type: eventType,
      event_version: 1,
      content_sha256: contentSha256,
      email: recipient,
      deterministic_message_id: `<wuxuai-test-only-${state.deliveryId}@wuxuai.invalid>`,
      attempt_count: 1,
    }]);
  }
  if (name === "begin_test_only_app_mail_delivery") {
    if (body.input_delivery_id !== state.deliveryId || state.status !== "RESERVED") {
      return send([{ authorized: false, reason_code: "DELIVERY_NOT_RESERVED" }]);
    }
    state.status = "SUBMITTING";
    return send([{ authorized: true, reason_code: null }]);
  }
  if (name === "complete_test_only_app_mail_delivery") {
    state.completeCalls += 1;
    if (body.input_delivery_id !== state.deliveryId) return send(false);
    if (state.outcome) return send(state.outcome === body.input_outcome
      && state.providerMessageId === body.input_provider_message_id
      && state.errorCode === body.input_error_code);
    if (state.status !== "SUBMITTING") return send(false);
    state.outcome = body.input_outcome;
    state.providerMessageId = body.input_provider_message_id;
    state.errorCode = body.input_error_code;
    state.status = body.input_outcome;
    return send(true);
  }
  if (name === "get_test_only_app_mail_result") return send({
    delivery_id: state.deliveryId,
    status: state.status,
    event_type: eventType,
    event_version: 1,
    content_sha256: contentSha256,
    deterministic_message_id: `<wuxuai-test-only-${state.deliveryId}@wuxuai.invalid>`,
    attempt_count: state.requestId ? 1 : 0,
    provider_receipt_count: state.outcome ? 1 : 0,
    audit_count: state.outcome ? 4 : 0,
    provider_outcome: state.outcome,
  });
  return send({ message: "unknown rpc" }, 404);
});

function startEdge(targetSmtpPort) {
  removeContainer(edgeName);
  run([
    "run", "--rm", "-d", "--pull=never", "--name", edgeName,
    "-p", `127.0.0.1:${edgePort}:9000`,
    "--add-host", "host.docker.internal:host-gateway",
    "-e", "TEST_ONLY_APP_MAIL_MODE=local_catcher",
    "-e", `SUPABASE_URL=http://host.docker.internal:${rpcPort}`,
    "-e", "SUPABASE_SERVICE_ROLE_KEY=local-service-role",
    "-e", `TEST_ONLY_APP_MAIL_SCHEDULER_SECRET=${secret}`,
    "-e", `TEST_ONLY_APP_MAIL_PROJECT_REF=${projectRef}`,
    "-e", `WUXUAI_AUTH_ISSUER=${issuer}`,
    "-e", `WUXUAI_APP_ORIGIN=${origin}`,
    "-e", "SMTP_HOST=host.docker.internal",
    "-e", `SMTP_PORT=${targetSmtpPort}`,
    "-e", "SMTP_FROM_EMAIL=test-only@wuxuai.invalid",
    "-e", "SMTP_REPLY_TO=noreply@wuxuai.invalid",
    "-v", `${functionDir}:/home/deno/functions/test-only-app-mail-dispatch:ro`,
    "public.ecr.aws/supabase/edge-runtime:v1.74.3",
    "start", "--main-service", "/home/deno/functions/test-only-app-mail-dispatch", "--policy", "per_worker",
  ]);
}

const post = async (body, headerSecret = secret) => {
  const response = await fetch(`http://127.0.0.1:${edgePort}/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wuxuai-test-only-app-mail-secret": headerSecret,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const requestBody = () => ({
  mode: "single_recipient_test",
  event_type: eventType,
  event_version: 1,
  content_sha256: contentSha256,
  binding_id: state.bindingId,
  request_id: randomUUID(),
  synthetic_test: true,
});
const mailpitMessages = async () => (await fetch(`http://127.0.0.1:${mailpitPort}/api/v1/messages`)).json();

let acceptedLogs = "";
let unknownLogs = "";
try {
  removeContainer(edgeName);
  removeContainer(mailpitName);
  run([
    "run", "--rm", "-d", "--pull=never", "--name", mailpitName,
    "-p", `127.0.0.1:${smtpPort}:1025`, "-p", `127.0.0.1:${mailpitPort}:8025`,
    "public.ecr.aws/supabase/mailpit:v1.30.2",
  ]);
  await new Promise((resolveListen, rejectListen) => rpcServer.listen(rpcPort, "127.0.0.1", (error) => (
    error ? rejectListen(error) : resolveListen()
  )));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${mailpitPort}/api/v1/messages`)).ok);

  state = freshState();
  startEdge(smtpPort);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${edgePort}/`)).status === 405);
  const body = requestBody();

  const unauthorized = await post(body, "wrong-secret");
  assert.equal(unauthorized.status, 401);
  assert.equal(state.rpcCalls.length, 0);
  const recipientInjection = await post({ ...body, recipient_email: "other@example.invalid" });
  assert.equal(recipientInjection.status, 403);
  assert.equal(state.rpcCalls.length, 0);

  const parallel = await Promise.all(Array.from({ length: 8 }, () => post(body)));
  assert.equal(parallel.filter((result) => result.status === 200 && result.body.handed_over === 1).length, 1);
  assert.equal(parallel.filter((result) => result.body.replay === true).length, 7);
  assert.equal(state.status, "ACCEPTED");
  assert.equal(state.completeCalls, 1);
  assert.equal(state.rpcCalls.filter((name) => name === "begin_test_only_app_mail_delivery").length, 1);

  await waitFor(async () => (await mailpitMessages()).total === 1);
  const list = await mailpitMessages();
  assert.equal(list.total, 1);
  const message = list.messages[0];
  assert.equal(message.Subject, "[TEST_ONLY] WUXUAI Staging-v2 App-Mail");
  assert.match(JSON.stringify(message.To), new RegExp(recipient.replaceAll(".", "\\.")));
  assert.match(JSON.stringify(message), new RegExp(state.deliveryId));
  const detail = await (await fetch(`http://127.0.0.1:${mailpitPort}/api/v1/message/${message.ID}`)).json();
  assert.match(detail.Text, /TEST_ONLY – synthetischer Staging-v2-App-Mailnachweis/);
  assert.match(detail.Text, new RegExp(projectRef));
  assert.match(detail.HTML, /kein Angebot, keine Aktivierung/);
  assert.match(JSON.stringify(detail), /test-only@wuxuai\.invalid/);

  const replay = await post(body);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replay, true);
  assert.equal((await mailpitMessages()).total, 1);
  acceptedLogs = run(["logs", edgeName]);
  assert.doesNotMatch(acceptedLogs, new RegExp(recipient, "i"));
  assert.doesNotMatch(acceptedLogs, new RegExp(secret, "i"));

  // A provider connection failure is terminal UNKNOWN. Replaying the identical
  // event cannot reserve or hand off a second attempt.
  removeContainer(edgeName);
  state = freshState();
  startEdge(19_999);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${edgePort}/`)).status === 405);
  const unknownBody = requestBody();
  const unknown = await post(unknownBody);
  assert.equal(unknown.status, 502);
  assert.equal(unknown.body.uncertain, true);
  assert.equal(state.status, "UNKNOWN");
  assert.equal(state.completeCalls, 1);
  const unknownReplay = await post(unknownBody);
  assert.equal(unknownReplay.status, 200);
  assert.equal(unknownReplay.body.replay, true);
  assert.equal(state.completeCalls, 1);
  assert.equal((await mailpitMessages()).total, 1);
  unknownLogs = run(["logs", edgeName]);
  assert.doesNotMatch(unknownLogs, new RegExp(recipient, "i"));
  assert.doesNotMatch(unknownLogs, new RegExp(secret, "i"));

  const runtimeVersion = run([
    "run", "--rm", "--pull=never", "public.ecr.aws/supabase/edge-runtime:v1.74.3", "--version",
  ]);
  assert.match(runtimeVersion, /deno 2\.1\.4/);
  console.log(JSON.stringify({
    status: "LOCAL_TEST_ONLY_APP_MAIL_DENO_SMTP_PASS",
    deno: "2.1.4",
    accepted_messages: 1,
    parallel_requests: 8,
    replay_messages_added: 0,
    unknown_retry_messages_added: 0,
    external_delivery: 0,
  }));
} finally {
  try { acceptedLogs ||= run(["logs", edgeName]); } catch { /* container may not exist */ }
  removeContainer(edgeName);
  removeContainer(mailpitName);
  await new Promise((resolveClose) => rpcServer.close(() => resolveClose()));
}
