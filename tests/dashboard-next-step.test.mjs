import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DASHBOARD_NOTICE_KEYS, resolveDashboardNextStep } from "../src/modules/admin/dashboardNextStep.mjs";

const dashboard = await readFile(new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/modules/admin/dashboardNoticeService.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/modules/admin/admin-premium.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260803006000_owner_dashboard_notice_views.sql", import.meta.url), "utf8");
const resolverSource = await readFile(new URL("../src/modules/admin/dashboardNextStep.mjs", import.meta.url), "utf8");

function readyInput(overrides = {}) {
  return {
    restaurantStatus: { active: true },
    onboardingStatus: "completed",
    legalStatus: { status: "green", label: "Bereit", reason: "Alles vorhanden." },
    rewardStatus: { pointsRedemptionReady: true, welcomeGiftReady: true },
    qrStatus: { ready: true },
    pointsFlowStatus: { ready: true },
    emailStatus: { confirmed: true },
    profileStatus: { logoAvailable: true },
    referralStatus: { enabled: true },
    seenNoticeIds: new Set([DASHBOARD_NOTICE_KEYS.onboardingSuccess]),
    persistenceAvailable: true,
    statusLoadFailed: false,
    ...overrides,
  };
}

test("Legal-Warnungen bleiben vor allen Einrichtungs- und Optimierungsschritten", () => {
  const result = resolveDashboardNextStep(readyInput({
    legalStatus: { status: "red", label: "Kundenregistrierung blockiert", reason: "Teilnahmebedingungen fehlen." },
    rewardStatus: { pointsRedemptionReady: false, welcomeGiftReady: false },
  }));
  assert.equal(result?.id, "legal_readiness_blocked");
  assert.equal(result?.category, "critical");
  assert.equal(result?.dismissible, false);
  assert.equal(result?.ctaHref, "/admin/legal");
});

test("fehlende Punkte-Einlösung ist der erste offene Kernschritt", () => {
  const result = resolveDashboardNextStep(readyInput({
    rewardStatus: { pointsRedemptionReady: false, welcomeGiftReady: false },
  }));
  assert.equal(result?.title, "Punkte-Einlösung einrichten");
  assert.equal(result?.ctaHref, "/admin/rewards");
  assert.match(result?.description ?? "", /Mitarbeiter Kundenpunkte sicher bestätigen/);
});

test("nach der Punkte-Einlösung folgt automatisch der nächste offene Schritt", () => {
  const pointsFlow = resolveDashboardNextStep(readyInput({ pointsFlowStatus: { ready: false } }));
  assert.equal(pointsFlow?.id, "setup_points_collection");

  const welcomeGift = resolveDashboardNextStep(readyInput({
    rewardStatus: { pointsRedemptionReady: true, welcomeGiftReady: false },
  }));
  assert.equal(welcomeGift?.id, "setup_welcome_gift");
});

test("vollständige Einrichtung rendert nach gesehener Erfolgsmeldung keinen Bereich", () => {
  assert.equal(resolveDashboardNextStep(readyInput()), null);
});

test("Erfolgsmeldung erscheint nur ohne persistenten Gesehen-Status", () => {
  const firstView = resolveDashboardNextStep(readyInput({ seenNoticeIds: new Set() }));
  assert.equal(firstView?.id, DASHBOARD_NOTICE_KEYS.onboardingSuccess);
  assert.equal(firstView?.category, "success");
  assert.equal(firstView?.dismissible, false);

  const laterView = resolveDashboardNextStep(readyInput());
  assert.equal(laterView, null);
});

test("optionale Optimierung kann persistent geschlossen werden", () => {
  const open = resolveDashboardNextStep(readyInput({
    profileStatus: { logoAvailable: false },
    seenNoticeIds: new Set([DASHBOARD_NOTICE_KEYS.onboardingSuccess]),
  }));
  assert.equal(open?.id, DASHBOARD_NOTICE_KEYS.addLogo);
  assert.equal(open?.dismissible, true);

  const dismissed = resolveDashboardNextStep(readyInput({
    profileStatus: { logoAvailable: false },
    seenNoticeIds: new Set([DASHBOARD_NOTICE_KEYS.onboardingSuccess, DASHBOARD_NOTICE_KEYS.addLogo]),
  }));
  assert.equal(dismissed, null);
});

test("Dashboard rendert maximal einen kompakten Hauptschritt ohne Placeholder", () => {
  const nextStepBlock = styles.match(/\.dashboard-next-step \{([^}]*)\}/)?.[1] ?? "";
  assert.match(dashboard, /const nextStep = useMemo/);
  assert.match(dashboard, /\{nextStep \? \(/);
  assert.doesNotMatch(dashboard, /dashboard-legal-status|Status wird geprüft/);
  assert.match(nextStepBlock, /margin-bottom: 18px/);
  assert.doesNotMatch(nextStepBlock, /min-height/);
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*dashboard-next-step[\s\S]*grid-template-columns: auto minmax\(0,1fr\)/);
});

test("Gesehen-Status ist pro Restaurant und Benutzer mit enger RLS gespeichert", () => {
  assert.match(migration, /unique \(restaurant_id, user_id, notice_key\)/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /is_restaurant_admin\(restaurant_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert[\s\S]*authenticated/);
  assert.doesNotMatch(migration, /security definer|grant .* anon/i);
  assert.match(service, /error\.code !== "23505"/);
});

test("V1-Schritte enthalten weder Bonnummer noch Kampagne oder Kassenintegration", () => {
  assert.doesNotMatch(resolverSource, /Bonnummer|Kassensystem|Kampagne/);
  assert.match(resolverSource, /Tages-PIN wird automatisch erzeugt/);
});
