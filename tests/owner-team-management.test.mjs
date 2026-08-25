import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STAFF_STATUS_LABELS, staffActionsForStatus, validateStaffInvitation } from "../src/modules/admin/staffManagementFlow.mjs";
import { establishStaffInviteSessionCore, validateStaffInvitePassword } from "../src/modules/auth/staffInviteFlow.mjs";

const migration = readFileSync("supabase/migrations/20260825002000_owner_staff_account_management.sql", "utf8");
const auditFixMigration = readFileSync("supabase/migrations/20260825003000_owner_staff_invite_audit_null_fix.sql", "utf8");
const edgeFunction = readFileSync("supabase/functions/owner-staff-invite/index.ts", "utf8");
const staffPage = readFileSync("src/modules/admin/pages/StaffPage.tsx", "utf8");
const authProvider = readFileSync("src/modules/auth/AuthProvider.tsx", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

test("Owner-Einladung normalisiert sichere Pflichtfelder", () => {
  assert.deepEqual(validateStaffInvitation({ name: "  Anna Team ", email: " ANNA@EXAMPLE.COM " }), {
    valid: true,
    name: "Anna Team",
    email: "anna@example.com",
  });
  assert.equal(validateStaffInvitation({ name: "A", email: "anna@example.com" }).valid, false);
  assert.equal(validateStaffInvitation({ name: "Anna", email: "ungültig" }).valid, false);
});

test("Statusmodell bietet nur fachlich zulässige Owner-Aktionen", () => {
  assert.equal(STAFF_STATUS_LABELS.invited, "Einladung offen");
  assert.deepEqual(staffActionsForStatus("invited"), ["resend", "archive"]);
  assert.deepEqual(staffActionsForStatus("active"), ["suspend", "archive"]);
  assert.deepEqual(staffActionsForStatus("suspended"), ["reactivate", "archive"]);
  assert.deepEqual(staffActionsForStatus("archived"), []);
});

test("Migration ergänzt individuelle Auth-Identität ohne Legacy-PIN zu entfernen", () => {
  assert.match(migration, /add column if not exists auth_user_id uuid references auth\.users/);
  assert.match(migration, /add column if not exists email text/);
  assert.match(migration, /account_status in \('legacy', 'invited', 'active', 'suspended', 'archived'\)/);
  assert.doesNotMatch(migration, /drop column[^;]*(pin_hash|role)|drop table[^;]*staff_members/i);
});

test("Staff-Rollen werden nur bei aktiver restaurantbezogener Mitgliedschaft autorisiert", () => {
  assert.match(migration, /rm\.role in \('staff', 'supervisor'\)[\s\S]*sm\.restaurant_id = rm\.restaurant_id[\s\S]*sm\.auth_user_id = rm\.user_id[\s\S]*sm\.account_status = 'active'/);
  assert.match(migration, /can_manage_restaurant_staff[\s\S]*rm\.role in \('owner', 'admin'\)/);
  assert.match(migration, /restaurant members admin non staff write[\s\S]*role in \('owner', 'admin', 'manager'\)/);
});

test("Owner-, Plattform- und Customer-Identitäten bleiben vom Staff-Bootstrap getrennt", () => {
  assert.match(migration, /from public\.restaurants r where r\.owner_id = input_auth_user_id/);
  assert.match(migration, /from public\.platform_admins pa[\s\S]*pa\.active = true/);
  assert.match(migration, /from public\.customer_accounts ca[\s\S]*ca\.auth_user_id = input_auth_user_id/);
  assert.match(migration, /STAFF_AUTH_IDENTITY_ROLE_CONFLICT/);
});

test("dieselbe Staff-Identität kann nur über eine weitere explizite Restaurantbindung eingesetzt werden", () => {
  assert.match(migration, /staff_members_restaurant_auth_user_uidx[\s\S]*\(restaurant_id, auth_user_id\)/);
  assert.doesNotMatch(migration, /unique[^;]*\(auth_user_id\)/i);
});

test("eng begrenzte RPCs besitzen sicheren search_path und minimale Grants", () => {
  for (const name of [
    "create_restaurant_staff_invitation",
    "bind_restaurant_staff_auth_identity",
    "accept_my_restaurant_staff_invitation",
    "get_restaurant_staff_invitation_for_resend",
    "mark_restaurant_staff_invitation_resent",
    "set_restaurant_staff_membership_status",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path =`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to authenticated`));
  }
  assert.doesNotMatch(migration, /grant execute[^;]*to anon/);
  assert.doesNotMatch(migration, /disable row level security/);
});

test("Einladen, Sperren und Entfernen sind tenantgebunden und auditierbar", () => {
  assert.match(migration, /where id = input_staff_member_id[\s\S]*restaurant_id = input_restaurant_id/);
  for (const action of ["STAFF_INVITED", "STAFF_INVITE_RESENT", "STAFF_ACTIVATED", "STAFF_SUSPENDED", "STAFF_REACTIVATED", "STAFF_MEMBERSHIP_REMOVED"]) {
    assert.match(migration, new RegExp(action));
  }
  assert.doesNotMatch(migration, /delete from public\.staff_members/);
});

test("Edge Function hält Service Role serverseitig und prüft Owner erneut per RPC", () => {
  assert.match(edgeFunction, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(edgeFunction, /adminClient\.auth\.getUser\(token\)/);
  assert.match(edgeFunction, /userClient\.rpc\("create_restaurant_staff_invitation"/);
  assert.match(edgeFunction, /userClient\.rpc\("bind_restaurant_staff_auth_identity"/);
  assert.match(edgeFunction, /signInWithOtp/);
  assert.match(edgeFunction, /const \{ error: mailError \} = await mailClient\.auth\.signInWithOtp/);
  assert.doesNotMatch(edgeFunction, /console\.(log|error)|user_metadata|app_metadata/);
});

test("Erste Auth-Bindung erzeugt den Staff-Invite-Audit nullsicher", () => {
  assert.match(auditFixMigration, /already_bound := staff_record\.auth_user_id is not distinct from input_auth_user_id/);
  assert.match(auditFixMigration, /if not already_bound then[\s\S]*'STAFF_INVITED'/);
  assert.match(auditFixMigration, /security definer[\s\S]*set search_path = public, auth, pg_temp/);
  assert.match(auditFixMigration, /revoke all on function public\.bind_restaurant_staff_auth_identity[\s\S]*from public, anon/);
  assert.match(auditFixMigration, /grant execute on function public\.bind_restaurant_staff_auth_identity[\s\S]*to authenticated/);
});

test("Einladungsannahme akzeptiert nur einen echten Auth-Link und prüft Passwortwiederholung", async () => {
  const auth = {
    async setSession(input) { return { data: { session: { user: { id: "staff" }, ...input } }, error: null }; },
    async exchangeCodeForSession() { throw new Error("not used"); },
    async getSession() { throw new Error("not used"); },
  };
  const storage = new Map();
  storage.getItem = storage.get.bind(storage);
  storage.setItem = storage.set.bind(storage);
  const session = await establishStaffInviteSessionCore({
    auth,
    storage,
    url: "https://bonus.wuxuaisbi.com/auth/staff-invite?staff=11111111-1111-4111-8111-111111111111#access_token=a&refresh_token=b&type=invite",
  });
  assert.equal(session.session.user.id, "staff");
  assert.equal(validateStaffInvitePassword("sicher123", "sicher123").valid, true);
  assert.equal(validateStaffInvitePassword("sicher123", "anders123").valid, false);
});

test("Owner-UI bietet vollständige Teamverwaltung ohne gemeinsames Passwort", () => {
  assert.match(staffPage, /Mitarbeiter hinzufügen/);
  assert.match(staffPage, /Einladung senden/);
  assert.match(staffPage, /Erneut senden/);
  assert.match(staffPage, />Sperren</);
  assert.match(staffPage, />Reaktivieren</);
  assert.match(staffPage, /Aus Team entfernen/);
  assert.match(staffPage, /Mitarbeiterbereich öffnen/);
  assert.match(staffPage, /<dt>Angenommen<\/dt>/);
  assert.doesNotMatch(staffPage, /shared password|gemeinsames Passwort|PIN eingeben/i);
});

test("Staff und Betreiber erhalten serverseitig aufgelöste, geschützte Routen", () => {
  assert.match(authProvider, /\["owner", "admin", "manager", "supervisor", "staff"\]/);
  assert.match(app, /path="\/staff"[\s\S]*allowedRoles=\{\["owner", "admin", "manager", "staff", "supervisor"\]\}/);
  assert.match(app, /<StaffRestaurantRouteGate>/);
  assert.match(app, /path="\/staff\/:slug"/);
  assert.match(app, /path="\/staff\/login"/);
  assert.match(app, /path="\/auth\/staff-invite"/);
});

test("Teamverwaltung bleibt bei 390 px ohne starre Breite bedienbar", () => {
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.staff-team-row \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.staff-team-actions \.button \{ min-height: 44px/);
  assert.match(styles, /overflow-wrap: anywhere/);
});
