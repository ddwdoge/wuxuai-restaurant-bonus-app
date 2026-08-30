import { FormEvent, useEffect, useState } from "react";
import { MailCheck, RotateCw } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { clearPendingOwnerRegistration, readPendingOwnerEmail } from "./registerOwnerService";
import { resendOwnerConfirmation } from "./ownerAuthService";
import { useAuth } from "./AuthProvider";

const RESEND_COOLDOWN_SECONDS = 60;

export function ConfirmEmailPage() {
  const { loading: authLoading, portalAccess, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const stateEmail = typeof (location.state as { email?: unknown } | null)?.email === "string"
    ? (location.state as { email: string }).email
    : "";
  const [email, setEmail] = useState(() => stateEmail || readPendingOwnerEmail());
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleResend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await resendOwnerConfirmation(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage("Falls für diese Adresse ein noch nicht bestätigtes Konto existiert, wurde eine neue E-Mail versendet.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die E-Mail konnte gerade nicht versendet werden.");
    } finally {
      setLoading(false);
    }
  }

  function correctEmail() {
    clearPendingOwnerRegistration();
    navigate("/register", { replace: true, state: { email } });
  }

  if (!authLoading && user?.email_confirmed_at) {
    return (
      <PublicPageShell
        description="Deine E-Mail-Adresse ist bestätigt. Eine weitere Bestätigungs-E-Mail ist nicht erforderlich."
        eyebrow="Sicherer Restaurantzugang"
        title="E-Mail-Adresse bereits bestätigt"
      >
        <PublicContentCard>
          <p className="public-premium-alert public-premium-alert-success" role="status">E-Mail-Adresse bereits bestätigt. Bitte fahre mit deinem bestehenden Konto fort.</p>
          <Link className="public-premium-secondary-link" to={portalAccess.owner_access ? "/admin" : "/register"}>{portalAccess.owner_access ? "Restaurant-Portal öffnen" : "Restaurantbereich aktivieren"}</Link>
        </PublicContentCard>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell
      description="Wir haben dir einen Bestätigungslink gesendet. Öffne die E-Mail und klicke auf den Link, um dein Konto zu aktivieren."
      eyebrow="Sicherer Restaurantzugang"
      title="Bestätige deine E-Mail-Adresse"
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><MailCheck size={28} /></div>
        <form className="public-premium-form" onSubmit={handleResend}>
          <RequiredFieldsNote />
          <PublicFormField
            autoComplete="email"
            disabled={loading}
            id="confirmation-email"
            label="E-Mail-Adresse"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          {message ? <p className="public-premium-alert public-premium-alert-success" role="status">{message}</p> : null}
          {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : null}
          <PublicPrimaryButton
            disabled={!email.trim() || cooldown > 0}
            icon={<RotateCw size={18} />}
            loading={loading}
            loadingLabel="E-Mail wird angefordert …"
            type="submit"
          >
            {cooldown > 0 ? `Erneut senden in ${cooldown} Sekunden` : "Bestätigungs-E-Mail erneut senden"}
          </PublicPrimaryButton>
          <div className="public-premium-secondary-actions">
            <button className="public-premium-text-button" onClick={correctEmail} type="button">E-Mail-Adresse korrigieren</button>
            <Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link>
          </div>
        </form>
      </PublicContentCard>
    </PublicPageShell>
  );
}
