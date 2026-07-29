import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  customerPhoneValidation,
  normalizeCustomerLocalPhoneInput,
  normalizeCustomerPhone,
  normalizeCustomerPhoneParts,
  splitCustomerPhone,
} from "../src/modules/customer/customerIdentity.mjs";

const componentSource = await readFile(new URL("../src/shared/components/CustomerPhoneField.tsx", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const referralSource = await readFile(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8");
const supportSource = await readFile(new URL("../src/modules/admin/pages/CustomersPage.tsx", import.meta.url), "utf8");
const loyaltySource = await readFile(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260729002000_customer_phone_e164_hardening.sql", import.meta.url), "utf8");

test("Landesvorwahl und lokale Nummer werden identisch nach E.164 normalisiert", () => {
  assert.equal(normalizeCustomerPhoneParts("+43", "6641234567"), "+436641234567");
  assert.equal(normalizeCustomerPhoneParts("+43", "06641234567"), "+436641234567");
  assert.equal(normalizeCustomerPhoneParts("+43", "0664 123 4567"), "+436641234567");
  assert.equal(normalizeCustomerPhoneParts("+43", "0664-1234567"), "+436641234567");
  assert.equal(normalizeCustomerPhoneParts("+49", "01711234567"), "+491711234567");
});

test("genau eine führende Null wird bei zulässiger lokaler Eingabe entfernt", () => {
  assert.equal(normalizeCustomerLocalPhoneInput("0664 1234567"), "6641234567");
  assert.equal(normalizeCustomerLocalPhoneInput("00664"), "00664");
});

test("Buchstaben, Landescode im lokalen Feld sowie unplausible Längen werden blockiert", () => {
  assert.equal(normalizeCustomerPhoneParts("+43", "664ABC4567"), null);
  assert.match(customerPhoneValidation("+43", "+43 664 1234567").error, /nur die lokale Nummer/);
  assert.match(customerPhoneValidation("+43", "0043 664 1234567").error, /nur die lokale Nummer/);
  assert.equal(normalizeCustomerPhoneParts("+43", "123"), null);
  assert.equal(normalizeCustomerPhoneParts("+43", "1234567890123456"), null);
  assert.equal(normalizeCustomerPhoneParts("+43", ""), null);
});

test("kombinierte Bestandsformate bleiben streng und duplikatgleich", () => {
  const expected = "+436641234567";
  for (const value of ["0664 1234567", "6641234567", "+43 664 1234567", "0043 664 1234567"]) {
    assert.equal(normalizeCustomerPhone(value), expected);
  }
  assert.equal(normalizeCustomerPhone("0664abc1234567"), null);
  assert.equal(normalizeCustomerPhone("+1 212 555 0100"), null);
});

test("gespeicherte E.164-Nummern werden für den Support sicher getrennt", () => {
  assert.deepEqual(splitCustomerPhone("+491711234567"), { countryCode: "+49", localNumber: "1711234567" });
  assert.deepEqual(splitCustomerPhone("ungültig"), { countryCode: "+43", localNumber: "" });
});

test("alle Identitätsformulare verwenden dieselbe zugängliche Komponente", () => {
  assert.match(portalSource, /<CustomerPhoneField/);
  assert.match(referralSource, /<CustomerPhoneField/);
  assert.match(supportSource, /<CustomerPhoneField/);
  assert.match(componentSource, /autoComplete="tel-national"/);
  assert.match(componentSource, /autoComplete="tel-country-code"/);
  assert.match(componentSource, /aria-describedby/);
  assert.match(componentSource, /Bitte ohne führende 0 eingeben/);
});

test("öffentliche Registrierung und Support senden nur zentral normalisierte Werte", () => {
  assert.match(portalSource, /phone:\s*phoneValidation\.e164/);
  assert.match(referralSource, /phone:\s*phoneValidation\.e164/);
  assert.match(loyaltySource, /input_new_phone:\s*normalizedPhone/);
  assert.match(loyaltySource, /normalizeCustomerPhone\(input\.newPhone\)/);
});

test("Backend normalisiert streng und Duplicate-Schutz bleibt restaurantbezogen", () => {
  assert.match(migration, /raw_value !~ '\^\[0-9\+\(\) -\]\+\$'/);
  assert.match(migration, /compact !~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
  assert.match(migration, /revoke execute on function public\.normalize_customer_phone\(text\)/);
  assert.doesNotMatch(migration, /^\s*(update|delete|merge)\s+/im);
});

test("Telefonnummern werden nicht in Audit-Metadaten oder Logs geschrieben", () => {
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*(input_phone|raw_value|compact)/s);
  assert.doesNotMatch(componentSource, /console\.(log|info|warn|error)/);
});
