import { FormEvent, useEffect, useState } from "react";
import { MailCheck, RotateCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { supabase } from "../../shared/lib/supabase";
import {
  clearEmailConfirmationUrl,
  establishEmailConfirmationSession,
} from "../auth/emailConfirmationService";
import { readEmailConfirmationPayload } from "../auth/emailConfirmationFlow.mjs";
import { AppShell, PremiumCard, PrimaryButton } from "./components/PremiumCustomerUi";
import { customerAuthReturnStorageKey, safeCustomerReturnPath } from "./CustomerAuthPage";
import "./central-customer.css";

const RESEND_COOLDOWN_SECONDS = 60;

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const [payload] = useState(() => readEmailConfirmationPayload(window.location));
  const [legacyReturnTo] = useState(() => new URL(window.location.href).searchParams.get("returnTo"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => (
    payload.kind === "invalid" ? "Dieser Bestätigungslink ist ungültig oder abgelaufen." : null
  ));
  const [email, setEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    clearEmailConfirmationUrl("/customer/auth/callback");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

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
      navigate(safeCustomerReturnPath(metadataReturn ?? legacyReturnTo ?? storedReturn), { replace: true });
    } catch {
      setError("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
    } finally {
      setLoading(false);
    }
  }

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
          <MailCheck aria-hidden="true" size={30} />
          <div>
            <span>E-Mail-Bestätigung</span>
            <h1>{error ? "Konto konnte nicht bestätigt werden" : "E-Mail-Adresse bestätigen"}</h1>
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
              <p>Bestätige deine E-Mail-Adresse jetzt sicher. Der Link wird erst mit diesem Klick verwendet.</p>
              <PrimaryButton disabled={loading} onClick={confirmEmail} type="button">
                <MailCheck aria-hidden="true" size={19} />
                {loading ? "E-Mail wird bestätigt …" : "E-Mail jetzt bestätigen"}
              </PrimaryButton>
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
