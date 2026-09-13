// Read-only scanner for the explicit Phase 6 source/report evidence package.
// Reports categories and filenames only; never prints matched credential data.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const rules = [
  ["private-key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["jwt", /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],
  ["github-credential", /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,})/],
  ["service-credential", /(?:sk_live_|rk_live_|sb_secret_)[A-Za-z0-9_-]{12,}/],
  ["aws-credential", /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ["credential-assignment", /(?:password|passwd|client_secret|access_token|refresh_token|service_role_key|cloudflare_api_token)\s*[:=]\s*["'][^"'\s{}]{8,}["']/i],
  ["connection-string", /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+/i],
  ["password-in-url", /https?:\/\/[^\s/:]+:[^\s/@]+@/i],
  ["recovery-url", /https?:\/\/[^\s"'<>]*(?:[?&#](?:access_token|refresh_token|token_hash|recovery_token|code)=)[A-Za-z0-9_%.-]{12,}/i],
];
const forbidden = /(?:^|\/)(?:node_modules|dist|build|\.git|\.env(?:\.[^/]*)?)(?:\/|$)|\.(?:log|zip)$/i;
const args = process.argv.slice(2);
let entries;
if (args[0] === "--zip") {
  if (args.length !== 2) throw new Error("Expected one evidence ZIP");
  const list = spawnSync("unzip", ["-Z1", args[1]], { encoding: "utf8" });
  if (list.status !== 0) throw new Error("Cannot read ZIP directory");
  entries = list.stdout.trim().split("\n").filter((name) => !name.endsWith("/")).map((name) => {
    const result = spawnSync("unzip", ["-p", args[1], name], { maxBuffer: 16_000_000 });
    if (result.status !== 0) throw new Error("Cannot read ZIP member");
    return [name, result.stdout];
  });
} else {
  entries = args.map((name) => [name, readFileSync(name)]);
}
if (!entries.length) throw new Error("Explicit evidence files required");
const findings = [];
for (const [name, buffer] of entries) {
  if (forbidden.test(name)) findings.push({ file: name, category: "forbidden-artifact" });
  const content = buffer.toString("utf8");
  for (const [category, pattern] of rules) if (pattern.test(content)) findings.push({ file: name, category });
}
console.log(JSON.stringify({ filesScanned: entries.length, findings, status: findings.length ? "FAIL" : "PASS" }, null, 2));
process.exitCode = findings.length ? 1 : 0;
