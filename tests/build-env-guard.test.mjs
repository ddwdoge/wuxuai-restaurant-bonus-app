import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  missingRequiredBuildEnvironment,
  validateRequiredBuildEnvironment,
} from "../scripts/validate-build-env.mjs";

const scriptPath = new URL("../scripts/validate-build-env.mjs", import.meta.url);

test("Build-Guard verlangt beide Supabase-Variablen ohne Werte auszugeben", () => {
  assert.deepEqual(missingRequiredBuildEnvironment({}), ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
  assert.deepEqual(missingRequiredBuildEnvironment({ VITE_SUPABASE_URL: "https://staging.example" }), ["VITE_SUPABASE_ANON_KEY"]);
  assert.doesNotThrow(() => validateRequiredBuildEnvironment({
    VITE_SUPABASE_URL: "https://staging.example",
    VITE_SUPABASE_ANON_KEY: "test-public-key",
  }));
});

test("Build-Guard beendet einen Build ohne Pflichtvariablen vor Vite", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(scriptPath)], {
    encoding: "utf8",
    env: {},
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_SUPABASE_URL/);
  assert.match(result.stderr, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(result.stderr, /eyJ|service_role|sb_secret/i);
});

test("Repository-Build startet immer mit dem Fail-Closed-Guard", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts.build, /^node scripts\/validate-build-env\.mjs && /);
});
