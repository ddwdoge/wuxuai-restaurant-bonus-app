import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);

test("Willkommensgeschenk-Hilfe bleibt algorithmusneutral", () => {
  assert.match(onboarding, /Automatische Geschenkverteilung/);
  assert.match(
    onboarding,
    /Die verfügbaren Willkommensgeschenke werden automatisch durch WUXUAI zugeteilt\. Du legst fest, welche Geschenke verfügbar sind – die Verteilung übernimmt das System automatisch\./,
  );
  assert.doesNotMatch(onboarding, /Systemquote|Systemquoten|Zuteilungen je 100|Gesamtkosten je 100|Regelversion/);
  assert.doesNotMatch(onboarding, /gleich(?:mäßig|verteilt|e Verteilung)|gewichtet(?:e|er)? Verteilung/i);
});

test("Owner kann keine Verteilungsquote konfigurieren", () => {
  assert.doesNotMatch(onboarding, /Eigene Verteilung|manuelle Prozenteingabe/i);
  assert.doesNotMatch(onboarding, /name=["'](?:quota|weight|probability|distributionPercentage)["']/i);
});

test("unangewendete Regelversions-Migration bleibt außerhalb von V1", async () => {
  await assert.rejects(
    access(new URL("../supabase/migrations/20260901001000_welcome_gift_system_rule_snapshot.sql", import.meta.url)),
  );
});
