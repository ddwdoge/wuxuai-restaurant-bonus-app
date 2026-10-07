import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/functions/catalog-media/index.ts", import.meta.url), "utf8");

test("retired catalog-media endpoint rejects every method without credentials or storage access", () => {
  assert.match(source, /Deno\.serve\(\(\) => new Response/);
  assert.match(source, /status: 410/);
  assert.match(source, /CATALOG_V1_DISABLED/);
  assert.doesNotMatch(source, /createClient|\.storage\.|\.rpc\(|SUPABASE_SERVICE_ROLE_KEY/);
});
