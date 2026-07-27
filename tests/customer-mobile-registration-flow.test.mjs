import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  loadPortalForRestaurant,
} from "../src/modules/customer/customerRedemptionSession.mjs";
import {
  customerRegistrationCanSubmit,
  emptyCustomerRegistrationForm,
} from "../src/modules/customer/customerRegistration.mjs";

const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const premiumCss = await readFile(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const loyaltySource = await readFile(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const referralSource = await readFile(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8");

test("QR-Kontext bleibt bei einem kontrollierten Portal-Retry unverändert", async () => {
  const calls = [];
  const result = await loadPortalForRestaurant({
    restaurantSlug: "Wuxuai-Cafehous",
    customerToken: "customer-token-a",
    maxAttempts: 2,
    retryDelayMs: 450,
    wait: async () => undefined,
    loadPortal: async (restaurantSlug, customerToken) => {
      calls.push({ restaurantSlug, customerToken });
      if (calls.length === 1) throw new Error("Live-Daten konnten nicht geladen werden.");
      return { restaurant: restaurantSlug };
    },
  });

  assert.equal(result.status, "loaded");
  assert.equal(result.attempts, 2);
  assert.deepEqual(calls, [
    { restaurantSlug: "wuxuai-cafehous", customerToken: "customer-token-a" },
    { restaurantSlug: "wuxuai-cafehous", customerToken: "customer-token-a" },
  ]);
});

test("endgültiger Fehler erscheint erst nach fehlgeschlagenem Wiederholungsversuch", async () => {
  let attempts = 0;
  const result = await loadPortalForRestaurant({
    restaurantSlug: "wuxuai-cafehous",
    customerToken: null,
    maxAttempts: 2,
    wait: async () => undefined,
    loadPortal: async () => {
      attempts += 1;
      throw new Error("Netzwerk vorübergehend nicht erreichbar");
    },
  });

  assert.equal(result.status, "error");
  assert.equal(result.attempts, 2);
  assert.equal(attempts, 2);
});

test("Route-Wechsel bricht den QR-Retry vor einem zweiten alten Request ab", async () => {
  let cancelled = false;
  let calls = 0;
  const result = await loadPortalForRestaurant({
    restaurantSlug: "restaurant-a",
    customerToken: "token-a",
    maxAttempts: 2,
    wait: async () => { cancelled = true; },
    isCancelled: () => cancelled,
    loadPortal: async () => {
      calls += 1;
      throw new Error("Verbindung unterbrochen");
    },
  });

  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
});

test("Registrierung startet ohne vorausgewählte Einwilligungen", () => {
  assert.equal(emptyCustomerRegistrationForm.termsAccepted, false);
  assert.equal(emptyCustomerRegistrationForm.privacyAcknowledged, false);
  assert.equal(emptyCustomerRegistrationForm.birthdayProcessing, false);
  assert.equal(emptyCustomerRegistrationForm.marketingPush, false);
  assert.equal(emptyCustomerRegistrationForm.marketingSms, false);
  assert.equal(emptyCustomerRegistrationForm.marketingEmail, false);
});

test("Fertig verlangt nur gültige Pflichtfelder und Pflichtzustimmungen", () => {
  const validRequired = {
    ...emptyCustomerRegistrationForm,
    firstName: "Mira",
    phone: "+43 660 1234567",
    termsAccepted: true,
    privacyAcknowledged: true,
  };

  assert.equal(customerRegistrationCanSubmit(validRequired, true), true);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, termsAccepted: false }, true), false);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, privacyAcknowledged: false }, true), false);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, phone: "123" }, true), false);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, birthday: "1990-07-27" }, true), true);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, birthday: "1990-07-27", birthdayProcessing: true }, true), true);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, marketingPush: true }, true), true);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, marketingSms: true }, true), true);
  assert.equal(customerRegistrationCanSubmit({ ...validRequired, marketingEmail: true }, true), true);
});

test("freiwillige Einwilligungen blockieren weder Restaurant- noch Referral-Registrierung", () => {
  assert.doesNotMatch(portalSource, /if \(form\.birthday && !form\.birthdayProcessing\)/);
  assert.doesNotMatch(referralSource, /if \(form\.birthday && !form\.birthdayProcessing\)/);
  assert.match(referralSource, /disabled=\{submitting \|\| !registrationCanSubmit\}/);
  assert.match(loyaltySource, /input_marketing_push:\s*input\.legal\.marketingPush/);
  assert.match(loyaltySource, /input_marketing_sms:\s*input\.legal\.marketingSms/);
  assert.match(loyaltySource, /input_marketing_email:\s*input\.legal\.marketingEmail/);
});

test("Mobile Registrierung erzwingt dunkle Texte, leere Checkboxen und Safe Area", () => {
  assert.match(portalSource, /id="guest-birthday"[\s\S]*?type="date"/);
  assert.match(portalSource, /<details className="customer-registration-consents">/);
  assert.match(portalSource, /disabled=\{submitting \|\| !registrationCanSubmit\}/);
  assert.match(premiumCss, /\.premium-collect-page \.customer-registration-card\s*\{[\s\S]*color:\s*var\(--premium-text\)/);
  assert.match(premiumCss, /input\[type="checkbox"\][^{]*\{[\s\S]*appearance:\s*none/);
  assert.match(premiumCss, /\.customer-registration-page\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(premiumCss, /\.customer-registration-card \.customer-registration-actions\s*\{[^}]*position:\s*fixed/);
});

test("bestehender Kundenvertrag bleibt serverseitig restaurantbezogen und idempotent", () => {
  assert.match(loyaltySource, /register_restaurant_customer_legal/);
  assert.match(loyaltySource, /input_restaurant_slug:\s*input\.restaurantSlug/);
  assert.doesNotMatch(portalSource, /insert\([\s\S]*customers/);
});
