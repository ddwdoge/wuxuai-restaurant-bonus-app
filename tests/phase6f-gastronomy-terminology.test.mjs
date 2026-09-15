import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { GENERATED_MESSAGES, GENERATED_SOURCE_TO_KEY } from "../src/shared/i18n/messages.generated.mjs";
import { SUPPORTED_UI_LANGUAGES } from "../src/shared/i18n/language.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const publicAndAuthKeys = [
  "public.home.description",
  "public.home.ownerTitle",
  "public.home.ownerDescription",
  "public.home.registrationTitle",
  "public.home.customerDescription",
  "public.guest.description",
  "public.guest.scan",
  "public.guest.detected",
  "auth.register.title",
  "auth.ownerLogin.title",
  "auth.ownerLogin.description",
  "auth.ownerArea.preparing",
  "auth.ownerArea.opening",
  "auth.ownerArea.activatePrompt",
  "auth.businessName",
  "auth.businessStarting",
  "auth.ownerArea.activate",
  "auth.ownerRegistration.resumeError",
  "auth.secureBusinessAccess",
  "errors.businessAccess",
  "errors.businessAccessRetry",
  "errors.noBusinessAccess",
  "errors.noBusinessAssigned",
  "auth.staffAccess.scopedCheck",
  "auth.staffAccess.noScopedAccess",
  "auth.staffAccess.noAccess",
];

const customerVenueKeys = [
  "customer.auto_0586c2ae285e", "customer.auto_14ce63ad8054", "customer.auto_25f309a01320",
  "customer.auto_266b1c7f81bc", "customer.auto_28194c62fa9b", "customer.auto_2cf8c2b675f8",
  "customer.auto_2d7f9238f9c6", "customer.auto_324176082c51", "customer.auto_36792b766c81",
  "customer.auto_4108df71a225", "customer.auto_44e17e94914d", "customer.auto_4ee8c79da4c9",
  "customer.auto_50c2b3a45073", "customer.auto_5220e5ecc9be", "customer.auto_5950f1b6611f",
  "customer.auto_5dbdaa815965", "customer.auto_607ed869f82f", "customer.auto_628189c28d8d",
  "customer.auto_669eecc2a659", "customer.auto_7a6155137462", "customer.auto_8377a4df2fed",
  "customer.auto_a2dfdfd06e09", "customer.auto_ad5ef28ed0f9", "customer.auto_b0cbfb252827",
  "customer.auto_bd8e30897b7c", "customer.auto_c111bab7f575", "customer.auto_c559424250e9",
  "customer.auto_c60865339c90", "customer.auto_c97fe0a5597f", "customer.auto_d07bf71aeaca",
  "customer.auto_dcd1e39a0a11", "customer.auto_de7cf6b081c6", "customer.auto_e0d06dcfb98a",
  "customer.auto_e33803b4114e", "customer.auto_e5a9fd345733", "customer.auto_ecb7f2e84625",
  "customer.auto_f09ca9b02f15", "customer.auto_f100afd5d371", "customer.auto_f260feb5c78a",
  "customer.auto_f62af4931a47", "customer.auto_fa238586529f", "customer.auto_fdb742620ef5",
];

const ownerAndPlatformBusinessKeys = [
  "owner.auto_24a9b17490b1", "owner.auto_282b0884288b", "owner.auto_372ea0a2db19",
  "owner.auto_5c14927113ff", "owner.auto_658b6e53b31d", "owner.auto_6710e66e464d",
  "owner.auto_839fab9e238f", "owner.auto_9b2d12541772", "owner.auto_9d6e4514ff05",
  "owner.auto_c893af1dedc1", "owner.auto_cc57b9883ae5", "owner.auto_f95f56758f79",
  "platform.auto_02ee1095fe85", "platform.auto_133a85cca1e4", "platform.auto_21bdd028c379",
  "platform.auto_2ffc8e631772", "platform.auto_3b4cfdfce63f", "platform.auto_43e9870dc3fd",
  "platform.auto_562fa9f2af6b", "platform.auto_8b65cf4202a3", "platform.auto_92e9526ba5ef",
  "platform.auto_99b32c726db2", "platform.auto_ce0235facc8f", "platform.auto_f2ff86304d20",
  "platform.auto_ffa2d575a96e",
];

test("phase 6F public and auth gastronomy terminology exists in all seven languages", () => {
  for (const language of SUPPORTED_UI_LANGUAGES) {
    for (const key of publicAndAuthKeys) {
      assert.notEqual(translateStructural(key, language), key, `${language}: ${key}`);
    }
  }
});

test("German public and auth copy uses the approved context terms", () => {
  assert.match(translateStructural("public.home.description", "de"), /Gastronomiebetriebe/);
  assert.equal(translateStructural("public.home.ownerTitle", "de"), "Betriebs-Login");
  assert.match(translateStructural("public.home.registrationTitle", "de"), /Gastronomiebetrieb/);
  assert.match(translateStructural("public.home.customerDescription", "de"), /im Lokal/);
  assert.match(translateStructural("public.guest.detected", "de"), /Lokal/);
  assert.match(translateStructural("auth.businessName", "de"), /Gastronomiebetriebs/);
  assert.match(translateStructural("errors.businessAccess", "de"), /Betriebszugang/);
  assert.match(translateStructural("auth.staffAccess.noScopedAccess", "de"), /dieses Betriebs/);
  for (const key of publicAndAuthKeys) {
    assert.doesNotMatch(translateStructural(key, "de"), /Restaurant/, key);
  }
});

test("customer venue and owner/platform business terminology is complete in all seven languages", () => {
  for (const language of SUPPORTED_UI_LANGUAGES) {
    for (const key of [...customerVenueKeys, ...ownerAndPlatformBusinessKeys]) {
      assert.notEqual(translateStructural(key, language), key, `${language}: ${key}`);
    }
  }
  for (const key of customerVenueKeys) {
    assert.doesNotMatch(translateStructural(key, "de"), /Restaurant/i, key);
    assert.match(translateStructural(key, "de"), /Lokal|QR|Karte|Gebiet|Auswahl|geladen|wechsel|Mitglied|verfügbar/i, key);
  }
  for (const key of ownerAndPlatformBusinessKeys) {
    assert.doesNotMatch(translateStructural(key, "de"), /Restaurant/i, key);
    assert.match(translateStructural(key, "de"), /Betrieb/i, key);
  }
});

test("public and auth consumers use structural keys without changing routes or access contracts", () => {
  const publicHome = read("src/modules/public/PublicHome.tsx");
  const login = read("src/modules/auth/LoginPage.tsx");
  const register = read("src/modules/auth/RegisterPage.tsx");
  const protectedRoute = read("src/modules/auth/ProtectedRoute.tsx");
  const staffLogin = read("src/modules/auth/StaffLoginPage.tsx");
  const staffGate = read("src/modules/auth/StaffRestaurantRouteGate.tsx");

  assert.match(publicHome, /t\("public\.guest\.description"\)/);
  assert.match(login, /t\("auth\.ownerLogin\.title"\)/);
  assert.match(register, /t\("auth\.businessName"\)/);
  assert.match(protectedRoute, /t\("errors\.businessAccess"\)/);
  assert.match(staffLogin, /t\("auth\.staffAccess\.scopedCheck"\)/);
  assert.match(staffLogin, /t\("auth\.staffAccess\.noAccess"\)/);
  assert.match(staffGate, /t\("auth\.staffAccess\.noScopedAccess"\)/);

  for (const source of [login, register, protectedRoute, staffLogin, staffGate]) {
    assert.doesNotMatch(source, /restaurant_id|\.from\(|\.rpc\(/);
  }
});

test("explicit phase 6F terminology overrides take precedence over generated legacy copy", () => {
  const provider = read("src/shared/i18n/I18nProvider.tsx");
  assert.match(provider, /isTranslationKey\(key\) \? translateStructural\(key, language\) : key/);
  assert.match(provider, /structural !== key/);
  assert.match(provider, /isTranslationKey\(dynamic\.key\) \? translateStructural\(dynamic\.key, language\) : dynamic\.key/);
});

test("Korean business login renders the approved sign-in label", () => {
  const login = read("src/modules/auth/LoginPage.tsx");
  const key = "auth.auto_a329a32263a4";

  assert.match(login, />\s*Anmelden\s*</);
  assert.equal(GENERATED_SOURCE_TO_KEY.Anmelden, key);
  assert.equal(GENERATED_MESSAGES.ko[key], "로그인");
  assert.notEqual(GENERATED_MESSAGES.ko[key], "이름 *");
  assert.deepEqual(
    Object.fromEntries(["de", "en", "fr", "it", "es", "zh"].map((language) => [language, GENERATED_MESSAGES[language][key]])),
    {
      de: "Anmelden",
      en: "Sign in",
      fr: "Connectez-vous",
      it: "Accedi",
      es: "Iniciar sesión",
      zh: "登录",
    },
  );
});

test("technical restaurant identifiers and application routes remain unchanged", () => {
  const app = read("src/app/App.tsx");
  const protectedRoute = read("src/modules/auth/ProtectedRoute.tsx");
  assert.match(app, /path="\/restaurant\/login"/);
  assert.match(app, /path="\/admin\/platform\/restaurants\/:restaurantId"/);
  assert.match(app, /path="\/customer\/:slug"/);
  assert.match(protectedRoute, /roleScope = "restaurant"/);
});
