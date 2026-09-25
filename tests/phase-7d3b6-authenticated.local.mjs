import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, readdirSync } from "node:fs";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const runtime = "/private/tmp/wuxuai-7d3b6-auth.VMoIzk";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const origin = "http://127.0.0.1:4180";
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const sql = (query) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "162");

// All user sessions are created and retained by the real app client in ephemeral
// browser memory. No access token is returned to this test process.
const browser = await chromium.launch({ headless: true });
const actors = new Map();
const memoryStorage = () => {
  const entries = new Map();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: (key) => { entries.delete(key); },
    clear: () => { entries.clear(); },
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  } });
};
async function openActor(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(memoryStorage);
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const actor = { label, context, page,
    email: `d3b6-${label}-${randomUUID()}@example.invalid`, password: randomUUID() + randomUUID() };
  actors.set(label, actor);
  return actor;
}
async function signUp(actor, metadata = {}) {
  const result = await actor.page.evaluate(async ({ email, password, metadata }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const signed = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    if (signed.error) return { error: signed.error.code ?? "AUTH_SIGNUP_FAILED" };
    if (!signed.data.session) {
      const login = await supabase.auth.signInWithPassword({ email, password });
      if (login.error) return { error: login.error.code ?? "AUTH_LOGIN_FAILED" };
    }
    return { id: signed.data.user?.id ?? null };
  }, { email: actor.email, password: actor.password, metadata });
  assert.ok(result.id && !result.error, `LOCAL_${actor.label}_AUTH_FAILED:${result.error ?? "NO_ID"}`);
  actor.id = result.id;
  const authState = await actor.page.evaluate(async () => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const session = await supabase.auth.getSession();
    const user = await supabase.auth.getUser();
    return { sessionPresent: !!session.data.session, sessionError: session.error?.code ?? null,
      userPresent: !!user.data.user, userError: user.error?.code ?? null };
  });
  assert.ok(authState.sessionPresent && authState.userPresent,
    `LOCAL_${actor.label}_SESSION_INVALID:${JSON.stringify(authState)}`);
}
async function rpc(actor, name, args) {
  const result = await actor.page.evaluate(async ({ name, args }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const response = await supabase.rpc(name, args);
    return { data: response.data, error: response.error?.code ?? null };
  }, { name, args });
  assert.equal(result.error, null, `${actor.label}_${name}_FAILED:${result.error}`);
  return result.data;
}

try {
  const restaurants = new Map();
  for (const label of ["A", "B"]) {
    const owner = await openActor(`owner-${label}`);
    await signUp(owner);
    const trial = await rpc(owner, "start_restaurant_owner_trial", {
      input_owner_name: `D3B6 Synthetic Owner ${label}`,
      input_restaurant_name: `D3B6 Synthetic Restaurant ${label}`,
      input_phone: null, input_country: "AT",
    });
    assert.ok(trial?.restaurant?.id && trial.restaurant.branch_id && trial.restaurant.organization_id);
    restaurants.set(label, { owner, id: trial.restaurant.id, branchId: trial.restaurant.branch_id,
      organizationId: trial.restaurant.organization_id });
    console.log(`HISTORICAL_OWNER_${label}_REAL_BROWSER_AUTH_AND_TRIAL_RPC_PASS`);
  }
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "162");
  for (const file of readdirSync(`${runtime}/held-migrations`)) {
    cpSync(`${runtime}/held-migrations/${file}`, `${runtime}/supabase/migrations/${file}`);
  }
  const upgrade = execFileSync(cli, ["db", "push", "--local"], { cwd: runtime, env, encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"] });
  assert.match(upgrade, /20260924006000_secure_redemption_confirmation/);
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "171");
  console.log("HISTORICAL_162_TO_171_UPGRADE_PASS");

  for (const label of ["A", "B"]) {
    const restaurant = restaurants.get(label);
    await rpc(restaurant.owner, "generate_restaurant_legal_package", {
      input_restaurant_id: restaurant.id,
      input_profile: { company_name: `D3B6 Synthetic ${label}`, legal_form: "GmbH",
        street: "Testgasse 1", postal_code: "1010", city: "Wien", country: "AT",
        email: `d3b6-legal-${label}@example.invalid` },
      input_reacceptance_required: false,
    });
    await rpc(restaurant.owner, "publish_restaurant_legal_drafts", {
      input_restaurant_id: restaurant.id, input_effective_date: new Date().toISOString().slice(0, 10),
      input_reacceptance_required: false, input_confirmed: true, input_request_id: randomUUID(),
    });
    for (const reward of [
      { title: `D3B6 ${label} Points`, required_points: 100, is_starter_reward: false, birthday_pool_enabled: false },
      { title: `D3B6 ${label} Welcome`, required_points: 0, is_starter_reward: true, birthday_pool_enabled: false },
      { title: `D3B6 ${label} Birthday`, required_points: 0, is_starter_reward: true, birthday_pool_enabled: true },
    ]) {
      const inserted = await restaurant.owner.page.evaluate(async ({ reward, restaurant }) => {
        const { supabase } = await import("/src/shared/lib/supabase.ts");
        const result = await supabase.from("rewards").insert({ ...reward, active: true,
          description: "Synthetic local only", required_stamps: 0,
          restaurant_id: restaurant.id, organization_id: restaurant.organizationId,
          branch_id: restaurant.branchId });
        return result.error?.code ?? null;
      }, { reward, restaurant: { id: restaurant.id,
        branchId: restaurant.branchId, organizationId: restaurant.organizationId } });
      assert.equal(inserted, null, `REWARD_${label}_SETUP_FAILED:${inserted}`);
    }
    console.log(`LEGAL_${label}_LOCAL_OWNER_RPC_PASS`);
  }

  for (const label of ["A", "B"]) {
    const restaurant = restaurants.get(label);
    restaurant.slug = sql(`select slug from public.restaurants where id='${restaurant.id}'`);
    const roles = label === "A" ? ["admin", "manager", "staff", "customer"] : ["staff", "customer"];
    for (const role of roles) {
      const actor = await openActor(`${role}-${label}`);
      await signUp(actor, role === "customer" ? {
        customer_first_name: `D3B6 Customer ${label}`, customer_phone: label === "A" ? "+436600006001" : "+436600006002",
        customer_birthday: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      } : {});
      restaurant[role] = actor;
      if (role === "admin" || role === "manager") {
        const inserted = await restaurant.owner.page.evaluate(async ({ actorId, role, restaurant }) => {
          const { supabase } = await import("/src/shared/lib/supabase.ts");
          const result = await supabase.from("restaurant_members").insert({ user_id: actorId, role,
            restaurant_id: restaurant.id, branch_id: restaurant.branchId,
            organization_id: restaurant.organizationId });
          return result.error?.code ?? null;
        }, { actorId: actor.id, role, restaurant: {
          id: restaurant.id, branchId: restaurant.branchId, organizationId: restaurant.organizationId } });
        assert.equal(inserted, null, `${role}_${label}_MEMBERSHIP_FAILED:${inserted}`);
      } else if (role === "staff") {
        const invite = await rpc(restaurant.owner, "create_restaurant_staff_invitation", {
          input_restaurant_id: restaurant.id, input_name: `D3B6 Staff ${label}`, input_email: actor.email,
        });
        assert.ok(invite?.staff_member_id);
        await rpc(restaurant.owner, "bind_restaurant_staff_auth_identity", {
          input_restaurant_id: restaurant.id, input_staff_member_id: invite.staff_member_id,
          input_auth_user_id: actor.id,
        });
        await rpc(actor, "accept_my_restaurant_staff_invitation", {
          input_staff_member_id: invite.staff_member_id,
        });
      } else {
        const joined = await rpc(actor, "join_customer_account_restaurant", {
          input_restaurant_slug: restaurant.slug, input_terms_accepted: true,
          input_privacy_acknowledged: true, input_device_id: `d3b6-${randomUUID()}`,
          input_existing_customer_token: null,
        });
        assert.equal(joined?.joined, true, `CUSTOMER_${label}_JOIN_FAILED`);
      }
      console.log(`${role.toUpperCase()}_${label}_REAL_BROWSER_AUTH_AND_MEMBERSHIP_PASS`);
    }
  }
  for (const label of ["A", "B"]) {
    const restaurant = restaurants.get(label);
    for (const role of label === "A" ? ["owner", "admin", "manager", "staff", "customer"] : ["owner", "staff", "customer"]) {
      const actor = restaurant[role] ?? restaurant.owner;
      const access = await actor.page.evaluate(async (slug) => {
        const { supabase } = await import("/src/shared/lib/supabase.ts");
        const portal = await supabase.rpc("get_my_staff_restaurant_access", { input_restaurant_slug: slug });
        const queue = await supabase.rpc("get_secure_redemption_queue", { input_restaurant_slug: slug });
        return { portal: portal.data?.restaurant_role ?? null, portalSuccess: portal.data?.success ?? false,
          queueRole: queue.data?.actor_role ?? null, queueError: queue.error?.message ?? null };
      }, restaurant.slug);
      const expectedPortal = ["owner", "admin", "manager", "staff"].includes(role);
      assert.equal(access.portalSuccess, expectedPortal, `${role}_${label}_PORTAL_MATRIX_FAILED`);
      assert.equal(access.queueRole, role === "owner" ? "OWNER" : role === "staff" ? "STAFF" : null,
        `${role}_${label}_QUEUE_MATRIX_FAILED`);
      console.log(`${role.toUpperCase()}_${label}_SERVER_PORTAL_QUEUE_ROLE_PASS`);
    }
  }
  const navigate = async (actor, path) => actor.page.evaluate((nextPath) => {
    history.pushState(null, "", nextPath);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  const queueHeading = (page) => page.getByRole("heading", {
    name: /^(Offene Einlösungen|Open redemptions|Échanges en attente|Riscatti in attesa|Canjes pendientes|待确认兑换|대기 중인 교환)$/,
  });
  for (const role of ["owner", "admin", "manager", "staff", "customer"]) {
    const actor = restaurants.get("A")[role] ?? restaurants.get("A").owner;
    await actor.page.bringToFront();
    await actor.page.waitForFunction(() => !document.hidden);
    await navigate(actor, `/staff/${restaurants.get("A").slug}`);
    if (role === "customer") {
      await actor.page.waitForTimeout(1200);
      assert.equal(await actor.page.locator("main.tablet-shell").count(), 0);
      assert.equal(await queueHeading(actor.page).count(), 0);
    } else {
      await actor.page.locator("main.tablet-shell").waitFor();
      if (role === "owner" || role === "staff") {
        try {
          await queueHeading(actor.page).waitFor({ timeout: 10000 });
        } catch (error) {
          const state = await actor.page.evaluate(async (slug) => {
            const { supabase } = await import("/src/shared/lib/supabase.ts");
            const restaurants = await supabase.from("restaurants").select("slug").eq("slug", slug);
            const queue = await supabase.rpc("get_secure_redemption_queue", { input_restaurant_slug: slug });
            return { hidden: document.hidden, shell: !!document.querySelector("main.tablet-shell"),
              tenantQueryCount: restaurants.data?.length ?? null, tenantQueryError: restaurants.error?.code ?? null,
              queueRole: queue.data?.actor_role ?? null, queueError: queue.error?.code ?? null,
              queueSectionCount: document.querySelectorAll(".staff-premium-workspace section.settings-info-card").length };
          }, restaurants.get("A").slug);
          console.log(`PHYSICAL_QUEUE_DIAGNOSTIC_${role.toUpperCase()}=${JSON.stringify(state)}`);
          throw error;
        }
      } else {
        await actor.page.waitForTimeout(300);
        assert.equal(await queueHeading(actor.page).count(), 0);
      }
      await navigate(actor, `/staff/${restaurants.get("B").slug}`);
      assert.equal(await actor.page.locator("main.tablet-shell").count(), 0,
        `${role}_STALE_A_PORTAL_VISIBLE_UNDER_B`);
      assert.equal(await queueHeading(actor.page).count(), 0);
      await actor.page.locator("main.auth-shell").waitFor();
      assert.equal(await actor.page.locator("main.tablet-shell").count(), 0);
      assert.equal(await queueHeading(actor.page).count(), 0);
    }
    console.log(`${role.toUpperCase()}_A_PHYSICAL_PORTAL_QUEUE_TENANT_PASS`);
  }
  const anonContext = await browser.newContext();
  await anonContext.addInitScript(memoryStorage);
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`${origin}/staff/${restaurants.get("A").slug}`);
  assert.equal(await anonPage.locator("main.tablet-shell").count(), 0);
  assert.equal(await queueHeading(anonPage).count(), 0);
  await anonContext.close();
  console.log("ANONYMOUS_PHYSICAL_PORTAL_QUEUE_BLOCKED_PASS");
  console.log("D3B6_AUTH_FIXTURES_AND_SERVER_ROLE_MATRIX_PASS");
} finally {
  for (const actor of actors.values()) await actor.context.close();
  await browser.close();
}
