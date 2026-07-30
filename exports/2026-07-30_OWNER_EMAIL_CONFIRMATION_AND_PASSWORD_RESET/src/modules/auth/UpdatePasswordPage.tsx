import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { hasRecoveryIntent, validateOwnerPassword } from "./ownerAuthFlow.mjs";
import { clearSensitiveAuthUrl, establishOwnerAuthSession, updateOwnerPassword } from "./ownerAuthService";

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [recoveryIntent] = useState(() => hasRecoveryIntent(window.location));
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => (
    recoveryIntent ? null : "Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen."
  ));

  useEffect(() => {
    let cancelled = false;
    if (!recoveryIntent) {
      clearSensitiveAuthUrl();
      return () => { cancelled = true; };
    }
    async function prepareRecovery() {
      try {
        const session = await establishOwnerAuthSession();
        clearSensitiveAuthUrl();
        if (!session || !recoveryIntent) {
          throw new Error("Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.");
        }
        if (!cancelled) setReady(true);
      } catch {
        clearSensitiveAuthUrl();
        if (!cancelled) setError("Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.");
      }
    }
    void prepareRecovery();
    return () => { cancelled = true; };
  }, [recoveryIntent]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateOwnerPassword(password, confirmation);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await updateOwnerPassword(password);
      navigate("/restaurant/login", {
        replace: true,
        state: { logoutMessage: "Dein Passwort wurde geändert. Du kannst dich jetzt anmelden." },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das Passwort konnte nicht geändert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPageShell
      description="Lege ein neues Passwort für deinen Restaurantzugang fest."
      eyebrow="Sicherer Restaurantzugang"
      title="Neues Passwort festlegen"
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><KeyRound size={28} /></div>
        {ready ? (
          <form className="public-premium-form" onSubmit={handleSubmit}>
            <RequiredFieldsNote />
            <PublicFormField autoComplete="new-password" disabled={loading} hint="Mindestens 8 Zeichen, nicht leicht erratbar" id="new-password" label="Neues Passwort" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            <PublicFormField autoComplete="new-password" disabled={loading} id="confirm-new-password" label="Neues Passwort wiederholen" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
            {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : null}
            <PublicPrimaryButton icon={<KeyRound size={18} />} loading={loading} loadingLabel="Passwort wird gespeichert …" type="submit">Passwort speichern</PublicPrimaryButton>
          </form>
        ) : (
          <>
            <p className={`public-premium-alert${error ? " public-premium-alert-error" : ""}`} role={error ? "alert" : "status"}>
              {error ?? "Der sichere Link wird geprüft …"}
            </p>
            {error ? <div className="public-premium-secondary-actions"><Link className="public-premium-secondary-link" to="/auth/forgot-password">Neuen Reset-Link anfordern</Link><Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link></div> : null}
          </>
        )}
      </PublicContentCard>
    </PublicPageShell>
  );
}
