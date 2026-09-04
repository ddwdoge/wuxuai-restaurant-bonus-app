import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gift, KeyRound, Mail, QrCode, RefreshCw, ShieldAlert, UserRoundCog, Users, WalletCards } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import {
  executePlatformAdminOperation,
  loadPlatformRestaurantOperations,
  requestPlatformAuthSupport,
  type PlatformOperationAction,
  type PlatformRestaurantOperations,
} from "./platformAdminService";

type Section = "overview" | "support" | "activity" | "security" | "billing" | "actions";
type PendingAction = {
  action: PlatformOperationAction | "owner_confirmation_resend" | "owner_password_recovery" | "staff_invitation_resend";
  entityId?: string | null;
  label: string;
  severity: "NORMAL" | "SENSITIVE" | "CRITICAL";
  payload?: Record<string, unknown>;
};

const sectionLabels: Record<Section, string> = {
  overview: "Übersicht", support: "Support", activity: "Aktivität", security: "Sicherheit", billing: "Abrechnung", actions: "Aktionen",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function State({ ok, yes = "In Ordnung", no = "Prüfung erforderlich" }: { ok: boolean; yes?: string; no?: string }) {
  return <span className={`platform-operation-state ${ok ? "success" : "warning"}`}>{ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{ok ? yes : no}</span>;
}

function Empty({ children }: { children: string }) {
  return <p className="platform-operation-empty">{children}</p>;
}

export function PlatformOperationsPanel({ restaurantId, canWrite }: { restaurantId: string; canWrite: boolean }) {
  const [data, setData] = useState<PlatformRestaurantOperations | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [correction, setCorrection] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setData(await loadPlatformRestaurantOperations(restaurantId)); }
    catch { setError("Betriebsdaten konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }

  useEffect(() => { setSection("overview"); setMessage(""); void load(); }, [restaurantId]);
  useEffect(() => { setReason(""); setReference(""); setConfirmation(""); }, [pending]);

  const selectedCustomer = useMemo(() => data?.customers.find((customer) => customer.id === customerId) ?? null, [customerId, data]);

  function open(action: PendingAction) { if (canWrite) setPending(action); }

  async function confirm() {
    if (!pending || !data) return;
    setSaving(true); setError(""); setMessage("");
    try {
      if (["owner_confirmation_resend", "owner_password_recovery", "staff_invitation_resend"].includes(pending.action)) {
        await requestPlatformAuthSupport({
          restaurantId, entityId: pending.entityId!, action: pending.action as "owner_confirmation_resend" | "owner_password_recovery" | "staff_invitation_resend",
          reason, supportReference: reference,
        });
      } else {
        await executePlatformAdminOperation({
          restaurantId, action: pending.action as PlatformOperationAction, entityId: pending.entityId,
          reason, supportReference: reference,
          confirmation: pending.severity === "CRITICAL" ? `CONFIRMED:${data.restaurant.name}` : pending.severity === "SENSITIVE" ? "CONFIRMED" : undefined,
          payload: pending.payload,
        });
      }
      setPending(null); setMessage("Aktion wurde ausgeführt und auditiert."); await load();
    } catch (caught) {
      const detail = caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string"
        ? caught.message
        : "Berechtigung und Eingaben prüfen.";
      setError(`Aktion wurde nicht ausgeführt. ${detail}`);
    }
    finally { setSaving(false); }
  }

  if (loading) return <section className="platform-operations-panel"><p>Betriebsdaten werden geladen …</p></section>;
  if (!data) return <section className="platform-operations-panel" role="alert"><p>{error}</p><button className="button secondary" onClick={() => void load()} type="button"><RefreshCw size={18} />Erneut versuchen</button></section>;

  const strongConfirmationValid = pending?.severity !== "CRITICAL" || confirmation === data.restaurant.name;
  const reasonValid = pending?.severity === "NORMAL" || reason.trim().length >= 10;
  const correctionValue = Number(correction);

  return (
    <section className="platform-operations-panel" aria-labelledby="platform-operations-title">
      <header className="platform-operations-header"><div><span className="admin-brand-kicker">Interner Betrieb</span><h3 id="platform-operations-title">Support & Verwaltung</h3><p>Explizite Aktionen mit Berechtigungsprüfung und unveränderbarem Audit.</p></div><button className="button secondary" onClick={() => void load()} type="button"><RefreshCw size={18} />Aktualisieren</button></header>
      {message ? <p className="status-message" role="status">{message}</p> : null}
      {error ? <p className="status-message error" role="alert">{error}</p> : null}
      <nav className="platform-operations-tabs" aria-label="Betriebsbereiche">{(Object.keys(sectionLabels) as Section[]).map((key) => <button aria-current={section === key ? "page" : undefined} className={section === key ? "active" : ""} key={key} onClick={() => setSection(key)} type="button">{sectionLabels[key]}</button>)}</nav>

      {section === "overview" ? <div className="platform-operations-grid">
        <article><h4>Restaurant</h4><dl><div><dt>Betriebsstatus</dt><dd>{data.restaurant.status}</dd></div><div><dt>Veröffentlicht</dt><dd>{data.restaurant.published ? "Ja" : "Nein"}</dd></div><div><dt>Tenant</dt><dd>{data.restaurant.organization_status ?? "–"}</dd></div></dl></article>
        <article><h4>Betreiber</h4><State ok={data.owner.email_confirmed} yes="E-Mail bestätigt" no="E-Mail offen" /><State ok={data.owner.membership_present} yes="Mitgliedschaft vorhanden" no="Mitgliedschaft fehlt" /><p>Letzte Anmeldung: {formatDate(data.owner.last_sign_in_at)}</p></article>
        <article><h4>Bestände</h4><dl><div><dt>Mitarbeiter</dt><dd>{data.staff.length}</dd></div><div><dt>Gäste</dt><dd>{data.customers.length}</dd></div><div><dt>Punktebuchungen</dt><dd>{data.points_journal.length}</dd></div><div><dt>Sicherheitsfälle</dt><dd>{data.security_flags.filter((flag) => flag.status === "OPEN").length}</dd></div></dl></article>
      </div> : null}

      {section === "support" ? <div className="platform-support-stack">
        <article><header><UserRoundCog size={20} /><div><h4>Betreiber-Support</h4><p>{data.owner.email ?? "E-Mail nicht verfügbar"}</p></div></header><div className="platform-actions">
          <button className="button secondary" disabled={!canWrite || data.owner.email_confirmed} onClick={() => open({ action: "owner_confirmation_resend", entityId: data.owner.user_id, label: "Bestätigung erneut senden", severity: "SENSITIVE" })} type="button">Bestätigung erneut senden</button>
          <button className="button secondary" disabled={!canWrite} onClick={() => open({ action: "owner_password_recovery", entityId: data.owner.user_id, label: "Passwort-Wiederherstellung senden", severity: "SENSITIVE" })} type="button">Passwort-Wiederherstellung</button>
          <button className="button secondary" disabled={!canWrite || data.owner.membership_present} onClick={() => open({ action: "owner_membership_repair", entityId: data.owner.user_id, label: "Betreiberzuordnung reparieren", severity: "SENSITIVE" })} type="button">Zuordnung reparieren</button>
        </div></article>
        <article><header><Users size={20} /><div><h4>Mitarbeiter</h4><p>Status, Auth-Verknüpfung und Mitgliedschaft.</p></div></header>{data.staff.length ? <div className="platform-support-list">{data.staff.map((staff) => <div key={staff.id}><span><strong>{staff.name}</strong><small>{staff.email ?? "Keine E-Mail"} · {staff.status} · Auth {staff.auth_linked ? "vorhanden" : "offen"}</small></span><div className="platform-actions"><button className="button secondary" disabled={!canWrite || !staff.email} onClick={() => open({ action: "staff_invitation_resend", entityId: staff.id, label: "Einladung erneut senden", severity: "SENSITIVE" })} type="button">Einladung senden</button><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: staff.active ? "staff_suspend" : "staff_reactivate", entityId: staff.id, label: staff.active ? "Mitarbeiter sperren" : "Mitarbeiter reaktivieren", severity: "SENSITIVE" })} type="button">{staff.active ? "Sperren" : "Reaktivieren"}</button><button className="button secondary" disabled={!canWrite || staff.status !== "invited"} onClick={() => open({ action: "staff_invitation_revoke", entityId: staff.id, label: "Einladung widerrufen", severity: "SENSITIVE" })} type="button">Einladung widerrufen</button></div></div>)}</div> : <Empty>Noch keine Mitarbeiter.</Empty>}</article>
        <article><header><Users size={20} /><div><h4>Gäste</h4><p>Identität, Mitgliedschaft und Punktestand.</p></div></header>{data.customers.length ? <div className="platform-support-list">{data.customers.map((customer) => <div key={customer.id}><span><strong>{customer.name}</strong><small>{customer.points_balance} Punkte · {customer.membership_status} · Konto {customer.auth_linked ? "verknüpft" : "offen"}</small></span><div className="platform-actions"><button className="button secondary" disabled={!canWrite || customer.central_membership_present || !customer.auth_linked} onClick={() => open({ action: "customer_membership_repair", entityId: customer.id, label: "Kundenzuordnung reparieren", severity: "SENSITIVE" })} type="button">Zuordnung reparieren</button><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: customer.membership_status === "active" ? "customer_deactivate" : "customer_reactivate", entityId: customer.id, label: customer.membership_status === "active" ? "Mitgliedschaft einschränken" : "Mitgliedschaft reaktivieren", severity: "SENSITIVE" })} type="button">{customer.membership_status === "active" ? "Einschränken" : "Reaktivieren"}</button></div></div>)}</div> : <Empty>Noch keine Gäste.</Empty>}</article>
      </div> : null}

      {section === "activity" ? <div className="platform-support-stack">
        <article><header><WalletCards size={20} /><div><h4>Punktejournale</h4><p>Letzte 100 Buchungen mit Quelle und Akteur.</p></div></header>{data.points_journal.length ? <div className="platform-data-table" role="table">{data.points_journal.map((row) => <div key={row.id} role="row"><span>{formatDate(row.created_at)}</span><strong>{row.points > 0 ? "+" : ""}{row.points}</strong><span>{row.type} · {row.source ?? "Quelle unbekannt"}</span></div>)}</div> : <Empty>Keine Punktebuchungen.</Empty>}</article>
        <article><header><Gift size={20} /><div><h4>Geschenke & Einlösungen</h4><p>Zustände ohne manuelle Zuteilung.</p></div></header><dl className="platform-summary-list"><div><dt>Geschenkzuordnungen</dt><dd>{data.gifts.length}</dd></div><div><dt>Einlösejournal</dt><dd>{data.redemptions.length}</dd></div></dl>{data.gift_presentations.filter((item) => item.status === "REDEMPTION_STARTED").map((item) => <div className="platform-support-list" key={item.id}><div><span><strong>Offene Präsentation</strong><small>Gültig bis {formatDate(item.expires_at)}</small></span><button className="button secondary" disabled={!canWrite || new Date(item.expires_at) > new Date()} onClick={() => open({ action: "gift_presentation_expire", entityId: item.id, label: "Festgefahrene Präsentation schließen", severity: "SENSITIVE" })} type="button">Abgelaufenen Zustand schließen</button></div></div>)}</article>
        <article><header><Mail size={20} /><div><h4>E-Mail-Warteschlange</h4><p>Fehlgeschlagene Einträge können erneut eingeplant werden.</p></div></header>{data.mail_queue.length ? <div className="platform-support-list">{data.mail_queue.map((mail) => <div key={mail.id}><span><strong>{mail.event_type}</strong><small>{mail.status} · Versuche {mail.attempt_count} · {formatDate(mail.available_at)}</small></span><button className="button secondary" disabled={!canWrite || mail.status !== "FAILED"} onClick={() => open({ action: "transactional_mail_retry", entityId: mail.id, label: "E-Mail erneut einplanen", severity: "SENSITIVE" })} type="button">Erneut einplanen</button></div>)}</div> : <Empty>Keine E-Mail-Einträge.</Empty>}</article>
      </div> : null}

      {section === "security" ? <div className="platform-support-stack">
        <article><header><QrCode size={20} /><div><h4>QR-Diagnose</h4><p>Hashes und Codes werden nicht angezeigt.</p></div></header>{data.qr_evidence.length ? <div className="platform-support-list">{data.qr_evidence.map((qr) => <div key={qr.id}><span><strong>{qr.consumed_at ? "Verbraucht" : qr.revoked_at ? "Ungültig" : new Date(qr.expires_at) <= new Date() ? "Abgelaufen" : "Aktiv"}</strong><small>Gültig bis {formatDate(qr.expires_at)}</small></span><button className="button secondary" disabled={!canWrite || Boolean(qr.consumed_at || qr.revoked_at)} onClick={() => open({ action: "qr_invalidate", entityId: qr.id, label: "QR ungültig machen", severity: "SENSITIVE" })} type="button">Ungültig machen</button></div>)}</div> : <Empty>Keine QR-Aktivität.</Empty>}</article>
        <article><header><KeyRound size={20} /><div><h4>PIN-Diagnose</h4><p>Nur Fehlversuche und Sperrzustände, niemals PIN-Werte.</p></div></header>{data.pin_evidence.length ? <div className="platform-data-table">{data.pin_evidence.map((pin) => <div key={pin.id}><span>{pin.valid_date}</span><strong>{pin.failed_attempts} Fehlversuche</strong><span>{pin.locked_until ? `Gesperrt bis ${formatDate(pin.locked_until)}` : "Nicht gesperrt"}</span></div>)}</div> : <Empty>Keine PIN-Fehlversuche.</Empty>}</article>
        <article><header><ShieldAlert size={20} /><div><h4>Sicherheitskennzeichnungen</h4><p>Tenant-bezogene interne Bearbeitungsfälle.</p></div></header><div className="platform-actions"><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: "security_flag_set", label: "Tenant-Prüfung markieren", severity: "SENSITIVE", payload: { flag_key: "tenant_review" } })} type="button">Prüfung markieren</button><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: "security_flag_clear", label: "Tenant-Prüfung abschließen", severity: "SENSITIVE", payload: { flag_key: "tenant_review" } })} type="button">Prüfung abschließen</button></div>{data.security_flags.length ? <div className="platform-data-table">{data.security_flags.map((flag) => <div key={flag.id}><strong>{flag.flag_key}</strong><span>{flag.status}</span><span>{flag.reason}</span></div>)}</div> : <Empty>Keine Sicherheitskennzeichnungen.</Empty>}</article>
      </div> : null}

      {section === "billing" ? <article className="platform-operation-notice"><ShieldAlert size={22} /><div><h4>Abrechnung ist getrennt</h4><p>Restaurantbetrieb und Veröffentlichung ändern keinen Zahlungsstatus. Manuelle Werte „bezahlt“ und „manuell“ sind bis zur Stripe-Integration serverseitig gesperrt.</p></div></article> : null}

      {section === "actions" ? <div className="platform-support-stack">
        <article><h4>Restaurant & Veröffentlichung</h4><div className="platform-actions"><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: data.restaurant.status === "active" ? "restaurant_inactivate" : "restaurant_activate", label: data.restaurant.status === "active" ? "Restaurant deaktivieren" : "Restaurant aktivieren", severity: "NORMAL" })} type="button">{data.restaurant.status === "active" ? "Deaktivieren" : "Aktivieren"}</button><button className="button secondary" disabled={!canWrite} onClick={() => open({ action: data.restaurant.published ? "restaurant_unpublish" : "restaurant_publish", label: data.restaurant.published ? "Veröffentlichung aufheben" : "Restaurant veröffentlichen", severity: "SENSITIVE" })} type="button">{data.restaurant.published ? "Veröffentlichung aufheben" : "Veröffentlichen"}</button></div></article>
        <article><h4>Kontrollierte Punktekorrektur</h4><div className="platform-correction-form"><label className="field"><span>Gast</span><select className="input" onChange={(event) => setCustomerId(event.target.value)} value={customerId}><option value="">Gast auswählen</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.points_balance} Punkte</option>)}</select></label><label className="field"><span>Korrektur</span><input className="input" inputMode="numeric" max="500" min="-500" onChange={(event) => setCorrection(event.target.value)} type="number" value={correction} /></label><button className="button secondary" disabled={!canWrite || !selectedCustomer || !Number.isInteger(correctionValue) || correctionValue === 0 || Math.abs(correctionValue) > 500} onClick={() => open({ action: "points_support_correction", entityId: customerId, label: "Punktekorrektur buchen", severity: "SENSITIVE", payload: { amount: correctionValue } })} type="button">Korrektur prüfen</button></div></article>
        <article className="platform-critical-zone"><h4>Tenant-Sicherheit</h4><p>Die Sperre betrifft den gesamten Tenant, löscht aber keine Daten und ändert keinen Zahlungsstatus.</p><button className="button danger" disabled={!canWrite} onClick={() => open({ action: data.restaurant.status === "suspended" ? "tenant_unsuspend" : "tenant_suspend", label: data.restaurant.status === "suspended" ? "Tenant entsperren" : "Tenant sperren", severity: "CRITICAL" })} type="button">{data.restaurant.status === "suspended" ? "Tenant entsperren" : "Tenant sperren"}</button></article>
      </div> : null}

      <AppDrawer description={`${pending?.severity ?? ""} · ${pending?.label ?? ""}`} dismissOnOverlay={false} footer={pending ? <><button className="button secondary" disabled={saving} onClick={() => setPending(null)} type="button">Abbrechen</button><button className="button" data-drawer-autofocus disabled={saving || !reasonValid || !strongConfirmationValid} onClick={() => void confirm()} type="button">{saving ? "Wird ausgeführt …" : "Verbindlich ausführen"}</button></> : null} onClose={() => setPending(null)} open={Boolean(pending)} size="compact" title={pending?.label ?? "Aktion bestätigen"}>
        {pending ? <div className="platform-confirmation-form"><p>Schweregrad: <strong>{pending.severity}</strong></p>{pending.severity !== "NORMAL" ? <label className="field"><span>Begründung</span><textarea className="input" onChange={(event) => setReason(event.target.value)} rows={3} value={reason} /></label> : null}<label className="field"><span>Support-Referenz (optional)</span><input className="input" onChange={(event) => setReference(event.target.value)} value={reference} /></label>{pending.severity === "CRITICAL" ? <label className="field"><span>Zur Bestätigung Restaurantname eingeben</span><input className="input" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /><small>{data.restaurant.name}</small></label> : null}</div> : null}
      </AppDrawer>
    </section>
  );
}
