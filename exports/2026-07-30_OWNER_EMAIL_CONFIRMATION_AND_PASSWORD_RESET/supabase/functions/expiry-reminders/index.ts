import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:privacy@wuxuai.com";
const schedulerSecret = Deno.env.get("EXPIRY_REMINDER_SCHEDULER_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !schedulerSecret) {
    return json({ error: "push_not_configured" }, 503);
  }
  if (request.headers.get("x-wuxuai-scheduler-secret") !== schedulerSecret) {
    return json({ error: "not_authorized" }, 401);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: generationError } = await supabase.rpc("create_expiry_reminders");
  if (generationError) return json({ error: "reminder_generation_failed" }, 500);

  const { data: reminders, error } = await supabase
    .from("expiry_reminders")
    .select("id, restaurant_id, customer_id, reward_id, reminder_stage, customers(test_session_id), rewards(title), restaurants(slug)")
    .eq("push_status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(250);
  if (error) return json({ error: "reminder_queue_failed" }, 500);

  let sent = 0;
  let failed = 0;
  for (const reminder of reminders ?? []) {
    const { data: subscriptions } = await supabase
      .from("customer_push_subscriptions")
      .select("id, subscription, failure_count")
      .eq("restaurant_id", reminder.restaurant_id)
      .eq("customer_id", reminder.customer_id)
      .eq("active", true);

    if (!subscriptions?.length) {
      await supabase.from("expiry_reminders").update({ push_status: "not_subscribed" }).eq("id", reminder.id);
      continue;
    }

    const reward = Array.isArray(reminder.rewards) ? reminder.rewards[0] : reminder.rewards;
    const restaurant = Array.isArray(reminder.restaurants) ? reminder.restaurants[0] : reminder.restaurants;
    const customer = Array.isArray(reminder.customers) ? reminder.customers[0] : reminder.customers;
    const dayText = reminder.reminder_stage === 0
      ? "nur noch heute gültig"
      : `noch ${reminder.reminder_stage} ${reminder.reminder_stage === 1 ? "Tag" : "Tage"} gültig`;
    const notification = JSON.stringify({
      title: "Deine Belohnung läuft bald ab",
      body: `${reward?.title ?? "Deine Belohnung"} ist ${dayText}.`,
      url: `/customer/${restaurant?.slug}?reminder=${reminder.id}&reward=${reminder.reward_id}`,
      tag: `expiry-${reminder.id}`,
    });

    let reminderSent = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription.subscription, notification, { TTL: 86_400 });
        reminderSent = true;
        sent += 1;
        await supabase.from("customer_push_subscriptions").update({
          last_success_at: new Date().toISOString(), failure_count: 0,
        }).eq("id", subscription.id);
      } catch (pushError) {
        failed += 1;
        const statusCode = Number((pushError as { statusCode?: number }).statusCode ?? 0);
        const terminal = statusCode === 404 || statusCode === 410;
        await supabase.from("customer_push_subscriptions").update({
          last_failure_at: new Date().toISOString(),
          failure_count: Number(subscription.failure_count ?? 0) + 1,
          active: !terminal,
          disabled_at: terminal ? new Date().toISOString() : null,
        }).eq("id", subscription.id);
      }
    }

    await supabase.from("expiry_reminders").update({
      push_status: reminderSent ? "sent" : "failed",
      push_sent_at: reminderSent ? new Date().toISOString() : null,
    }).eq("id", reminder.id);
    await supabase.from("audit_log").insert({
      restaurant_id: reminder.restaurant_id,
      customer_id: reminder.customer_id,
      actor_type: "system",
      action: reminderSent ? "expiry_push_sent" : "expiry_push_failed",
      event_type: reminderSent ? "EXPIRY_PUSH_SENT" : "EXPIRY_PUSH_FAILED",
      status: reminderSent ? "success" : "failed",
      source: "expiry_reminders_function",
      target_table: "expiry_reminders",
      target_id: reminder.id,
      entity_type: "expiry_reminders",
      entity_id: reminder.id,
      is_test_event: Boolean(customer?.test_session_id),
      test_session_id: customer?.test_session_id ?? null,
      metadata: { reminder_stage: reminder.reminder_stage, reward_id: reminder.reward_id },
    });
  }

  return json({ processed: reminders?.length ?? 0, sent, failed });
});
