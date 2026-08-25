import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import { PublicContentCard, PublicFormField, PublicPageShell, PublicPrimaryButton } from "../public/PublicPageComponents";
import { validateStaffInvitePassword } from "./staffInviteFlow.mjs";
import { clearStaffInviteUrl, completeStaffInvite, establishStaffInviteSession } from "./staffInviteService";
import { buildStaffLoginPath } from "./staffLoginFlow.mjs";

export function StaffInvitePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    establishStaffInviteSession()
      .then(() => {
        clearStaffInviteUrl();
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        clearStaffInviteUrl();
        if (!cancelled) setError("Diese Einladung ist ungültig oder abgelaufen.");
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateStaffInvitePassword(password, confirmation);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await completeStaffInvite(password);
      navigate(buildStaffLoginPath(result.restaurantSlug), { replace: true, state: { logoutMessage: "Dein Mitarbeiterzugang ist bereit. Du kannst dich jetzt anmelden." } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Zugang konnte nicht eingerichtet werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPageShell description="Lege dein persönliches Passwort für den Mitarbeiterbereich fest." eyebrow="Sicherer Teamzugang" title="Einladung annehmen">
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><KeyRound size={28} /></div>
        {ready ? <form className="public-premium-form" onSubmit={handleSubmit}><RequiredFieldsNote /><PublicFormField autoComplete="new-password" disabled={loading} id="staff-password" label="Passwort" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /><PublicFormField autoComplete="new-password" disabled={loading} id="staff-password-confirmation" label="Passwort bestätigen" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />{error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : null}<PublicPrimaryButton icon={<KeyRound size={18} />} loading={loading} loadingLabel="Zugang wird eingerichtet …" type="submit">Zugang einrichten</PublicPrimaryButton></form> : <><p className={`public-premium-alert${error ? " public-premium-alert-error" : ""}`} role={error ? "alert" : "status"}>{error ?? "Die Einladung wird geprüft …"}</p>{error ? <div className="public-premium-secondary-actions"><Link className="public-premium-secondary-link" to="/staff/login">Zum Mitarbeiter-Login</Link></div> : null}</>}
      </PublicContentCard>
    </PublicPageShell>
  );
}
