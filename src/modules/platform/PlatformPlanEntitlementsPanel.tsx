import { useCallback, useEffect, useState } from "react";
import { Bell, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import {
  loadRestaurantEntitlements,
  updatePlatformRestaurantEntitlements,
  type CommercialPlan,
  type RestaurantEntitlements,
} from "./platformAdminService";

type Props = {
  canWrite: boolean;
  restaurantId: string;
};

const planLabels: Record<CommercialPlan, string> = {
  BASIC: "Basic",
  PRO: "Pro",
  PREMIUM: "Premium",
};

function limitLabel(limit: number | null, unlimited: boolean | null | undefined) {
  return unlimited ? "Unbegrenzt" : limit == null ? "Nicht überschrieben" : String(limit);
}

function statusLabel(value: boolean | null | undefined) {
  return value == null ? "Nicht überschrieben" : value ? "Aktiv" : "Inaktiv";
}

export function PlatformPlanEntitlementsPanel({ canWrite, restaurantId }: Props) {
  const [data, setData] = useState<RestaurantEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<CommercialPlan>("BASIC");
  const [limit, setLimit] = useState("5");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadRestaurantEntitlements(restaurantId);
      setData(next);
      setPlan(next.plan_key);
      setLimit(next.effective.offer_limit_unlimited ? "UNLIMITED" : String(next.effective.offer_limit ?? 5));
    } catch {
      setError("Plan und Funktionen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(input: Parameters<typeof updatePlatformRestaurantEntitlements>[0]) {
    if (reason.trim().length < 10 || confirmation !== "CONFIRMED") {
      setError("Gib eine Begründung mit mindestens 10 Zeichen und CONFIRMED ein.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updatePlatformRestaurantEntitlements(input);
      setMessage("Plan und Funktionen wurden nachvollziehbar aktualisiert.");
      setConfirmation("");
      await reload();
    } catch {
      setError("Die Änderung wurde nicht gespeichert. Prüfe Berechtigung und Eingaben.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="platform-control-section"><p className="muted">Plan und Funktionen werden geladen …</p></section>;
  if (!data) return <section className="platform-control-section" role="alert"><p>{error}</p><button className="button secondary" onClick={() => void reload()} type="button"><RefreshCw size={18} />Erneut versuchen</button></section>;

  const common = { restaurantId, reason: reason.trim(), confirmation: "CONFIRMED" as const };
  return (
    <section className="platform-control-section platform-entitlements" aria-labelledby="platform-entitlements-title">
      <div className="platform-section-title">
        <div><h3 id="platform-entitlements-title">Plan &amp; Funktionen</h3><p className="muted">Paketstandard und manuelle Support-Ausnahme bleiben sichtbar getrennt.</p></div>
        <PackageCheck aria-hidden="true" size={22} />
      </div>

      <div className="platform-entitlement-summary">
        <dl className="platform-detail-list">
          <div><dt>Aktuelles Paket</dt><dd>{planLabels[data.plan_key]}</dd></div>
          <div><dt>Preis</dt><dd>{data.monthly_price_eur_ex_vat} € / Monat exkl. USt.</dd></div>
          <div><dt>Paketstandard Angebote</dt><dd>{limitLabel(data.commercial_default.offer_limit, data.commercial_default.offer_limit_unlimited)}</dd></div>
          <div><dt>Manuelle Ausnahme</dt><dd>{data.override ? limitLabel(data.override.offer_limit ?? null, data.override.offer_limit_unlimited) : "Keine"}</dd></div>
          <div><dt>Wirksames Angebotslimit</dt><dd>{limitLabel(data.effective.offer_limit, data.effective.offer_limit_unlimited)}</dd></div>
          <div><dt>Aktive Angebote</dt><dd>{data.active_offer_count}</dd></div>
          <div><dt>Angebotsbenachrichtigungen</dt><dd>{data.effective.offer_notifications ? "Aktiv" : "Inaktiv"}</dd></div>
          <div><dt>Belohnungsbenachrichtigungen</dt><dd>{data.effective.reward_notifications ? "Aktiv" : "Inaktiv"}</dd></div>
          <div><dt>Geschenkkarten</dt><dd>Nicht verfügbar / noch nicht aktiviert</dd></div>
          <div><dt>Kassenanbindung</dt><dd>Nicht verfügbar / noch nicht aktiviert</dd></div>
        </dl>
        {data.override ? <p className="platform-contract-note"><strong>Support-Ausnahme:</strong> {data.override.reason}<br />Letzte Änderung: {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.override.changed_at))}</p> : null}
      </div>

      {canWrite ? (
        <div className="platform-entitlement-controls">
          <label>Paket<select disabled={saving} onChange={(event) => setPlan(event.target.value as CommercialPlan)} value={plan}><option value="BASIC">Basic</option><option value="PRO">Pro</option><option value="PREMIUM">Premium · technisch vorbereitet</option></select></label>
          <button className="button secondary" disabled={saving || plan === data.plan_key} onClick={() => void run({ ...common, action: "PLAN_CHANGED", planKey: plan })} type="button"><PackageCheck size={18} />Paket speichern</button>

          <label>Angebotslimit<select disabled={saving} onChange={(event) => setLimit(event.target.value)} value={limit}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}<option value="UNLIMITED">Unbegrenzt</option></select></label>
          <button className="button secondary" disabled={saving} onClick={() => void run({ ...common, action: "OFFER_LIMIT_OVERRIDE_CHANGED", offerLimit: limit === "UNLIMITED" ? null : Number(limit), offerLimitUnlimited: limit === "UNLIMITED" })} type="button"><ShieldCheck size={18} />Limit überschreiben</button>

          <div className="platform-entitlement-toggle-row"><span><Bell size={18} />Angebotsbenachrichtigungen</span><strong>{statusLabel(data.override?.offer_notifications)}</strong><button className="button secondary" disabled={saving} onClick={() => void run({ ...common, action: "OFFER_NOTIFICATIONS_CHANGED", enabled: !data.effective.offer_notifications })} type="button">{data.effective.offer_notifications ? "Deaktivieren" : "Aktivieren"}</button></div>
          <div className="platform-entitlement-toggle-row"><span><Bell size={18} />Belohnungsbenachrichtigungen</span><strong>{statusLabel(data.override?.reward_notifications)}</strong><button className="button secondary" disabled={saving} onClick={() => void run({ ...common, action: "REWARD_NOTIFICATIONS_CHANGED", enabled: !data.effective.reward_notifications })} type="button">{data.effective.reward_notifications ? "Deaktivieren" : "Aktivieren"}</button></div>

          <label>Begründung<textarea onChange={(event) => setReason(event.target.value)} placeholder="Interner Grund für diese Änderung" rows={3} value={reason} /></label>
          <label>Bestätigung<input autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} placeholder="CONFIRMED" value={confirmation} /></label>
          <button className="button secondary" disabled={saving || !data.override} onClick={() => void run({ ...common, action: "ENTITLEMENT_OVERRIDE_CLEARED" })} type="button">Manuelle Ausnahmen entfernen</button>
        </div>
      ) : <p className="muted">Nur Ansicht. Deine Plattformrolle darf Pläne und Funktionen nicht ändern.</p>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}
    </section>
  );
}
