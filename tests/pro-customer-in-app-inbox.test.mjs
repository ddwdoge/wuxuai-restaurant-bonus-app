import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20260928005000_pro_customer_in_app_inbox.sql");
const portal = await read("src/modules/customer/CustomerPortal.tsx");
const service = await read("src/modules/customer/proInAppInboxService.ts");
const styles = await read("src/modules/customer/customer-premium.css");

test("in-app inbox is private, tenant/customer scoped and synthetic staging only", () => {
  assert.match(migration, /alter table public\.customer_pro_in_app_notifications enable row level security/);
  assert.match(migration, /revoke all on table public\.customer_pro_in_app_notifications from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy[\s\S]*customer_pro_in_app_notifications/i);
  assert.match(migration, /marker\.restaurant_id = restaurant\.id[\s\S]*marker\.organization_id = restaurant\.organization_id/);
  assert.match(migration, /customer\.is_test_customer is true/);
  assert.match(migration, /environment\.environment = 'STAGING'/);
  assert.match(migration, /notification\.restaurant_id = identity_record\.restaurant_id[\s\S]*notification\.customer_id = identity_record\.customer_id/);
  assert.match(migration, /customer\.auth_user_id = auth\.uid\(\) or account\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /auth\.uid\(\) is null[\s\S]*PRO_IN_APP_AUTH_REQUIRED/);
  assert.match(migration, /PRO_IN_APP_CUSTOMER_ROLE_DENIED/);
});

test("creation and retrieval both recheck current PRO entitlements", () => {
  assert.match(migration, /enqueue_customer_pro_in_app_notification_internal/);
  assert.match(migration, /restaurant_entitlement_enabled\(input_restaurant_id, entitlement_key\)/);
  assert.match(migration, /offer_enabled := scope_allowed and public\.restaurant_entitlement_enabled/);
  assert.match(migration, /reward_enabled := scope_allowed and public\.restaurant_entitlement_enabled/);
  assert.match(migration, /PRO_IN_APP_ENTITLEMENT_INACTIVE/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.customer_pro_in_app_notifications/i);
});

test("offer publication and first reward threshold are deduplicated server-side", () => {
  assert.match(migration, /unique \(restaurant_id, customer_id, event_type, event_key\)/);
  assert.match(migration, /on conflict \(restaurant_id, customer_id, event_type, event_key\) do nothing/);
  assert.match(migration, /new\.id::text \|\| ':' \|\| new\.publication_version::text/);
  assert.match(migration, /'POINT_REWARD_AVAILABLE'[\s\S]*reward_state\.reward_id::text/);
  assert.match(migration, /state\.last_crossed_at = new\.created_at/);
  assert.match(migration, /zz_enqueue_reward_pro_in_app_notification/);
});

test("read state is customer-only and count/list derive from one visible set", () => {
  assert.match(migration, /select \* into notification_record[\s\S]*notification\.customer_id = identity_record\.customer_id[\s\S]*for update/);
  assert.match(migration, /set read_at = coalesce\(read_at, statement_timestamp\(\)\)/);
  assert.match(migration, /with visible as materialized/);
  assert.match(migration, /'unread_count', count\(\*\) filter \(where read_at is null\)/);
  assert.match(migration, /'items', coalesce\(jsonb_agg/);
});

test("notification infrastructure cannot mutate source business state", () => {
  const allowedInsert = /insert into public\.customer_pro_in_app_notifications/g;
  assert.equal([...migration.matchAll(allowedInsert)].length, 1);
  assert.doesNotMatch(migration, /update public\.(customers|rewards|restaurant_offers|branch_subscriptions|branch_entitlement_overrides)/i);
  assert.doesNotMatch(migration, /insert into public\.(points_transactions|rewards|restaurant_offers|branch_subscriptions|commercial_pro_access_grants)/i);
  assert.doesNotMatch(migration, /customer_transactional_email|push|cron\.schedule|net\.http_post/i);
});

test("customer UI exposes a localized inbox only when the server marks it available", () => {
  assert.match(portal, /customer && proInbox\?\.available/);
  assert.match(portal, /proInbox\.unread_count/);
  assert.match(portal, /markProInAppNotificationRead/);
  assert.doesNotMatch(portal, /loadProInAppInbox\([^)]*\)\.catch\(\(\) => null\)/);
  assert.match(portal, /proInboxState\?\.contextKey === proInboxContextKey/);
  assert.match(portal, /proInboxRequestRef\.current/);
  assert.match(portal, /proInboxMarkRef\.current/);
  assert.match(portal, /disabled=\{proInboxMarkPending !== null\}/);
  assert.match(portal, /inboxLoading/);
  assert.match(portal, /inboxLoadError/);
  assert.match(portal, /inboxRetry/);
  assert.match(service, /get_customer_pro_in_app_inbox/);
  assert.match(service, /mark_customer_pro_in_app_notification_read/);
  assert.match(styles, /\.customer-pro-inbox-trigger[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*customer-pro-inbox-trigger/);
});

test("all seven customer languages contain complete inbox copy", () => {
  const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
  const keys = ["inboxTitle", "inboxOpen", "inboxUnread", "inboxOffer", "inboxReward", "inboxMarkRead", "inboxRead", "inboxEmpty", "inboxReadError", "inboxLoading", "inboxLoadError", "inboxRetry", "inboxMarking"];
  for (const language of languages) {
    for (const key of keys) {
      const value = CUSTOMER_PRESENTATION_MESSAGES[language][`customer.presentation.${key}`];
      assert.equal(typeof value, "string", `${language}:${key}`);
      assert.ok(value.length > 1, `${language}:${key}`);
    }
  }
});
