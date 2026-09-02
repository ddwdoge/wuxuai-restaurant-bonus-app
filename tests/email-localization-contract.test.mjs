import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  browserEmailLanguage,
  normalizeEmailLanguage,
  SUPPORTED_EMAIL_LANGUAGES,
} from "../src/shared/emailLanguage.mjs";
import {
  authEmailSubject,
  supportedAuthEmailTemplates,
} from "../supabase/auth-templates/authTemplateSubjects.mjs";

const authTemplateNames = ["confirmation", "recovery", "invite", "magic-link"];
const authTemplates = await Promise.all(authTemplateNames.map(async (name) => ({
  name,
  source: await readFile(new URL(`../supabase/auth-templates/${name}.html`, import.meta.url), "utf8"),
})));
const customerAuth = await readFile(new URL("../src/modules/customer/customerAuthService.ts", import.meta.url), "utf8");
const ownerRegistration = await readFile(new URL("../src/modules/auth/registerOwnerService.ts", import.meta.url), "utf8");
const staffInvite = await readFile(new URL("../supabase/functions/owner-staff-invite/index.ts", import.meta.url), "utf8");

test("browser language capture supports exactly seven languages and English fallback", () => {
  assert.deepEqual([...SUPPORTED_EMAIL_LANGUAGES], ["de", "en", "fr", "it", "es", "zh", "ko"]);
  assert.equal(normalizeEmailLanguage("zh-CN"), "zh");
  assert.equal(normalizeEmailLanguage("ko_KR"), "ko");
  assert.equal(browserEmailLanguage({ languages: ["pt-BR", "fr-FR"], language: "de-DE" }), "fr");
  assert.equal(browserEmailLanguage({ languages: ["pt-BR"], language: "pt-BR" }), "en");
});

test("new Customer and Owner accounts capture app language without using it for authorization", () => {
  assert.match(customerAuth, /app_language: browserEmailLanguage\(\)/);
  assert.match(ownerRegistration, /app_language: browserEmailLanguage\(\)/);
  assert.doesNotMatch(customerAuth + ownerRegistration, /role:\s*browserEmailLanguage/);
});

test("active Auth templates contain all language branches, secure links, branding and support", () => {
  for (const { source } of authTemplates) {
    for (const language of ["de", "fr", "it", "es", "zh", "ko"]) {
      assert.match(source, new RegExp(`eq \\$language \\"${language}\\"`));
    }
    assert.match(source, /\{\{ \.ConfirmationURL \}\}/);
    assert.match(source, /WUXUAI® Bonus/);
    assert.match(source, /support@wuxuaisbi\.com/);
    assert.doesNotMatch(source, /https:\/\/bonus\.wuxuaisbi\.com/);
  }
});

test("Auth subject catalog covers every active template and language", () => {
  assert.deepEqual([...supportedAuthEmailTemplates].sort(), ["confirmation", "invite", "magic_link", "recovery"]);
  for (const template of supportedAuthEmailTemplates) {
    for (const language of SUPPORTED_EMAIL_LANGUAGES) {
      assert.match(authEmailSubject(template, language), /WUXUAI® Bonus/);
    }
    assert.equal(authEmailSubject(template, "unsupported"), authEmailSubject(template, "en"));
  }
});

test("Staff invitation metadata contains only safe presentation context", () => {
  assert.match(staffInvite, /staff_first_name/);
  assert.match(staffInvite, /restaurant_name/);
  assert.match(staffInvite, /app_language: "en"/);
  assert.doesNotMatch(staffInvite, /data:\s*\{[^}]*restaurant_id/s);
});
