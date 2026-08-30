import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { V1_COMMERCIAL_CONTRACT } from "../src/shared/commercialContract.mjs";

const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
const guardrails = await readFile(new URL("../docs/AI_IMPLEMENTATION_GUARDRAILS.md", import.meta.url), "utf8");

test("AGENTS requires the canonical AI implementation guardrails", () => {
  assert.match(agents, /docs\/AI_IMPLEMENTATION_GUARDRAILS\.md/);
  assert.match(agents, /docs\/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT\.md/);
});

test("guardrails cover the established V1 release boundaries", () => {
  for (const heading of [
    "Source of Truth",
    "V1 Scope Protection",
    "Tenant und Security",
    "Datenbank und Migrationen",
    "Business Logic",
    "Deployment und Umgebungen",
    "Commercial Contract",
    "Test- und Quality-Gates",
    "Artefakte und Reporting",
    "Git Safety",
  ]) {
    assert.match(guardrails, new RegExp(`## \\d+\\. ${heading}`));
  }
  assert.match(guardrails, /CURRENT CODE\/CONTRACT MISMATCH/);
  assert.match(guardrails, /Production bleibt[\s\S]{0,120}gesperrt/);
  assert.match(guardrails, /Stripe bleibt `DEFERRED`/);
  assert.doesNotMatch(guardrails, /30 Tage kostenlos|149 EUR|149 €/);
});

test("documented commercial values match the canonical runtime configuration", () => {
  assert.equal(V1_COMMERCIAL_CONTRACT.trial.calendarMonths, 3);
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.monthlyPrice, 59);
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.currency, "EUR");
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.vat, "exclusive");
  assert.equal(V1_COMMERCIAL_CONTRACT.automaticBillingActive, false);
  assert.equal(V1_COMMERCIAL_CONTRACT.stripeStatus, "deferred");
});
