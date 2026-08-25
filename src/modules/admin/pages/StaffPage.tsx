import { FormEvent, useCallback, useEffect, useState } from "react";
import { Ban, MailPlus, RefreshCw, Smartphone, Trash2, UserCheck, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";
import { useAuth } from "../../auth/AuthProvider";
import { buildStaffLoginPath } from "../../auth/staffLoginFlow.mjs";
import { useTenant } from "../../tenant/TenantProvider";
import { STAFF_STATUS_LABELS, staffActionsForStatus, validateStaffInvitation } from "../staffManagementFlow.mjs";
import {
  changeOwnerStaffStatus,
  inviteOwnerStaffMember,
  loadOwnerStaffMembers,
  resendOwnerStaffInvitation,
  type OwnerStaffMember,
} from "../staffManagementService";

type PendingAction = { action: "suspend" | "reactivate" | "archive"; member: OwnerStaffMember };

function formatDate(value: string | null) {
  if (!value) return "Noch nicht";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function StaffPage() {
  const { restaurantRole } = useAuth();
  const { activeRestaurant } = useTenant();
  const [members, setMembers] = useState<OwnerStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const restaurantId = activeRestaurant?.id ?? "";
  const staffTabletPath = activeRestaurant ? buildStaffLoginPath(activeRestaurant.slug) : "/admin";
  const canManage = restaurantRole === "owner" || restaurantRole === "admin";

  const refreshMembers = useCallback(async () => {
    if (!restaurantId || !canManage) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMembers(await loadOwnerStaffMembers(restaurantId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das Team konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [canManage, restaurantId]);

  useEffect(() => {
    void refreshMembers();
  }, [refreshMembers]);

  async function submitInvitation(event: FormEvent) {
    event.preventDefault();
    const validation = validateStaffInvitation({ name, email });
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await inviteOwnerStaffMember(restaurantId, validation.name, validation.email);
      setName("");
      setEmail("");
      setInviteOpen(false);
      setMessage("Die Einladung wurde versendet.");
      await refreshMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Einladung konnte nicht versendet werden.");
    } finally {
      setSaving(false);
    }
  }

  async function resend(member: OwnerStaffMember) {
    setSaving(true);
    setError(null);
    try {
      await resendOwnerStaffInvitation(restaurantId, member.id);
      setMessage("Die Einladung wurde erneut versendet.");
      await refreshMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Einladung konnte nicht versendet werden.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    setSaving(true);
    setError(null);
    try {
      await changeOwnerStaffStatus(restaurantId, pendingAction.member.id, pendingAction.action);
      setMessage(pendingAction.action === "suspend" ? "Der Zugang wurde gesperrt." : pendingAction.action === "reactivate" ? "Der Zugang ist wieder aktiv." : "Der Teamzugang wurde entfernt.");
      setPendingAction(null);
      await refreshMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Teamzugang konnte nicht aktualisiert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <main className="card empty-state-card" role="alert"><Ban size={32} /><h1>Kein Zugriff auf die Teamverwaltung</h1><p className="muted">Nur Owner und berechtigte Restaurant-Administratoren dürfen Teamzugänge verwalten.</p></main>;
  }

  return (
    <>
      <header className="page-header staff-team-header">
        <div>
          <h1>Mitarbeiter</h1>
          <p className="muted">Persönliche Zugänge für dein Team verwalten.</p>
        </div>
        <div className="staff-team-header-actions">
          <Link className="button secondary" to={staffTabletPath}><Smartphone size={18} />Mitarbeiterbereich öffnen</Link>
          {canManage ? <button className="button" onClick={() => { setError(null); setInviteOpen(true); }} type="button"><UserPlus size={18} />Mitarbeiter hinzufügen</button> : null}
        </div>
      </header>

      {message ? <p className="success-message" role="status">{message}</p> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <section aria-busy={loading} aria-label="Teammitglieder" className="staff-team-list">
        {loading ? <article className="card staff-team-empty"><RefreshCw className="spin" size={24} /><p>Team wird geladen …</p></article> : null}
        {!loading && members.map((member) => {
          const actions = staffActionsForStatus(member.status);
          return (
            <article className="card staff-team-row" key={member.id}>
              <div className="staff-team-identity">
                <span className="staff-team-avatar" aria-hidden="true"><UserCheck size={22} /></span>
                <div><h2>{member.name}</h2><p>{member.email}</p></div>
              </div>
              <div className="staff-team-status-block">
                <span className={`staff-team-status staff-team-status-${member.status}`}>{STAFF_STATUS_LABELS[member.status]}</span>
                <span>Rolle: Mitarbeiter</span>
              </div>
              <dl className="staff-team-meta">
                <div><dt>Eingeladen</dt><dd>{formatDate(member.invited_at)}</dd></div>
                <div><dt>Angenommen</dt><dd>{formatDate(member.accepted_at)}</dd></div>
                <div><dt>Letzte Anmeldung</dt><dd>{formatDate(member.last_login_at)}</dd></div>
                <div><dt>Punkteaktionen</dt><dd>{member.points_actions_count}</dd></div>
                <div><dt>Letzte Aktivität</dt><dd>{formatDate(member.last_activity_at)}</dd></div>
              </dl>
              {canManage && actions.length ? (
                <div className="staff-team-actions">
                  {actions.includes("resend") ? <button className="button secondary" disabled={saving} onClick={() => void resend(member)} type="button"><MailPlus size={17} />Erneut senden</button> : null}
                  {actions.includes("suspend") ? <button className="button secondary" disabled={saving} onClick={() => setPendingAction({ action: "suspend", member })} type="button"><Ban size={17} />Sperren</button> : null}
                  {actions.includes("reactivate") ? <button className="button secondary" disabled={saving} onClick={() => setPendingAction({ action: "reactivate", member })} type="button"><UserCheck size={17} />Reaktivieren</button> : null}
                  {actions.includes("archive") ? <button aria-label={`${member.name} aus dem Team entfernen`} className="icon-button danger" disabled={saving} onClick={() => setPendingAction({ action: "archive", member })} title="Aus Team entfernen" type="button"><Trash2 size={18} /></button> : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {!loading && members.length === 0 ? <article className="card empty-state-card staff-team-empty"><Users size={34} /><h2>Noch keine Mitarbeiter</h2><p className="muted">Lade dein erstes Teammitglied mit einer persönlichen E-Mail-Adresse ein.</p>{canManage ? <button className="button" onClick={() => setInviteOpen(true)} type="button"><UserPlus size={18} />Mitarbeiter hinzufügen</button> : null}</article> : null}
      </section>

      <AppDrawer description="Die eingeladene Person erhält einen persönlichen, restaurantbezogenen Zugang." dismissOnOverlay={!saving} footer={<><button className="button secondary" disabled={saving} onClick={() => setInviteOpen(false)} type="button">Abbrechen</button><button className="button" disabled={saving || !name.trim() || !email.trim()} form="staff-invite-form" type="submit">{saving ? "Einladung wird gesendet …" : "Einladung senden"}</button></>} onClose={() => setInviteOpen(false)} open={inviteOpen} size="compact" title="Mitarbeiter hinzufügen">
        <form className="staff-invite-form" id="staff-invite-form" onSubmit={submitInvitation}>
          <RequiredFieldsNote />
          <div className="field"><FormLabel htmlFor="staff-name" required>Name</FormLabel><input aria-required="true" autoComplete="name" className="input" disabled={saving} id="staff-name" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></div>
          <div className="field"><FormLabel htmlFor="staff-email" required>E-Mail-Adresse</FormLabel><input aria-required="true" autoComplete="email" className="input" disabled={saving} id="staff-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div>
          <div className="field"><span>Rolle</span><strong>Mitarbeiter</strong></div>
        </form>
      </AppDrawer>

      <AppDrawer description={pendingAction?.action === "archive" ? "Der Zugang verliert den Restaurantzugriff. Auditdaten bleiben erhalten." : "Die Änderung wirkt sofort auf den Restaurantzugang."} dismissOnOverlay={!saving} footer={<><button className="button secondary" disabled={saving} onClick={() => setPendingAction(null)} type="button">Abbrechen</button><button className="button" disabled={saving} onClick={() => void confirmAction()} type="button">{pendingAction?.action === "suspend" ? "Zugang sperren" : pendingAction?.action === "reactivate" ? "Zugang reaktivieren" : "Aus Team entfernen"}</button></>} onClose={() => setPendingAction(null)} open={Boolean(pendingAction)} size="compact" title={pendingAction?.action === "suspend" ? "Zugang sperren?" : pendingAction?.action === "reactivate" ? "Zugang reaktivieren?" : "Teamzugang entfernen?"}>
        <p><strong>{pendingAction?.member.name}</strong></p>
        <p className="muted">{pendingAction?.member.email}</p>
      </AppDrawer>
    </>
  );
}
