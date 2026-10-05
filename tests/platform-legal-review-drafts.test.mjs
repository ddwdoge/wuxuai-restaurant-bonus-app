import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const drafts = [
  ["platform_terms", "feb6bc7f984d3c5de6968792b74ccf5dc959c6747d285628e709157f315e88d6"],
  ["participation_terms", "1dd4670eeb74a99ac1fafc36e5064e7e87dcb2045e62c1a5f6223634252e05c7"],
  ["platform_privacy", "cb3a27e11d47c76f2dc6dab599960961e80ced825ff8f9a20e0658e019308cce"],
  ["owner_privacy", "e3ce27ef88379af637ddbb5f444bbc0eeab2d8bc81d0a9436c4564b8f89deef0"],
  ["staff_privacy", "a97726b177104b0fec1cefe2137054948300ea9044e2dc9e17e42c85595b82ac"],
  ["cookie_tracking", "6c814a41a76e1ece870d4642b8c49c1f62c7ab1a7b56858fea41abfb319e1d72"],
  ["platform_imprint", "ef96db5b568a36cce9aaca686c905b21e40a06152eb29cfcceacb16f894bdf3a"],
];
const migration = read("supabase/migrations/20261005134239_platform_legal_review_drafts.sql");

test("all seven exact ZIP drafts remain review-only and are not browser readable", () => {
  for (const [type, hash] of drafts) {
    // The internal counsel packet stays outside this commit. Migration 196
    // retains the already checked exact review hashes without publishing it.
    assert.match(migration, new RegExp(`'${type}'`));
    assert.ok(migration.includes(`'${hash}'`));
  }
  assert.match(migration, /check \(review_status = 'DRAFT_LEGAL_REVIEW_REQUIRED'\)/);
  assert.match(migration, /check \(published_at is null\)/);
  assert.match(migration, /revoke all on table public\.platform_legal_document_versions/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on table public\.platform_legal_document_versions/i);
  assert.doesNotMatch(migration, /\b(?:update|insert into) public\.(?:customer_accounts|customer_account_memberships|customers|points_transactions|customer_rewards|customer_consents|country_kyb_intake_policies)\b/i);
});

test("public locations do not render unapproved draft content", () => {
  const page = read("src/modules/legal/PlatformLegalPage.tsx");
  assert.match(page, /keine veröffentlichte Fassung/);
  assert.doesNotMatch(page, /body_markdown|platform_legal_document_versions|docs\/legal\/review/);
  assert.match(read("src/app/App.tsx"), /path="\/platform\/legal\/:documentType"/);
  assert.match(read("src/modules/customer/CustomerAuthPage.tsx"), /\/platform\/legal\/platform_terms/);
  assert.match(read("src/modules/customer/CentralCustomerPage.tsx"), /\/platform\/legal\/platform_privacy/);
  assert.match(read("src/modules/auth/LoginPage.tsx"), /\/platform\/legal\/owner_privacy/);
  assert.match(read("src/modules/auth/StaffLoginPage.tsx"), /\/platform\/legal\/staff_privacy/);
  assert.match(read("src/modules/public/PublicHome.tsx"), /\/platform\/legal\/platform_imprint/);
  assert.match(read("src/modules/public/PublicHome.tsx"), /\/platform\/legal\/cookie_tracking/);
});
