import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_REDEMPTION_RATE_PERCENT,
  REDEMPTION_RATE_PERCENT_OPTIONS,
  calculateRewardEconomics,
  isAllowedRedemptionRatePercent,
  parseRewardRedemptionRate,
} from "../src/modules/loyalty/redemptionRate.mjs";

const selector = readFileSync(
  new URL("../src/modules/admin/components/RedemptionRateSelect.tsx", import.meta.url),
  "utf8",
);
const rewardsPage = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const loyaltyPage = readFileSync(new URL("../src/modules/admin/pages/LoyaltyPage.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260729004000_redemption_rate_dropdown.sql", import.meta.url),
  "utf8",
);

test("Einlösequote enthält exakt die ganzzahligen Werte 1 bis 10 Prozent", () => {
  assert.deepEqual(REDEMPTION_RATE_PERCENT_OPTIONS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(DEFAULT_REDEMPTION_RATE_PERCENT, 3);
  assert.equal(isAllowedRedemptionRatePercent(1), true);
  assert.equal(isAllowedRedemptionRatePercent(10), true);
  for (const invalid of [0, 1.5, 11, Number.NaN]) {
    assert.equal(isAllowedRedemptionRatePercent(invalid), false);
  }
});

test("jeder Dropdownwert verwendet die verbindliche Punkteformel", () => {
  for (const redemptionRatePercent of REDEMPTION_RATE_PERCENT_OPTIONS) {
    const result = calculateRewardEconomics({
      productPrice: 18,
      redemptionRatePercent,
      pointsPerEuro: 2,
    });
    assert.equal(result.estimatedConsumption, 18 / (redemptionRatePercent / 100));
    assert.equal(result.requiredPoints, Math.ceil(18 / (redemptionRatePercent / 100) - 2));
  }
});

test("aktive Punkteeinlösungs-Oberfläche verwendet eine native Tastaturauswahl statt freier Quote", () => {
  assert.match(selector, /<select/);
  assert.match(selector, /REDEMPTION_RATE_PERCENT_OPTIONS\.map/);
  assert.doesNotMatch(selector, /<input/);
  assert.match(rewardsPage, /<RedemptionRateSelect/);
  assert.doesNotMatch(loyaltyPage, /<RedemptionRateSelect/);
  assert.match(selector, /min-height: 44px|redemption-rate-select/);
});

test("Legacy-Werte bleiben sichtbar und blockieren unbemerkte Speicherung", () => {
  assert.equal(parseRewardRedemptionRate("Einlösequote: 12,5 %."), 12.5);
  assert.match(selector, /Legacy-Wert:/);
  assert.match(selector, /Der bisherige Wert bleibt erhalten/);
  assert.match(selector, /<option disabled value="legacy">/);
  assert.match(rewardsPage, /redemptionRatePercent === null/);
  assert.doesNotMatch(loyaltyPage, /validRedemptionRatePercent/);
});

test("Datenbankdefault ist 3 Prozent und Altwerte werden nicht überschrieben", () => {
  assert.match(migration, /set default 0\.03/);
  assert.match(migration, /redemption_return_rate >= 0\.01/);
  assert.match(migration, /redemption_return_rate <= 0\.10/);
  assert.match(migration, /round\(redemption_return_rate, 2\)/);
  assert.match(migration, /not valid/i);
  assert.doesNotMatch(migration, /update\s+public\.loyalty_settings/i);
  assert.doesNotMatch(migration, /update\s+public\.rewards/i);
});
