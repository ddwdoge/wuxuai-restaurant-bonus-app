import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/functions/catalog-media/index.ts", import.meta.url), "utf8");

test("catalog media allows only local and exact WUXUAI app origins", () => {
  assert.match(source, /origin === "https:\/\/staging-app\.bonus\.wuxuaisbi\.com"/);
  assert.match(source, /origin === "https:\/\/app\.bonus\.wuxuaisbi\.com"/);
  assert.match(source, /\^http:\\\/\\\/\(127/);
  assert.doesNotMatch(source, /\[\^\/\]\+\\\.wuxuai/);
  assert.match(source, /if \(origin && !common\.has\("access-control-allow-origin"\)\) return fail\("ORIGIN_DENIED", 403, null\)/);
});
