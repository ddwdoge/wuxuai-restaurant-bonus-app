import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const packetUrl = new URL("../docs/legal/packet/", import.meta.url);
const migrationUrl = new URL(
  "../supabase/migrations/20260803005000_wuxuai_legal_packet_v0_9_templates.sql",
  import.meta.url,
);

test("Legal-Paket V0.9 enthält alle zwölf Prüfdokumente und die Referenzbeschreibung", async () => {
  const files = (await readdir(packetUrl)).sort();
  assert.deepEqual(files, [
    "00_README_LEGAL_PACKET_V0_9.md",
    "01_B2B_SAAS_AGB_V0_9.md",
    "02_V1_LEISTUNGSBESCHREIBUNG_V0_9.md",
    "03_AVV_ART_28_DSGVO_V0_9.md",
    "04_TOM_V0_9.md",
    "05_BETREIBER_DATENSCHUTZ_V0_9.md",
    "06_KUNDEN_TEILNAHMEBEDINGUNGEN_V0_9.md",
    "07_KUNDEN_DATENSCHUTZ_V0_9.md",
    "08_CONSENT_REFERRAL_GIFTS_V0_9.md",
    "09_PROGRAMMENDE_DATENEXPORT_V0_9.md",
    "10_IMPRESSUM_STORAGE_ACCESSIBILITY_V0_9.md",
    "11_SUBPROCESSORS_V0_9.md",
    "12_ANWALTSPRUEFPAKET_V0_9.md",
  ]);
});

test("Legal-Paket bleibt Draft und Gesellschaftsdaten bleiben Platzhalter", async () => {
  const files = await readdir(packetUrl);
  const contents = await Promise.all(files.map((file) => readFile(new URL(file, packetUrl), "utf8")));
  for (const content of contents) {
    assert.match(content, /DRAFT_LEGAL_REVIEW_REQUIRED/);
  }
  assert.match(contents.join("\n"), /WUXUAI GmbH – nach Gründung/);
  assert.doesNotMatch(contents.join("\n"), /Status:\s*`?REVIEWED`?/);
});

test("Legal-Migration ergänzt nur versionierte Draft-Templates ohne Security-Lockerung", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /2026\.08-v0\.9/);
  assert.match(migration, /DRAFT_LEGAL_REVIEW_REQUIRED/);
  assert.match(migration, /receipt_reference_required', false/);
  assert.doesNotMatch(migration, /create policy|alter policy|disable row level security/i);
  assert.doesNotMatch(migration, /grant\s+.+\s+to\s+(anon|authenticated)/i);
  assert.doesNotMatch(migration, /review_status[^\n]*'REVIEWED'/i);
});
