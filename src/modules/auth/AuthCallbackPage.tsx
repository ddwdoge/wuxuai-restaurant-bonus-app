import { useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PublicContentCard, PublicPageShell } from "../public/PublicPageComponents";
import { readEmailConfirmationPayload } from "./emailConfirmationFlow.mjs";
import { completeConfirmedOwnerRegistration } from "./registerOwnerService";
import { isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";
import { clearSensitiveAuthUrl, establishOwnerAuthSession } from "./ownerAuthService";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [payload] = useState(() => readEmailConfirmationPayload(window.location));
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(() => (
    payload.kind === "invalid" ? "Dieser Bestätigungslink ist ungültig oder abgelaufen." : null
  ));

  useEffect(() => {
    clearSensitiveAuthUrl();
    if (payload.kind === "invalid") return;
    let cancelled = false;
    let navigationTimer: number | undefined;

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
        if (cancelled) return;
        setConfirmed(true);
        navigationTimer = window.setTimeout(() => {
          navigate(registrationCompleted ? "/admin/onboarding" : "/admin", { replace: true });
        }, 800);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Dieser Bestätigungslink ist ungültig oder abgelaufen.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void completeCallback();
    return () => {
      cancelled = true;
      if (navigationTimer) window.clearTimeout(navigationTimer);
    };
  // The captured payload is immutable for this callback page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, payload]);

  return (
    <PublicPageShell
      description={error ? "Bitte fordere einen neuen Link an oder kehre zum Login zurück." : "Deine E-Mail-Adresse wird sicher bestätigt."}
      eyebrow="E-Mail-Bestätigung"
      title={error ? "Bestätigung nicht möglich" : confirmed ? "E-Mail-Adresse bestätigt" : "E-Mail-Adresse wird bestätigt"}
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true">{confirmed ? <CheckCircle2 size={28} /> : <MailCheck size={28} />}</div>
        {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : <p className="public-premium-alert public-premium-alert-success" role="status">{confirmed ? "E-Mail-Adresse erfolgreich bestätigt." : "E-Mail wird bestätigt …"}</p>}
        <div className="public-premium-secondary-actions">
          {error ? <Link className="public-premium-secondary-link" to="/auth/confirm-email">Neuen Link anfordern</Link> : null}
          <Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link>
        </div>
      </PublicContentCard>
    </PublicPageShell>
  );
}
