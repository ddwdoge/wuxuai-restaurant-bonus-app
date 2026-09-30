import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";

const [route, service] = await Promise.all([
  readFile(new URL("../src/modules/customer/CustomerRestaurantAccess.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/customerAccountService.ts", import.meta.url), "utf8"),
]);

test("new join and existing membership access remain distinct", () => {
  assert.match(route, /if \(nextContext\.membership_exists && nextContext\.token_valid\)/);
  assert.match(route, /if \(joinResult\.joined\) setJoinSuccessMessage/);
  assert.match(route, /if \(context\.membership_exists\) return/);
  assert.match(route, /if \(portalRestaurantSlug === restaurantSlug\) return <CustomerPortal/);
  assert.match(service, /if \(result\.customer_token\) saveStoredCustomerToken/);
  assert.doesNotMatch(route, /saveStoredCustomerToken|customer_token\s*=/);
});

test("existing membership without a valid device credential is explained without claiming join failure", () => {
  const expected = "Du bist diesem Bonusprogramm bereits beigetreten. Dein Zugang auf diesem Gerät muss erneut bestätigt werden. Deine Mitgliedschaft und deine Punkte bleiben unverändert.";
  assert.equal(CUSTOMER_PRESENTATION_MESSAGES.de["customer.recovery.description"], expected);
  assert.equal(CUSTOMER_PRESENTATION_MESSAGES.de["customer.recovery.action"], "Zugang auf diesem Gerät wiederherstellen");
  assert.match(route, /customer\.recovery\.description/);
  assert.match(route, />Abbrechen<\/Link>/);
  assert.match(route, /customer\.recovery\.reauthenticate/);
  assert.doesNotMatch(CUSTOMER_PRESENTATION_MESSAGES.de["customer.recovery.description"], /Beitritt.*fehlgeschlagen|nicht gespeichert/i);
});

test("recovery stays explicit, recently authenticated and never auto-issues a raw credential", () => {
  assert.match(route, /onClick=\{\(\) => void recover\(\)\}/);
  assert.match(service, /rpc\("recover_customer_membership_token"/);
  assert.match(service, /RECENT_CUSTOMER_AUTH_REQUIRED|CUSTOMER_RECOVERY_REAUTH_REQUIRED/);
  assert.doesNotMatch(route, /recoverCustomerMembershipToken\(restaurantSlug\)(?!;)/);
  assert.doesNotMatch(route, /console\.|analytics|customer_token/);
});

test("missing session, hydration, tenant slug and reload remain fail-closed", () => {
  assert.match(route, /if \(authLoading\).*Dein Gästekonto wird geprüft/);
  assert.match(route, /if \(!user\) return/);
  assert.match(route, /context\.restaurant_slug !== restaurantSlug/);
  assert.match(route, /generation !== loadGeneration\.current/);
  assert.match(route, /void loadContext\(\)/);
});

test("a rapid double click can enter the join RPC only once", () => {
  assert.match(route, /const joinInFlight = useRef\(false\)/);
  assert.match(route, /if \(!context \|\| joinInFlight\.current \|\| joining/);
  assert.match(route, /joinInFlight\.current = true/);
  assert.match(route, /finally \{[\s\S]*joinInFlight\.current = false/);
});

test("all seven languages distinguish existing membership from device access", () => {
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    const description = CUSTOMER_PRESENTATION_MESSAGES[language]["customer.recovery.description"];
    const action = CUSTOMER_PRESENTATION_MESSAGES[language]["customer.recovery.action"];
    assert.ok(description.length >= 40, `${language} description`);
    assert.ok(action.length >= 8, `${language} action`);
  }
});
