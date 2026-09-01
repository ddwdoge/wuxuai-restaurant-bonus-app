import { FormEvent, useEffect, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import {
  activateRestaurantOwnerForCurrentUser,
  completePendingOwnerRegistration,
  registerRestaurantOwner,
} from "./registerOwnerService";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import { isOwnerEmailConfirmed, validateOwnerPassword } from "./ownerAuthFlow.mjs";
import { V1_COMMERCIAL_COPY } from "../../shared/commercialContract.mjs";

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading: authLoading, portalAccess, portalAccessError, retryAuthorization, signIn, user } = useAuth();
  const [ownerName, setOwnerName] = useState("");
  const initialEmail = typeof (location.state as { email?: unknown } | null)?.email === "string"
    ? (location.state as { email: string }).email
    : "";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingIdentityFlow, setExistingIdentityFlow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordValidation = validateOwnerPassword(password);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;
  const confirmPasswordError = confirmPasswordTouched || submitAttempted
    ? confirmPassword.length === 0
      ? "Bitte bestätige dein Passwort."
      : passwordsMatch
        ? null
        : "Passwörter stimmen nicht überein."
    : null;
  const activatingExistingAccount = Boolean(
    user && isOwnerEmailConfirmed(user) && !portalAccessError && !portalAccess.owner_access,
  );
  const formValid = Boolean(
    ownerName.trim()
    && restaurantName.trim()
    && (
      activatingExistingAccount
      || (existingIdentityFlow ? Boolean(password) : (
        /^\S+@\S+\.\S+$/.test(email.trim())
        && passwordValidation.valid
        && passwordsMatch
      ))
    )
  );

  useEffect(() => {
    if (!authLoading && user && portalAccess.owner_access) {
      navigate("/admin", { replace: true });
    }
  }, [authLoading, navigate, portalAccess.owner_access, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (authLoading || (user && !activatingExistingAccount)) {
      navigate("/admin", { replace: true });
      return;
    }
    setError(null);
    setMessage(null);

    try {
      if (!activatingExistingAccount && !existingIdentityFlow && !passwordValidation.valid) {
        setError(passwordValidation.message);
        return;
      }
      if (!activatingExistingAccount && !existingIdentityFlow && !confirmPassword) {
        return;
      }
      if (!activatingExistingAccount && !existingIdentityFlow && !passwordsMatch) {
        return;
      }
      setLoading(true);
      if (activatingExistingAccount) {
        await activateRestaurantOwnerForCurrentUser({ ownerName, restaurantName, phone });
        retryAuthorization();
        window.location.assign("/admin/onboarding");
        return;
      }
      if (existingIdentityFlow) {
        try {
          await signIn(email, password);
        } catch (caught) {
          if (caught instanceof Error && caught.name === "EmailConfirmationRequiredError") {
            navigate("/auth/confirm-email", { state: { email } });
            return;
          }
          throw caught;
        }
        const completed = await completePendingOwnerRegistration(email);
        if (!completed) throw new Error("Die Restaurant-Registrierung konnte nicht fortgesetzt werden. Bitte beginne erneut.");
        retryAuthorization();
        window.location.assign("/admin/onboarding");
        return;
      }
      const result = await registerRestaurantOwner({
        ownerName,
        email,
        password,
        restaurantName,
        phone,
      });

      if (result.requiresAuthentication) {
        setExistingIdentityFlow(true);
        setPassword("");
        setConfirmPassword("");
        setConfirmPasswordTouched(false);
        setSubmitAttempted(false);
        setMessage("Bestehendes WUXUAI®-Bonus-Konto erkannt. Gib oben dein bestehendes Passwort ein und aktiviere anschließend den Restaurantbereich.");
        return;
      }

      if (result.requiresEmailConfirmation) {
        navigate("/auth/confirm-email", { replace: true, state: { email } });
        return;
      }

      window.location.assign("/admin/onboarding");
    } catch (caught) {
      const caughtMessage = caught instanceof Error ? caught.message : "Registrierung fehlgeschlagen.";
      setError(
        existingIdentityFlow && caughtMessage === "E-Mail-Adresse oder Passwort ist nicht korrekt."
          ? "Das bestehende Passwort ist nicht korrekt."
          : caughtMessage,
      );
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || (user && portalAccess.owner_access)) {
    return (
      <PublicPageShell description="Dein Restaurantbereich wird vorbereitet." eyebrow="WUXUAI Bonus" title="Restaurant Portal wird geöffnet …">
        <PublicContentCard><p className="public-premium-alert" role="status">Bitte einen Moment warten.</p></PublicContentCard>
      </PublicPageShell>
    );
  }

  if (user && portalAccessError) {
    return (
      <PublicPageShell description="Deine vorhandenen Bereiche konnten gerade nicht sicher geprüft werden." eyebrow="WUXUAI Bonus" title="Zugriff wird geprüft">
        <PublicContentCard>
          <p className="public-premium-alert public-premium-alert-error" role="alert">Bitte prüfe deinen Zugriff erneut. Es wurde nichts angelegt.</p>
          <PublicPrimaryButton onClick={retryAuthorization} type="button">Erneut prüfen</PublicPrimaryButton>
        </PublicContentCard>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell
      description={`Richte dein Bonusprogramm in wenigen Minuten ein. ${V1_COMMERCIAL_COPY.price} ${V1_COMMERCIAL_COPY.noPaymentMethod}`}
      eyebrow={V1_COMMERCIAL_COPY.trial}
      title="Restaurant starten"
    >
      <PublicContentCard>
        <form className="public-premium-form" onSubmit={handleSubmit}>
          <RequiredFieldsNote />
          <PublicFormField autoComplete="name" disabled={loading} id="owner-name" label="Dein Name" onChange={(event) => setOwnerName(event.target.value)} required value={ownerName} />
          {activatingExistingAccount ? (
            <PublicFormField disabled id="register-existing-email" label="Bestätigte E-Mail" type="email" value={user?.email ?? ""} />
          ) : (
            <>
              <PublicFormField autoComplete="email" disabled={loading || existingIdentityFlow} id="register-email" label="E-Mail" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              {existingIdentityFlow ? (
                <>
                  <p className="public-premium-alert public-premium-alert-success owner-existing-account-notice" role="status" aria-live="polite">
                    Konto erkannt – gib jetzt dein bestehendes Passwort ein, um den Restaurantbereich zu aktivieren.
                  </p>
                  <div className="owner-existing-password-stage">
                    <div className="owner-existing-password-stage-title">
                      <LockKeyhole aria-hidden="true" size={18} />
                      <span>Bestehendes Konto</span>
                    </div>
                    <PublicFormField
                      autoComplete="current-password"
                      autoFocus
                      disabled={loading}
                      error={error}
                      id="register-password"
                      label="Bestehendes Passwort"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                </>
              ) : (
                <PublicFormField autoComplete="new-password" disabled={loading} hint="Mindestens 8 Zeichen, nicht leicht erratbar" id="register-password" label="Passwort" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
              )}
              {!existingIdentityFlow ? (
                <PublicFormField
                  autoComplete="new-password"
                  disabled={loading}
                  error={confirmPasswordError}
                  id="register-password-confirmation"
                  label="Passwort bestätigen"
                  minLength={8}
                  onBlur={() => setConfirmPasswordTouched(true)}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              ) : null}
            </>
          )}
          <PublicFormField autoComplete="organization" disabled={loading} id="restaurant-name" label="Restaurantname" onChange={(event) => setRestaurantName(event.target.value)} required value={restaurantName} />
          <PublicFormField
            autoComplete="tel"
            disabled={loading}
            hint="Empfohlen für zukünftige SMS-Benachrichtigungen."
            id="phone"
            label="Mobiltelefonnummer (empfohlen)"
            onChange={(event) => setPhone(event.target.value)}
            optional
            type="tel"
            value={phone}
          />

          {message ? <p className="public-premium-alert public-premium-alert-success" role="status" aria-live="polite">{message}</p> : null}
          {error && !existingIdentityFlow ? <p className="public-premium-alert public-premium-alert-error" role="alert" aria-live="assertive">{error}</p> : null}

          <PublicPrimaryButton disabled={!formValid} icon={<Sparkles size={18} />} loading={loading} loadingLabel="Restaurant wird gestartet …" type="submit">
            {activatingExistingAccount || existingIdentityFlow ? "Restaurantbereich aktivieren" : V1_COMMERCIAL_COPY.registrationCta}
          </PublicPrimaryButton>
          <p className="public-premium-trust-note">{V1_COMMERCIAL_COPY.noPaymentMethod}</p>
          <div className="public-premium-secondary-actions">
            {activatingExistingAccount || existingIdentityFlow ? <span>Deine bestehende Anmeldung wird weiterverwendet.</span> : <><span>Bereits registriert?</span><Link className="public-premium-secondary-link" to="/login">Zum Login</Link></>}
          </div>
        </form>
      </PublicContentCard>
    </PublicPageShell>
  );
}
