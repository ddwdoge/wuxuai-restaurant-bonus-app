import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  customerPortalMailUrl,
  resolveTransactionalMailLanguage,
  renderTransactionalMail,
  supportedTransactionalMailLanguages,
  supportedTransactionalMailTemplates,
} from "../supabase/functions/_shared/transactionalMailTemplates.mjs";

const migration = await readFile(new URL("../supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql", import.meta.url), "utf8");
const dispatcher = await readFile(new URL("../supabase/functions/transactional-mail-dispatcher/index.ts", import.meta.url), "utf8");

test("dispatcher supports exactly the existing V1 transactional templates", () => {
  assert.deepEqual([...supportedTransactionalMailTemplates].sort(), [
    "BIRTHDAY_GIFT_ASSIGNED",
    "BIRTHDAY_GIFT_EXPIRY_REMINDER",
    "POINT_REWARD_AVAILABLE",
  ]);
});

test("birthday assignment mail uses the registered brand and restaurant-bound login return", () => {
  const mail = renderTransactionalMail({
    templateKey: "BIRTHDAY_GIFT_ASSIGNED",
    restaurantName: "WUXUAI Café",
    restaurantSlug: "wuxuai-cafe",
    payload: { reward_name: "Gratis Dessert", customer_reward_id: "internal-id" },
    appBaseUrl: "https://app.bonus.wuxuaisbi.com",
  });
  assert.equal(mail.subject, "Your birthday gift | WUXUAI® Bonus");
  assert.match(mail.actionUrl, /^https:\/\/app\.bonus\.wuxuaisbi\.com\/customer\/login\?/);
  assert.equal(new URL(mail.actionUrl).searchParams.get("returnTo"), "/customer/wuxuai-cafe");
  assert.match(mail.text, /View gift/);
  assert.doesNotMatch(mail.text + mail.html, /internal-id/);
});

test("transactional mail supports the seven approved languages with English fallback", () => {
  assert.deepEqual([...supportedTransactionalMailLanguages], ["de", "en", "fr", "it", "es", "zh", "ko"]);
  assert.equal(resolveTransactionalMailLanguage({ preferredLanguage: "zh-CN", appLanguage: "de" }), "zh");
  assert.equal(resolveTransactionalMailLanguage({ accountLanguage: "ko-KR", browserLanguage: "de" }), "ko");
  assert.equal(resolveTransactionalMailLanguage({ browserLanguage: "pt-BR" }), "en");
  for (const language of supportedTransactionalMailLanguages) {
    for (const templateKey of supportedTransactionalMailTemplates) {
      const mail = renderTransactionalMail({
        templateKey,
        restaurantName: "Morgen Café",
        restaurantSlug: "morgen-cafe",
        payload: { reward_name: "Gratis Dessert", required_points: 100 },
        appBaseUrl: "https://app.bonus.wuxuaisbi.com",
        language,
        firstName: "Mei",
      });
      assert.equal(mail.language, language);
      assert.match(mail.subject + mail.text + mail.html, /WUXUAI® Bonus/);
      assert.match(mail.text + mail.html, /support@wuxuaisbi\.com/);
      assert.match(mail.text, /Mei/);
      assert.doesNotMatch(
        mail.text + mail.html,
        /category weight|gift weighting|probability|Verteilungsquote|Gewinnquote/i,
      );
    }
  }
});

test("reminder and threshold templates expose no token or internal entity identifier", () => {
  for (const templateKey of ["BIRTHDAY_GIFT_EXPIRY_REMINDER", "POINT_REWARD_AVAILABLE"]) {
    const mail = renderTransactionalMail({
      templateKey,
      restaurantName: "Restaurant Test",
      restaurantSlug: "restaurant-test",
      payload: { reward_name: "Kaffee", required_points: 100, token: "secret", entity_id: "private" },
      appBaseUrl: "https://app.bonus.wuxuaisbi.com",
    });
    assert.match(mail.text, /Kaffee/);
    assert.doesNotMatch(mail.text + mail.html + mail.actionUrl, /secret|private/);
  }
});

test("mail links reject localhost, non-HTTPS and malformed restaurant slugs", () => {
  assert.throws(() => customerPortalMailUrl("http://localhost:5173", "restaurant-test"), /APP_BASE_URL_INVALID/);
  assert.throws(() => customerPortalMailUrl("http://app.bonus.wuxuaisbi.com", "restaurant-test"), /APP_BASE_URL_INVALID/);
  assert.throws(() => customerPortalMailUrl("https://app.bonus.wuxuaisbi.com", "../fremd"), /RESTAURANT_SLUG_INVALID/);
});

test("mail content escapes restaurant and reward input", () => {
  const mail = renderTransactionalMail({
    templateKey: "POINT_REWARD_AVAILABLE",
    restaurantName: "<script>Test</script>",
    restaurantSlug: "restaurant-test",
    payload: { reward_name: "<img src=x onerror=alert(1)>" },
    appBaseUrl: "https://app.bonus.wuxuaisbi.com",
  });
  assert.doesNotMatch(mail.html, /<script>|<img src=x/);
  assert.match(mail.html, /&lt;script&gt;|&lt;img/);
});

test("queue leases, retries and terminal failures remain persistent and service-role only", () => {
  assert.match(migration, /processing_started_at timestamptz/);
  assert.match(migration, /failed_at timestamptz/);
  assert.match(migration, /last_error text/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /processing_started_at <= now\(\) - interval '10 minutes'/);
  assert.match(migration, /attempt_count >= 5 then 'SKIPPED'/);
  assert.match(migration, /now\(\) \+ interval '1 minute'/);
  assert.match(migration, /now\(\) \+ interval '1 hour'/);
  assert.match(migration, /unique \(event_type, event_key\)/);
  assert.match(migration, /grant execute on function public\.reserve_customer_transactional_emails\(integer\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.reserve_customer_transactional_emails\(integer\) to (anon|authenticated)/);
});

test("sent rows cannot be reserved again and stale processing leases are bounded", () => {
  assert.match(migration, /delivery\.status in \('PENDING', 'FAILED'\)/);
  assert.match(migration, /delivery\.status = 'PROCESSING'/);
  assert.doesNotMatch(migration, /delivery\.status in \([^\n]*'SENT'/);
  assert.match(dispatcher, /messageId: `<wuxuai-\$\{delivery\.delivery_id\}@\$\{messageIdDomain\}>`/);
});

test("dispatcher requires server secrets and never logs recipient or payload", () => {
  assert.match(dispatcher, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(dispatcher, /TRANSACTIONAL_MAIL_SCHEDULER_SECRET/);
  assert.match(dispatcher, /SMTP_PASSWORD/);
  assert.match(dispatcher, /SMTP_FROM_NAME\"\) \?\? \"WUXUAI® Bonus\"/);
  assert.match(dispatcher, /x-wuxuai-scheduler-secret/);
  assert.match(dispatcher, /persistSession: false, autoRefreshToken: false/);
  const logFunction = dispatcher.slice(dispatcher.indexOf("function logDelivery"), dispatcher.indexOf("Deno.serve"));
  assert.doesNotMatch(logFunction, /delivery\?\.email|delivery\?\.payload/);
  assert.doesNotMatch(dispatcher, /console\.(?:log|info|error)\([^\n]*(smtpPassword|serviceRoleKey|schedulerSecret)/);
  assert.match(dispatcher, /resolveRecipientContext/);
  assert.match(dispatcher, /preferred_language/);
  assert.match(dispatcher, /browser_language/);
});

test("queued language metadata is used when no account language is available", () => {
  const mail = renderTransactionalMail({
    templateKey: "POINT_REWARD_AVAILABLE",
    restaurantName: "Morgen Café",
    restaurantSlug: "morgen-cafe",
    payload: { language: "fr-FR", reward_name: "Dessert" },
    appBaseUrl: "https://app.bonus.wuxuaisbi.com",
    language: null,
  });
  assert.equal(mail.language, "fr");
  assert.match(mail.subject, /récompense/i);
});

test("birthday and threshold producers stay independent from delivery success", () => {
  assert.match(migration, /exception when others then\s+-- E-mail infrastructure must never roll back a gift or points transaction/);
  assert.match(migration, /customer_reward\.gift_type = 'birthday' and customer_reward\.status = 'active'/);
  assert.match(migration, /birthday_pool_enabled = true and active = true/);
  assert.match(migration, /not was_above and current_balance >= reward_record\.required_points/);
  assert.match(migration, /active = true and not is_starter_reward/);
});
