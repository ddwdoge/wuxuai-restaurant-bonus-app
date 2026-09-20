import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import {
  cleanupPlatformForeignTestCustomerRelation,
  cleanupPlatformTestTenant,
  loadPlatformForeignTestCustomerCleanupPreflight,
  loadPlatformKassaComplianceStatus,
  loadPlatformTestTenantCleanupPreflight,
  markPlatformTestTenant,
  type PlatformKassaComplianceStatus,
  type PlatformForeignTestCustomerCleanupPreflight,
  type PlatformTestTenantCleanupPreflight,
} from "./platformAdminService";

const cleanupInventoryLabels: Record<string, string> = {
  organization: "Organisation",
  restaurant: "Restaurant",
  branches: "Standorte",
  owners: "Inhaber",
  staff: "Mitarbeiter",
  customers: "Gäste",
  memberships: "Mitgliedschaften",
  customer_account_memberships: "Gäste-Zuordnungen",
  points: "Punktebuchungen",
  qr_tokens: "QR-Referenzen",
  pin_attempts: "PIN-Versuche",
  rewards: "Belohnungen",
  redemptions: "Einlösungen",
  kassa_acknowledgements: "Kassa-Bestätigungen",
  kassa_open: "Kassenerfassung offen",
  kassa_recorded: "Kassenerfassung bestätigt",
  kassa_owner_reviewed: "Vom Inhaber geprüft",
  offers: "Angebote",
  mail_queue: "E-Mail-Warteschlange",
  notification_state: "Benachrichtigungsstatus",
  audit: "Mandanten-Audit",
  legal_consent: "Recht & Einwilligungen",
  storage: "Speicherobjekte",
  other_tenant_rows: "Weitere Mandantendaten",
};

export function PlatformKassaCompliancePanel({ canWrite, restaurantId }: { canWrite: boolean; restaurantId: string }) {
  const { translateKey: t } = useI18n();
  const [data, setData] = useState<PlatformKassaComplianceStatus | null>(null);
  const [preflight, setPreflight] = useState<PlatformTestTenantCleanupPreflight | null>(null);
  const [foreignCustomerPreflight, setForeignCustomerPreflight] = useState<PlatformForeignTestCustomerCleanupPreflight | null>(null);
  const [foreignCustomerPreflightError, setForeignCustomerPreflightError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState(false);
  const markRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const load = () => {
    setError(false);
    setActionError("");
    setForeignCustomerPreflightError("");
    void loadPlatformKassaComplianceStatus(restaurantId)
      .then(setData)
      .catch(() => setError(true));
    void loadPlatformTestTenantCleanupPreflight(restaurantId)
      .then(setPreflight)
      .catch(() => setPreflight(null));
    void loadPlatformForeignTestCustomerCleanupPreflight(restaurantId)
      .then(setForeignCustomerPreflight)
      .catch((loadError: unknown) => {
        setForeignCustomerPreflight(null);
        const typedError = loadError as { code?: string; message?: string };
        setForeignCustomerPreflightError(
          [typedError?.code, typedError?.message].filter(Boolean).join(": ") || "UNAVAILABLE",
        );
      });
  };
  useEffect(load, [restaurantId]);

  const restaurantName = preflight?.restaurant_name ?? "";
  const strongConfirmation = restaurantName ? `CONFIRMED:${restaurantName}:${restaurantId}` : "";
  const markerMissing = preflight?.blockers.includes("TEST_ONLY_MARKER_MISSING") ?? false;
  const foreignCustomerConfirmation = foreignCustomerPreflight?.test_tenant
    && foreignCustomerPreflight.customer_name
    && foreignCustomerPreflight.customer_id
    && foreignCustomerPreflight.customer_account_id
    ? `CONFIRMED:${foreignCustomerPreflight.test_tenant.name}:${restaurantId}:${foreignCustomerPreflight.customer_name}:${foreignCustomerPreflight.customer_id}:${foreignCustomerPreflight.customer_account_id}`
    : "";

  async function markTestTenant() {
    setSaving(true);
    setActionError("");
    try {
      const latestPreflight = await loadPlatformTestTenantCleanupPreflight(restaurantId);
      setPreflight(latestPreflight);
      const latestConfirmation = latestPreflight.restaurant_name
        ? `CONFIRMED:${latestPreflight.restaurant_name}:${restaurantId}`
        : "";
      if (!latestPreflight.marking_preflight?.eligible || confirmation !== latestConfirmation) {
        throw new Error("TEST_TENANT_PREFLIGHT_BLOCKED");
      }
      const testSessionId = `test-tenant-${restaurantId}`;
      const fingerprint = JSON.stringify({ confirmation, reason, restaurantId, testSessionId });
      if (markRequestRef.current?.fingerprint !== fingerprint) {
        markRequestRef.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
      }
      const result = await markPlatformTestTenant({
        confirmation,
        idempotencyKey: markRequestRef.current.idempotencyKey,
        reason,
        restaurantId,
        testSessionId,
      });
      setPreflight(result);
    } catch {
      setActionError(t("platform.testTenant.markRejected"));
    } finally {
      setSaving(false);
    }
  }

  async function cleanupTestTenant() {
    setSaving(true);
    setActionError("");
    try {
      const result = await cleanupPlatformTestTenant({ confirmation, reason, restaurantId });
      if (result.deleted) setDeleted(true);
    } catch {
      setActionError(t("platform.testTenant.cleanupRejected"));
    } finally {
      setSaving(false);
    }
  }

  async function cleanupForeignCustomerRelation() {
    if (!foreignCustomerPreflight?.customer_id || !foreignCustomerPreflight.customer_account_id || !foreignCustomerPreflight.customer_name) return;
    setSaving(true);
    setActionError("");
    try {
      const result = await cleanupPlatformForeignTestCustomerRelation({
        accountId: foreignCustomerPreflight.customer_account_id,
        confirmation,
        customerId: foreignCustomerPreflight.customer_id,
        customerName: foreignCustomerPreflight.customer_name,
        reason,
        restaurantId,
      });
      if (result.removed) load();
    } catch {
      setActionError(t("platform.testTenant.relationRejected"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="platform-control-section">
      <div className="section-heading">
        <div><h3>{t("platform.kassa.title")}</h3><p className="muted">{t("platform.kassa.description")}</p></div>
        <button aria-label={t("platform.kassa.refresh")} className="button secondary" onClick={load} type="button"><RefreshCw size={17} /></button>
      </div>
      {error ? <p role="alert"><AlertTriangle size={17} /> {t("platform.kassa.unavailable")}</p> : data ? <dl className="platform-detail-list"><div><dt>{t("platform.kassa.acknowledgements")}</dt><dd>{data.acknowledgement_count}</dd></div><div><dt>{t("platform.kassa.open")}</dt><dd>{data.open_count}</dd></div><div><dt>{t("platform.kassa.recorded")}</dt><dd>{data.recorded_count}</dd></div><div><dt>{t("platform.kassa.reviewed")}</dt><dd>{data.owner_reviewed_count}</dd></div><div><dt>{t("platform.kassa.lastTransition")}</dt><dd>{data.last_transition_at ? new Date(data.last_transition_at).toLocaleString() : t("platform.kassa.noEvent")}</dd></div></dl> : <p>{t("platform.kassa.loading")}</p>}

      {preflight && !deleted ? (
        <div className="platform-test-cleanup" data-testid="platform-test-tenant-cleanup">
          <div className="platform-section-title"><div><h4>{t("platform.testTenant.title")}</h4><p className="muted">{t("platform.testTenant.description")}</p></div><ShieldCheck size={20} /></div>
          <p className={`platform-contract-note ${preflight.eligible ? "success" : "warning"}`}>
            {preflight.eligible ? t("platform.testTenant.preflightPassed") : `${t("platform.testTenant.preflightBlocked")}: ${preflight.blockers.join(", ")}`}
          </p>
          {preflight.inventory ? <dl className="platform-detail-list compact">{Object.entries(preflight.inventory).map(([key, value]) => <div key={key}><dt>{key === "owners" ? t("platform.owner") : cleanupInventoryLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : null}
          {canWrite ? <div className="platform-test-cleanup-controls">
            <label>{t("platform.testTenant.reason")}<textarea onChange={(event) => setReason(event.target.value)} placeholder={t("platform.testTenant.reasonPlaceholder")} value={reason} /></label>
            <label>{t("platform.testTenant.strongConfirmation")}<input onChange={(event) => setConfirmation(event.target.value)} placeholder={strongConfirmation} value={confirmation} /></label>
            <p className="muted">{t("platform.testTenant.required")}: <code>{strongConfirmation}</code></p>
            <p className="muted">{t("platform.testTenant.recentAuthRequired")}</p>
            {markerMissing ? <button className="button secondary" disabled={saving || reason.trim().length < 10 || confirmation !== strongConfirmation} onClick={() => void markTestTenant()} type="button">{t("platform.testTenant.mark")}</button> : null}
            <button className="button danger" data-testid="cleanup-test-tenant" disabled={saving || !preflight.eligible || reason.trim().length < 20 || confirmation !== strongConfirmation} onClick={() => void cleanupTestTenant()} type="button"><Trash2 size={17} />{t("platform.testTenant.cleanup")}</button>
          </div> : <p className="muted">{t("platform.testTenant.authorizedOnly")}</p>}
          {actionError ? <p role="alert"><AlertTriangle size={17} /> {actionError}</p> : null}
        </div>
      ) : deleted ? <p className="platform-contract-note success" role="status">{t("platform.testTenant.cleaned")}</p> : null}

      {foreignCustomerPreflight?.customer_id ? (
        <div className="platform-test-cleanup" data-testid="platform-foreign-test-customer-cleanup">
          <div className="platform-section-title"><div><h4>{t("platform.testTenant.foreignTitle")}</h4><p className="muted">{t("platform.testTenant.foreignDescription")}</p></div><ShieldCheck size={20} /></div>
          <p className={`platform-contract-note ${foreignCustomerPreflight.eligible ? "success" : "warning"}`}>
            {foreignCustomerPreflight.eligible ? t("platform.testTenant.narrowPreflightPassed") : `${t("platform.testTenant.narrowPreflightBlocked")}: ${foreignCustomerPreflight.blockers.join(", ")}`}
          </p>
          <dl className="platform-detail-list compact">
            <div><dt>{t("platform.testTenant.tenant")}</dt><dd>{foreignCustomerPreflight.test_tenant?.name}</dd></div>
            <div><dt>{t("platform.testTenant.customer")}</dt><dd>{foreignCustomerPreflight.customer_name}</dd></div>
            <div><dt>{t("platform.testTenant.authId")}</dt><dd><code>{foreignCustomerPreflight.auth_user_id}</code></dd></div>
            <div><dt>{t("platform.testTenant.accountId")}</dt><dd><code>{foreignCustomerPreflight.customer_account_id}</code></dd></div>
            <div><dt>{t("platform.testTenant.localMembershipId")}</dt><dd><code>{foreignCustomerPreflight.local_membership_id}</code></dd></div>
            <div><dt>{t("platform.testTenant.localPointTransactions")}</dt><dd>{foreignCustomerPreflight.local_point_transactions}</dd></div>
            <div><dt>{t("platform.testTenant.localPointBalance")}</dt><dd>{foreignCustomerPreflight.local_point_balance}</dd></div>
            <div><dt>{t("platform.testTenant.localVisits")}</dt><dd>{foreignCustomerPreflight.local_visits_events}</dd></div>
            <div><dt>{t("platform.testTenant.localRewards")}</dt><dd>{foreignCustomerPreflight.local_rewards} / {foreignCustomerPreflight.local_gifts}</dd></div>
            <div><dt>{t("platform.testTenant.localRedemptions")}</dt><dd>{foreignCustomerPreflight.local_redemptions}</dd></div>
            <div><dt>{t("platform.testTenant.localNotifications")}</dt><dd>{foreignCustomerPreflight.local_notifications}</dd></div>
            <div><dt>{t("platform.testTenant.foreignMemberships")}</dt><dd>{foreignCustomerPreflight.foreign_restaurant_memberships}</dd></div>
            <div><dt>{t("platform.testTenant.foreignPointTransactions")}</dt><dd>{foreignCustomerPreflight.foreign_point_transactions}</dd></div>
            <div><dt>{t("platform.testTenant.foreignDataChanged")}</dt><dd>{foreignCustomerPreflight.foreign_data_to_be_changed}</dd></div>
          </dl>
          {canWrite ? <div className="platform-test-cleanup-controls">
            <p className="muted">{t("platform.testTenant.relationConfirmation")}</p>
            <p className="muted">{t("platform.testTenant.required")}: <code>{foreignCustomerConfirmation}</code></p>
            <button className="button danger" data-testid="cleanup-foreign-test-customer" disabled={saving || !foreignCustomerPreflight.eligible || reason.trim().length < 20 || confirmation !== foreignCustomerConfirmation} onClick={() => void cleanupForeignCustomerRelation()} type="button"><Trash2 size={17} />{t("platform.testTenant.removeForeign")}</button>
          </div> : <p className="muted">{t("platform.testTenant.authorizedRemoveOnly")}</p>}
        </div>
      ) : null}
      {foreignCustomerPreflightError ? (
        <p className="platform-contract-note warning" data-testid="platform-foreign-test-customer-preflight-error" role="alert">
          {t("platform.testTenant.preflightUnavailable")}: {foreignCustomerPreflightError}
        </p>
      ) : null}
    </section>
  );
}
