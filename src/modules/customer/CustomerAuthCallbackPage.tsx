import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, MailCheck, RotateCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { supabase } from "../../shared/lib/supabase";
import {
  clearEmailConfirmationUrl,
  establishEmailConfirmationSession,
} from "../auth/emailConfirmationService";
import { readEmailConfirmationPayload } from "../auth/emailConfirmationFlow.mjs";
import { AppShell, PremiumCard, PrimaryButton } from "./components/PremiumCustomerUi";
import { customerAuthReturnStorageKey } from "./CustomerAuthPage";
import { safeCustomerReturnPath } from "./customerReturnPath.mjs";
import "./central-customer.css";

const RESEND_COOLDOWN_SECONDS = 60;

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const [payload] = useState(() => readEmailConfirmationPayload(window.location));
  const [legacyReturnTo] = useState(() => new URL(window.location.href).searchParams.get("returnTo"));
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(() => (
    payload.kind === "invalid" ? "Dieser Bestätigungslink ist ungültig oder abgelaufen." : null
  ));
  const [email, setEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    clearEmailConfirmationUrl("/customer/auth/callback");
    if (payload.kind === "invalid" || !supabase) return;
    let cancelled = false;
    let navigationTimer: number | undefined;

    async function confirmEmail() {
      if (loading || payload.kind === "invalid" || !supabase) return;
      setLoading(true);
      setError(null);
      try {
        const session = await establishEmailConfirmationSession(payload);
        if (!session.user.email_confirmed_at) throw new Error("confirmation_missing");
        const { error: profileError } = await supabase.rpc("ensure_authenticated_customer_account");
        if (profileError) throw profileError;

        const metadataReturn = typeof session.user.user_metadata?.customer_return_to === "string"
          ? session.user.user_metadata.customer_return_to
          : null;
        const storedReturn = window.sessionStorage.getItem(customerAuthReturnStorageKey);
        window.sessionStorage.removeItem(customerAuthReturnStorageKey);
        if (cancelled) return;
        setConfirmed(true);
        navigationTimer = window.setTimeout(() => {
          navigate(safeCustomerReturnPath(metadataReturn ?? legacyReturnTo ?? storedReturn), { replace: true });
        }, 800);
      } catch {
        if (!cancelled) setError("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void confirmEmail();
    return () => {
      cancelled = true;
      if (navigationTimer) window.clearTimeout(navigationTimer);
    };
  // The captured payload and legacy return path are immutable for this callback page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyReturnTo, navigate, payload]);

  async function resendConfirmation(event: FormEvent) {
    event.preventDefault();
    if (!supabase || cooldown > 0 || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setLoading(true);
    setResendMessage(null);
    try {
      const callbackUrl = new URL("/customer/auth/callback", window.location.origin);
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: callbackUrl.toString() },
      });
      if (resendError) throw resendError;
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResendMessage("Falls ein unbestätigtes Konto besteht, wurde eine neue E-Mail gesendet. Verwende immer den neuesten Link.");
    } catch {
      setResendMessage("Die E-Mail konnte gerade nicht angefordert werden. Bitte warte kurz und versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell className="central-auth-shell">
      <div className="central-auth-page">
        <PremiumCard className="central-auth-card central-auth-status">
          {confirmed ? <CheckCircle2 aria-hidden="true" size={30} /> : <MailCheck aria-hidden="true" size={30} />}
          <div>
            <span>E-Mail-Bestätigung</span>
            <h1>{error ? "Konto konnte nicht bestätigt werden" : confirmed ? "E-Mail-Adresse bestätigt" : "E-Mail-Adresse wird bestätigt"}</h1>
          </div>
          {error ? (
            <>
              <p className="central-status-message" role="alert">{error}</p>
              <p>Fordere eine neue E-Mail an und verwende immer den neuesten Link.</p>
              <form className="central-auth-form central-confirmation-resend" onSubmit={resendConfirmation}>
                <RequiredFieldsNote />
                <label>
                  <FormLabel htmlFor="customer-confirmation-email" required>E-Mail-Adresse</FormLabel>
                  <input
                    autoComplete="email"
                    id="customer-confirmation-email"
                    inputMode="email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
                {resendMessage ? <p className="central-status-message" role="status">{resendMessage}</p> : null}
                <PrimaryButton disabled={loading || cooldown > 0 || !/^\S+@\S+\.\S+$/.test(email.trim())} type="submit">
                  <RotateCw aria-hidden="true" size={18} />
                  {cooldown > 0 ? `Erneut senden in ${cooldown} Sekunden` : "Neue Bestätigungs-E-Mail senden"}
                </PrimaryButton>
              </form>
            </>
          ) : (
            <>
              <p className="central-status-message success" role="status">{confirmed ? "E-Mail-Adresse erfolgreich bestätigt." : "E-Mail wird bestätigt …"}</p>
            </>
          )}
          <Link
            className="premium-button premium-button-secondary"
            to={`/customer/login?returnTo=${encodeURIComponent(safeCustomerReturnPath(legacyReturnTo))}`}
          >
            Zur Kundenanmeldung
          </Link>
        </PremiumCard>
      </div>
    </AppShell>
  );
}
