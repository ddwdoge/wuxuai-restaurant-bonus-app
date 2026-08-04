import { useState } from "react";
import { CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { CustomerPhoneField } from "../../shared/components/CustomerPhoneField";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { customerPhoneValidation, normalizeCustomerLocalPhoneInput } from "./customerIdentity.mjs";
import { isValidCustomerFirstName } from "./customerRegistration.mjs";
import { AppShell, PremiumCard, PrimaryButton } from "./components/PremiumCustomerUi";
import "./central-customer.css";

type CustomerAuthMode = "login" | "register";

const RETURN_STORAGE_KEY = "wuxuai:customer-auth-return";

export function safeCustomerReturnPath(value: string | null) {
  if (!value || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return "/customer";
  const isCustomerPath = value === "/customer" || value.startsWith("/customer/") || value.startsWith("/customer?");
  const isCollectPath = /^\/w\/[^/?#]+(?:[?#].*)?$/.test(value);
  return isCustomerPath || isCollectPath ? value : "/customer";
}

export function CustomerAuthPage({ mode }: { mode: CustomerAuthMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeCustomerReturnPath(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+43");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const registrationValid = isValidCustomerFirstName(firstName)
    && Boolean(customerPhoneValidation(phoneCountryCode, phone).e164)
    && /^\S+@\S+\.\S+$/.test(email.trim())
    && password.length >= 8;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
        }
        navigate(returnTo, { replace: true });
        return;
      }

      const phoneResult = customerPhoneValidation(phoneCountryCode, phone);
      if (!registrationValid || !phoneResult.e164) throw new Error("Bitte fülle alle Pflichtfelder korrekt aus.");
      window.sessionStorage.setItem(RETURN_STORAGE_KEY, returnTo);
      const callbackUrl = new URL("/customer/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("returnTo", returnTo);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: {
            customer_first_name: firstName.trim(),
            customer_phone: phoneResult.e164,
            customer_birthday: birthday || null,
          },
        },
      });
      if (error) throw error;
      if (data.session?.user?.email_confirmed_at) {
        await supabase.rpc("ensure_authenticated_customer_account");
        navigate(returnTo, { replace: true });
      } else {
        setMessage("Bitte öffne jetzt den Bestätigungslink in deiner E-Mail. Dein ausgewähltes Restaurant bleibt erhalten.");
      }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message.toLowerCase() : "";
      setMessage(detail.includes("invalid login")
        ? "E-Mail-Adresse oder Passwort sind nicht korrekt."
        : detail.includes("already registered")
          ? "Für diese E-Mail-Adresse besteht bereits ein Kundenkonto. Bitte melde dich an."
          : caught instanceof Error ? caught.message : "Der Vorgang konnte gerade nicht abgeschlossen werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell className="central-auth-shell">
      <div className="central-auth-page">
        <PremiumCard className="central-auth-card">
          <div className="central-icon-heading">
            {mode === "login" ? <LogIn aria-hidden="true" size={23} /> : <UserPlus aria-hidden="true" size={23} />}
            <div><span>Mein WUXUAI</span><h1>{mode === "login" ? "Kundenkonto öffnen" : "Kundenkonto erstellen"}</h1></div>
          </div>
          <p>{mode === "login" ? "Melde dich an, um deine Lokale und restaurantbezogenen Punkte zu sehen." : "Ein Konto für alle deine WUXUAI-Lokale. Punkte bleiben weiterhin je Restaurant getrennt."}</p>
          <form className="central-auth-form" onSubmit={submit}>
            <RequiredFieldsNote />
            {mode === "register" ? <>
              <label><FormLabel htmlFor="customer-first-name" required>Vorname</FormLabel><input autoComplete="given-name" id="customer-first-name" onChange={(event) => setFirstName(event.target.value)} required value={firstName} /></label>
              <CustomerPhoneField countryCode={phoneCountryCode} idPrefix="central-customer-phone" localNumber={phone} onCountryCodeChange={setPhoneCountryCode} onLocalNumberChange={(value) => setPhone(normalizeCustomerLocalPhoneInput(value))} required showError={Boolean(phone)} />
              <label><FormLabel htmlFor="customer-birthday" optional>Geburtstag</FormLabel><input autoComplete="bday" id="customer-birthday" onChange={(event) => setBirthday(event.target.value)} type="date" value={birthday} /></label>
            </> : null}
            <label><FormLabel htmlFor="customer-email" required>E-Mail-Adresse</FormLabel><input autoComplete="email" id="customer-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
            <label><FormLabel htmlFor="customer-password" required>Passwort</FormLabel><input autoComplete={mode === "login" ? "current-password" : "new-password"} id="customer-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /><small>Mindestens 8 Zeichen</small></label>
            {message ? <p className="central-status-message" role="status">{message}</p> : null}
            <PrimaryButton disabled={submitting || (mode === "register" && !registrationValid)} type="submit"><CheckCircle2 aria-hidden="true" size={19} /> {submitting ? "Bitte warten …" : mode === "login" ? "Anmelden" : "Konto erstellen"}</PrimaryButton>
          </form>
          <p className="central-auth-switch">{mode === "login" ? "Noch kein Kundenkonto?" : "Du hast bereits ein Kundenkonto?"} <Link to={`/customer/${mode === "login" ? "register" : "login"}?returnTo=${encodeURIComponent(returnTo)}`}>{mode === "login" ? "Jetzt erstellen" : "Jetzt anmelden"}</Link></p>
        </PremiumCard>
      </div>
    </AppShell>
  );
}

export const customerAuthReturnStorageKey = RETURN_STORAGE_KEY;
