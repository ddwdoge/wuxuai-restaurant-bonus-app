import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LogIn, RotateCw, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { CustomerPhoneField } from "../../shared/components/CustomerPhoneField";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { customerPhoneValidation, normalizeCustomerLocalPhoneInput } from "./customerIdentity.mjs";
import { isValidCustomerFirstName } from "./customerRegistration.mjs";
import {
  customerAuthErrorMessage,
  customerPasswordConfirmationError,
  isCustomerPasswordConfirmationValid,
} from "./customerAuthFlow.mjs";
import { registerCustomerAuthAccount, resendCustomerConfirmation } from "./customerAuthService";
import { safeCustomerReturnPath } from "./customerReturnPath.mjs";
import { AppShell, PremiumCard, PrimaryButton, SecondaryButton } from "./components/PremiumCustomerUi";
import "./central-customer.css";

type CustomerAuthMode = "login" | "register";

const RETURN_STORAGE_KEY = "wuxuai:customer-auth-return";
const RESEND_COOLDOWN_SECONDS = 60;

export function CustomerAuthPage({ mode }: { mode: CustomerAuthMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeCustomerReturnPath(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+43");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [messageKind, setMessageKind] = useState<"error" | "success">("success");
  const [message, setMessage] = useState<string | null>(null);
  const passwordConfirmationValid = mode === "login"
    ? true
    : isCustomerPasswordConfirmationValid(password, confirmPassword);
  const confirmPasswordError = mode === "register"
    ? customerPasswordConfirmationError(password, confirmPassword, confirmPasswordTouched || submitAttempted)
    : null;
  const registrationValid = isValidCustomerFirstName(firstName)
    && Boolean(customerPhoneValidation(phoneCountryCode, phone).e164)
    && /^\S+@\S+\.\S+$/.test(email.trim())
    && password.length >= 8
    && passwordConfirmationValid;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || submitting) return;
    setSubmitAttempted(true);
    setSubmitting(true);
    setMessage(null);
    setConfirmationPending(false);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: "local" });
          setMessageKind("error");
          setMessage("Bitte bestätige zuerst deine E-Mail-Adresse.");
          return;
        }
        navigate(returnTo, { replace: true });
        return;
      }

      const phoneResult = customerPhoneValidation(phoneCountryCode, phone);
      if (!registrationValid || !phoneResult.e164) {
        setMessageKind("error");
        setMessage("Bitte fülle alle Pflichtfelder korrekt aus.");
        return;
      }
      window.sessionStorage.setItem(RETURN_STORAGE_KEY, returnTo);
      const signupState = await registerCustomerAuthAccount({
        birthday: birthday || null,
        email,
        firstName,
        origin: window.location.origin,
        password,
        phone: phoneResult.e164,
        returnTo,
      });
      if (signupState === "confirmed") {
        await supabase.rpc("ensure_authenticated_customer_account");
        navigate(returnTo, { replace: true });
      } else if (signupState === "confirmation_required") {
        setMessageKind("success");
        setConfirmationPending(true);
        setMessage("Bitte öffne jetzt den Bestätigungslink in deiner E-Mail. Dein ausgewähltes Restaurant bleibt erhalten.");
      } else if (signupState === "existing_or_obfuscated") {
        setMessageKind("error");
        setConfirmationPending(true);
        setMessage("Registrierung konnte nicht abgeschlossen werden. Prüfe, ob du bereits ein Kundenkonto hast, oder fordere eine neue Bestätigungs-E-Mail an.");
      } else {
        throw new Error("customer_signup_incomplete");
      }
    } catch (caught) {
      setMessageKind("error");
      setMessage(customerAuthErrorMessage(caught, mode === "login" ? "login" : "signup"));
    } finally {
      setSubmitting(false);
    }
  }

  async function resendConfirmation() {
    if (resending || resendCooldown > 0 || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setResending(true);
    setMessage(null);
    try {
      await resendCustomerConfirmation(email, window.location.origin);
      setMessageKind("success");
      setMessage("Falls ein unbestätigtes Konto besteht, wurde eine neue E-Mail gesendet. Verwende immer den neuesten Link.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      setMessageKind("error");
      setMessage(customerAuthErrorMessage(caught, "resend"));
    } finally {
      setResending(false);
    }
  }

  return (
    <AppShell className="central-auth-shell">
      <div className="central-auth-page">
        <PremiumCard className="central-auth-card">
          <div className="central-icon-heading">
            {mode === "login" ? <LogIn aria-hidden="true" size={23} /> : <UserPlus aria-hidden="true" size={23} />}
            <div><span>WUXUAI Bonus</span><h1>{mode === "login" ? "Kundenkonto öffnen" : "Kundenkonto erstellen"}</h1></div>
          </div>
          <p>{mode === "login" ? "Melde dich an, um deine Lokale und restaurantbezogenen Punkte zu sehen." : "Ein Konto für alle deine WUXUAI-Lokale. Punkte bleiben weiterhin je Restaurant getrennt."}</p>
          <form className="central-auth-form" onSubmit={submit}>
            <RequiredFieldsNote />
            {mode === "register" ? <>
              <div className="central-auth-field"><FormLabel htmlFor="customer-first-name" required>Vorname</FormLabel><input autoComplete="given-name" id="customer-first-name" onChange={(event) => setFirstName(event.target.value)} required value={firstName} /></div>
              <CustomerPhoneField countryCode={phoneCountryCode} idPrefix="central-customer-phone" localNumber={phone} onCountryCodeChange={setPhoneCountryCode} onLocalNumberChange={(value) => setPhone(normalizeCustomerLocalPhoneInput(value))} required showError={Boolean(phone)} />
              <div className="central-auth-field"><FormLabel htmlFor="customer-birthday" optional>Geburtstag</FormLabel><input autoComplete="bday" id="customer-birthday" onChange={(event) => setBirthday(event.target.value)} type="date" value={birthday} /></div>
            </> : null}
            <div className="central-auth-field"><FormLabel htmlFor="customer-email" required>E-Mail-Adresse</FormLabel><input autoComplete="email" id="customer-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div>
            <div className="central-auth-field"><FormLabel htmlFor="customer-password" required>Passwort</FormLabel><input autoComplete={mode === "login" ? "current-password" : "new-password"} id="customer-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /><small>Mindestens 8 Zeichen</small></div>
            {mode === "register" ? (
              <div className="central-auth-field">
                <FormLabel htmlFor="customer-confirm-password" required>Passwort bestätigen</FormLabel>
                <input
                  aria-describedby={confirmPasswordError ? "customer-confirm-password-error" : undefined}
                  aria-invalid={confirmPasswordError ? true : undefined}
                  autoComplete="new-password"
                  id="customer-confirm-password"
                  minLength={8}
                  onBlur={() => setConfirmPasswordTouched(true)}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
                {confirmPasswordError ? <small className="central-auth-field-error" id="customer-confirm-password-error">{confirmPasswordError}</small> : null}
              </div>
            ) : null}
            {message ? <p className={`central-status-message ${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p> : null}
            {mode === "register" && confirmationPending ? (
              <SecondaryButton disabled={resending || resendCooldown > 0} onClick={resendConfirmation} type="button">
                <RotateCw aria-hidden="true" size={18} />
                {resendCooldown > 0 ? `Erneut senden in ${resendCooldown} Sekunden` : resending ? "E-Mail wird angefordert …" : "Bestätigungs-E-Mail erneut senden"}
              </SecondaryButton>
            ) : null}
            <PrimaryButton disabled={submitting || (mode === "register" && !registrationValid)} type="submit"><CheckCircle2 aria-hidden="true" size={19} /> {submitting ? "Bitte warten …" : mode === "login" ? "Anmelden" : "Konto erstellen"}</PrimaryButton>
          </form>
          <p className="central-auth-switch">{mode === "login" ? "Noch kein Kundenkonto?" : "Du hast bereits ein Kundenkonto?"} <Link to={`/customer/${mode === "login" ? "register" : "login"}?returnTo=${encodeURIComponent(returnTo)}`}>{mode === "login" ? "Jetzt erstellen" : "Jetzt anmelden"}</Link></p>
        </PremiumCard>
      </div>
    </AppShell>
  );
}

export const customerAuthReturnStorageKey = RETURN_STORAGE_KEY;
