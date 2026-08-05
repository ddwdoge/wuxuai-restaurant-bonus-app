import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PublicContentCard, PublicPageShell, PublicPrimaryButton } from "../public/PublicPageComponents";
import { readEmailConfirmationPayload } from "./emailConfirmationFlow.mjs";
import { completeConfirmedOwnerRegistration } from "./registerOwnerService";
import { isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";
import { clearSensitiveAuthUrl, establishOwnerAuthSession } from "./ownerAuthService";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [payload] = useState(() => readEmailConfirmationPayload(window.location));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => (
    payload.kind === "invalid" ? "Dieser Bestätigungslink ist ungültig oder abgelaufen." : null
  ));

  useEffect(() => {
    clearSensitiveAuthUrl();
  }, []);

  async function completeCallback() {
    if (loading || payload.kind === "invalid") return;
    setLoading(true);
    setError(null);
    try {
      const session = await establishOwnerAuthSession(payload);
      if (!session.user || !isOwnerEmailConfirmed(session.user)) {
        throw new Error("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
      }

      const registrationCompleted = await completeConfirmedOwnerRegistration(session.user);
      navigate(registrationCompleted ? "/admin/onboarding" : "/admin", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dieser Bestätigungslink ist ungültig oder abgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPageShell
      description={error ? "Bitte fordere einen neuen Link an oder kehre zum Login zurück." : "Der Link wird erst verwendet, wenn du die Bestätigung bewusst startest."}
      eyebrow="E-Mail-Bestätigung"
      title={error ? "Bestätigung nicht möglich" : "E-Mail-Adresse bestätigen"}
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><MailCheck size={28} /></div>
        {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : <p className="public-premium-alert" role="status">Bestätige jetzt deinen sicheren Restaurantzugang.</p>}
        {!error ? (
          <PublicPrimaryButton disabled={loading} loading={loading} loadingLabel="E-Mail wird bestätigt …" onClick={completeCallback} type="button">
            E-Mail jetzt bestätigen
          </PublicPrimaryButton>
        ) : null}
        <div className="public-premium-secondary-actions">
          {error ? <Link className="public-premium-secondary-link" to="/auth/confirm-email">Neuen Link anfordern</Link> : null}
          <Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link>
        </div>
      </PublicContentCard>
    </PublicPageShell>
  );
}
