import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatStaffAmountFromCents,
  parseStaffAmountToCents,
} from "../src/modules/staff/staffAmountInput.mjs";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const max = 30_000;

test("akzeptiert ganze Beträge, Komma und Punkt ohne Gleitkomma-Konvertierung", () => {
  assert.deepEqual(parseStaffAmountToCents("62", max), { ok: true, reason: null, cents: 6200 });
  assert.deepEqual(parseStaffAmountToCents("62,00", max), { ok: true, reason: null, cents: 6200 });
  assert.deepEqual(parseStaffAmountToCents("62.00", max), { ok: true, reason: null, cents: 6200 });
  assert.deepEqual(parseStaffAmountToCents("0,01", max), { ok: true, reason: null, cents: 1 });
  assert.deepEqual(parseStaffAmountToCents("00062,5", max), { ok: true, reason: null, cents: 6250 });
});

test("leerer Bearbeitungszustand bleibt leer und wird erst bei Validierung abgewiesen", () => {
  assert.deepEqual(parseStaffAmountToCents("", max), { ok: false, reason: "required", cents: null });
  assert.match(staffPortal, /useState\(""\)/);
  assert.doesNotMatch(staffPortal, /setBillAmount\(Number\(event\.target\.value\) \|\| 0\)/);
});

test("weist Null, negative Werte, Buchstaben und fehlerhafte Dezimalwerte ab", () => {
  for (const value of ["0", "0,00", "-1", "abc", "1,2,3", "1.234", "1,", ",50"]) {
    assert.equal(parseStaffAmountToCents(value, max).ok, false, value);
  }
});

test("prüft die fachliche Maximalgrenze exakt in Cents", () => {
  assert.deepEqual(parseStaffAmountToCents("300", max), { ok: true, reason: null, cents: 30000 });
  assert.deepEqual(parseStaffAmountToCents("300,01", max), { ok: false, reason: "range", cents: null });
});

test("formatiert erst nach expliziter Validierung oder Blur", () => {
  assert.equal(formatStaffAmountFromCents(6200), "62,00");
  assert.equal(formatStaffAmountFromCents(1, "."), "0.01");
});

test("Betragsfelder verwenden Stringzustand und mobile Dezimaltastatur", () => {
  assert.match(staffPortal, /inputMode="decimal"/);
  assert.match(staffPortal, /type="text"/);
  assert.match(staffPortal, /parseStaffAmountToCents/);
});
