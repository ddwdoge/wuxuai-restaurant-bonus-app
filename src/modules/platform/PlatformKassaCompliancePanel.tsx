import { useEffect, useState } from "react";
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
  const { translateKey } = useI18n();
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
      const result = await markPlatformTestTenant({
        confirmation,
        reason,
        restaurantId,
        testSessionId: "kassa-v3-20260908",
      });
      setPreflight(result);
    } catch {
      setActionError("Die TEST-ONLY-Markierung wurde sicher abgelehnt.");
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
      setActionError("Der Test-Tenant wurde nicht gelöscht. Preflight und Bestätigung prüfen.");
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
      setActionError("Die fremde Test-Zuordnung wurde nicht entfernt. Ziel, Preflight und Bestätigung prüfen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="platform-control-section">
      <div className="section-heading">
        <div><h3>{translateKey("platform.kassa.title")}</h3><p className="muted">{translateKey("platform.kassa.description")}</p></div>
        <button aria-label={translateKey("platform.kassa.refresh")} className="button secondary" onClick={load} type="button"><RefreshCw size={17} /></button>
      </div>
      {error ? <p role="alert"><AlertTriangle size={17} /> {translateKey("platform.kassa.unavailable")}</p> : data ? <dl className="platform-detail-list"><div><dt>{translateKey("platform.kassa.acknowledgements")}</dt><dd>{data.acknowledgement_count}</dd></div><div><dt>{translateKey("platform.kassa.open")}</dt><dd>{data.open_count}</dd></div><div><dt>{translateKey("platform.kassa.recorded")}</dt><dd>{data.recorded_count}</dd></div><div><dt>{translateKey("platform.kassa.reviewed")}</dt><dd>{data.owner_reviewed_count}</dd></div><div><dt>{translateKey("platform.kassa.lastTransition")}</dt><dd>{data.last_transition_at ? new Date(data.last_transition_at).toLocaleString() : translateKey("platform.kassa.noEvent")}</dd></div></dl> : <p>{translateKey("platform.kassa.loading")}</p>}

      {preflight && !deleted ? (
        <div className="platform-test-cleanup" data-testid="platform-test-tenant-cleanup">
          <div className="platform-section-title"><div><h4>Isolierter Test-Tenant</h4><p className="muted">Nur der serverseitige TEST-ONLY-Vertrag darf Testdaten vollständig bereinigen.</p></div><ShieldCheck size={20} /></div>
          <p className={`platform-contract-note ${preflight.eligible ? "success" : "warning"}`}>
            {preflight.eligible ? "Preflight bestanden. Mandant ist für die kontrollierte Bereinigung geeignet." : `Preflight blockiert: ${preflight.blockers.join(", ")}`}
          </p>
          {preflight.inventory ? <dl className="platform-detail-list compact">{Object.entries(preflight.inventory).map(([key, value]) => <div key={key}><dt>{key === "owners" ? translateKey("platform.owner") : cleanupInventoryLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : null}
          {canWrite ? <div className="platform-test-cleanup-controls">
            <label>Begründung<textarea onChange={(event) => setReason(event.target.value)} placeholder="Interner Grund für Testmarkierung und spätere Bereinigung" value={reason} /></label>
            <label>Starke Bestätigung<input onChange={(event) => setConfirmation(event.target.value)} placeholder={strongConfirmation} value={confirmation} /></label>
            <p className="muted">Erforderlich: <code>{strongConfirmation}</code></p>
            {markerMissing ? <button className="button secondary" disabled={saving || reason.trim().length < 10 || confirmation !== strongConfirmation} onClick={() => void markTestTenant()} type="button">Als TEST-ONLY markieren</button> : null}
            <button className="button danger" data-testid="cleanup-test-tenant" disabled={saving || !preflight.eligible || reason.trim().length < 20 || confirmation !== strongConfirmation} onClick={() => void cleanupTestTenant()} type="button"><Trash2 size={17} />Test-Tenant vollständig bereinigen</button>
          </div> : <p className="muted">Nur berechtigte Platform Admins dürfen Test-Tenants markieren oder bereinigen.</p>}
          {actionError ? <p role="alert"><AlertTriangle size={17} /> {actionError}</p> : null}
        </div>
      ) : deleted ? <p className="platform-contract-note success" role="status">Der isolierte Test-Tenant wurde vollständig bereinigt.</p> : null}

      {foreignCustomerPreflight?.customer_id ? (
        <div className="platform-test-cleanup" data-testid="platform-foreign-test-customer-cleanup">
          <div className="platform-section-title"><div><h4>Fremde Test-Zuordnung</h4><p className="muted">Entfernt ausschließlich die versehentliche Beziehung dieses Kunden zum markierten Test-Tenant.</p></div><ShieldCheck size={20} /></div>
          <p className={`platform-contract-note ${foreignCustomerPreflight.eligible ? "success" : "warning"}`}>
            {foreignCustomerPreflight.eligible ? "Enger Preflight bestanden." : `Enger Preflight blockiert: ${foreignCustomerPreflight.blockers.join(", ")}`}
          </p>
          <dl className="platform-detail-list compact">
            <div><dt>Test-Tenant</dt><dd>{foreignCustomerPreflight.test_tenant?.name}</dd></div>
            <div><dt>Kunde</dt><dd>{foreignCustomerPreflight.customer_name}</dd></div>
            <div><dt>Auth-ID</dt><dd><code>{foreignCustomerPreflight.auth_user_id}</code></dd></div>
            <div><dt>Account-ID</dt><dd><code>{foreignCustomerPreflight.customer_account_id}</code></dd></div>
            <div><dt>Lokale Membership-ID</dt><dd><code>{foreignCustomerPreflight.local_membership_id}</code></dd></div>
            <div><dt>Lokale Punktebuchungen</dt><dd>{foreignCustomerPreflight.local_point_transactions}</dd></div>
            <div><dt>Lokaler Punktestand</dt><dd>{foreignCustomerPreflight.local_point_balance}</dd></div>
            <div><dt>Lokale Visits/Events</dt><dd>{foreignCustomerPreflight.local_visits_events}</dd></div>
            <div><dt>Lokale Rewards/Gifts</dt><dd>{foreignCustomerPreflight.local_rewards} / {foreignCustomerPreflight.local_gifts}</dd></div>
            <div><dt>Lokale Einlösungen</dt><dd>{foreignCustomerPreflight.local_redemptions}</dd></div>
            <div><dt>Lokale Benachrichtigungen</dt><dd>{foreignCustomerPreflight.local_notifications}</dd></div>
            <div><dt>Fremde Memberships</dt><dd>{foreignCustomerPreflight.foreign_restaurant_memberships}</dd></div>
            <div><dt>Fremde Punktebuchungen</dt><dd>{foreignCustomerPreflight.foreign_point_transactions}</dd></div>
            <div><dt>Fremddaten werden geändert</dt><dd>{foreignCustomerPreflight.foreign_data_to_be_changed}</dd></div>
          </dl>
          {canWrite ? <div className="platform-test-cleanup-controls">
            <p className="muted">Begründung und Bestätigung aus dem Test-Tenant-Cleanup gelten auch für diese eng begrenzte Aktion.</p>
            <p className="muted">Erforderlich: <code>{foreignCustomerConfirmation}</code></p>
            <button className="button danger" data-testid="cleanup-foreign-test-customer" disabled={saving || !foreignCustomerPreflight.eligible || reason.trim().length < 20 || confirmation !== foreignCustomerConfirmation} onClick={() => void cleanupForeignCustomerRelation()} type="button"><Trash2 size={17} />Nur fremde Test-Zuordnung entfernen</button>
          </div> : <p className="muted">Nur berechtigte Platform Admins dürfen diese Test-Zuordnung entfernen.</p>}
        </div>
      ) : null}
      {foreignCustomerPreflightError ? (
        <p className="platform-contract-note warning" data-testid="platform-foreign-test-customer-preflight-error" role="alert">
          Enger Preflight nicht verfügbar: {foreignCustomerPreflightError}
        </p>
      ) : null}
    </section>
  );
}
