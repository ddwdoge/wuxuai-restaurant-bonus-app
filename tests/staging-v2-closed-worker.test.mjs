import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../worker/staging-v2-closed.mjs";

const config = JSON.parse(readFileSync(new URL("../wrangler.staging-v2.closed.jsonc", import.meta.url), "utf8"));
const standard = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("v2 uses a separate worker and intercepts assets before static serving", () => {
  assert.equal(config.name, "wuxuai-restaurant-bonus-app-staging-v2");
  assert.equal(config.main, "./worker/staging-v2-closed.mjs");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(standard.main, "./worker/index.mjs");
  assert.notEqual(standard.name, config.name);
});

test("all methods and paths deny before assets, even with missing or wrong bindings and mode", async () => {
  const paths = ["/", "/customer", "/assets/index-12345678.js", "/assets/unknown", "/checkout", "/api/checkout"];
  const environments = [undefined, {}, { WUXUAI_V2_ACCESS_MODE: "open" }, {
    WUXUAI_V2_ACCESS_MODE: "closed", WUXUAI_PROJECT_REF: "wrong",
    ASSETS: { fetch() { throw new Error("assets reached"); } },
  }];
  for (const env of environments) for (const path of paths) for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
    const response = await worker.fetch(new Request(`https://staging-v2.bonus.wuxuaisbi.com${path}`, { method }), env);
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "");
  }
});
