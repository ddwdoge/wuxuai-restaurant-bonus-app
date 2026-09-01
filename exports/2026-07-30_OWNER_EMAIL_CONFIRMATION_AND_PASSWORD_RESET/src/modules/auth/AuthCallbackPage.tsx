import { useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PublicContentCard, PublicPageShell } from "../public/PublicPageComponents";
import { completeConfirmedOwnerRegistration } from "./registerOwnerService";
import { hasAuthCallbackPayload, isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";
import { clearSensitiveAuthUrl, establishOwnerAuthSession } from "./ownerAuthService";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [callbackPayloadPresent] = useState(() => hasAuthCallbackPayload(window.location));
  const [error, setError] = useState<string | null>(() => (
    callbackPayloadPresent ? null : "Dieser Bestätigungslink ist ungültig oder abgelaufen."
  ));

  useEffect(() => {
    if (started.current || !callbackPayloadPresent) return;
    started.current = true;
    let cancelled = false;

    async function completeCallback() {
      try {
        const session = await establishOwnerAuthSession();
        clearSensitiveAuthUrl();
        if (!session?.user || !isOwnerEmailConfirmed(session.user)) {
          throw new Error("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
        }

        const registrationCompleted = await completeConfirmedOwnerRegistration(session.user);
        if (!cancelled) {
          navigate(registrationCompleted ? "/admin/onboarding" : "/admin", { replace: true });
        }
      } catch (caught) {
        clearSensitiveAuthUrl();
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Dieser Bestätigungslink ist ungültig oder abgelaufen.");
        }
      }
    }

    void completeCallback();
    return () => { cancelled = true; };
  }, [callbackPayloadPresent, navigate]);

  return (
    <PublicPageShell
      description={error ? "Bitte fordere einen neuen Link an oder kehre zum Login zurück." : "Dein sicherer Restaurantzugang wird gerade vorbereitet."}
      eyebrow="E-Mail-Bestätigung"
      title={error ? "Bestätigung nicht möglich" : "E-Mail wird bestätigt …"}
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><MailCheck size={28} /></div>
        {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : <p className="public-premium-alert" role="status">Bitte einen Moment warten.</p>}
        <div className="public-premium-secondary-actions">
          {error ? <Link className="public-premium-secondary-link" to="/auth/confirm-email">Neuen Link anfordern</Link> : null}
          <Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link>
        </div>
      </PublicContentCard>
    </PublicPageShell>
  );
}
