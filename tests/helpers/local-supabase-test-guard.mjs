import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXPECTED_PROJECT_ID = "wuxuai-phase7b4d-local";
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const ALLOWED_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function guardError(message) {
  return new Error(`LOCAL_SUPABASE_TEST_GUARD: ${message}`);
}
function readTomlString(configText, key) {
  const match = configText.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  if (!match) throw guardError(`missing ${key} in supabase/config.toml`);
  return match[1];
}

function readTomlSectionInteger(configText, section, key) {
  let activeSection = "";
  for (const rawLine of configText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      activeSection = sectionMatch[1];
      continue;
    }
    if (activeSection !== section) continue;
    const valueMatch = line.match(new RegExp(`^${key}\\s*=\\s*(\\d+)\\s*$`));
    if (valueMatch) return Number(valueMatch[1]);
  }
  throw guardError(`missing [${section}].${key} in supabase/config.toml`);
}

function parseConnectionUrl(connectionUrl) {
  if (!connectionUrl) throw guardError("database URL is required");
  let parsed;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    throw guardError("database URL is invalid");
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) throw guardError("database protocol must be postgres or postgresql");
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw guardError("database host must be loopback");
  if (!parsed.port) throw guardError("database port must be explicit");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database !== "postgres" && !/^wuxuai_7b4c_[a-z_]+$/.test(database)) {
    throw guardError("database name is outside the Phase 7B.4D scope");
  }
  return { database, parsed };
}

export function validateLocalSupabaseTestTarget({ allowFlag, configText, connectionUrl, status }) {
  if (allowFlag !== "1") throw guardError("ALLOW_LOCAL_SUPABASE_TESTS=1 is required");
  const projectId = readTomlString(configText, "project_id");
  if (projectId !== EXPECTED_PROJECT_ID) throw guardError("unexpected local Supabase project_id");
  const configuredPort = readTomlSectionInteger(configText, "db", "port");
  if (configuredPort === 55439) throw guardError("reserved port 55439 is forbidden");

  const target = parseConnectionUrl(connectionUrl);
  if (Number(target.parsed.port) !== configuredPort) throw guardError("database port does not match supabase/config.toml");

  if (!status || typeof status.DB_URL !== "string") throw guardError("npx supabase status did not return DB_URL");
  const active = parseConnectionUrl(status.DB_URL);
  if (active.database !== "postgres") throw guardError("active Supabase status must identify the postgres database");
  if (Number(active.parsed.port) !== configuredPort) throw guardError("active Supabase DB port does not match supabase/config.toml");

  return Object.freeze({
    database: target.database,
    host: target.parsed.hostname,
    password: decodeURIComponent(target.parsed.password),
    port: String(configuredPort),
    protocol: target.parsed.protocol,
    username: decodeURIComponent(target.parsed.username || "postgres"),
  });
}

export function loadVerifiedLocalSupabaseTestTarget({ env = process.env, rootUrl }) {
  const configText = readFileSync(new URL("supabase/config.toml", rootUrl), "utf8");
  const statusOutput = execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
    cwd: new URL(".", rootUrl),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  let status;
  try {
    status = JSON.parse(statusOutput);
  } catch {
    throw guardError("npx supabase status returned invalid JSON");
  }
  return validateLocalSupabaseTestTarget({
    allowFlag: env.ALLOW_LOCAL_SUPABASE_TESTS,
    configText,
    connectionUrl: env.WUXUAI_7B4D_LOCAL_DATABASE_URL,
    status,
  });
}
