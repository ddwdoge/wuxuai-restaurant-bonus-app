import { FormEvent, useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { validateOwnerPassword } from "./ownerAuthFlow.mjs";
import {
  acquireOwnerRecoveryLifecycle,
  clearSensitiveAuthUrl,
  establishOwnerRecoverySession,
  updateOwnerPassword,
} from "./ownerAuthService";

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const isMountedRef = useRef(false);
  const passwordUpdateCompletedRef = useRef(false);
  const recoverySessionEstablishedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;
    const releaseRecoveryLifecycle = acquireOwnerRecoveryLifecycle();

    async function prepareRecovery() {
      try {
        const result = await establishOwnerRecoverySession();
        recoverySessionEstablishedRef.current = true;
        clearSensitiveAuthUrl();
        if (!result.user) {
          throw new Error("Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.");
        }
        if (!cancelled && isMountedRef.current) setReady(true);
      } catch {
        if (!cancelled && isMountedRef.current) {
          setError("Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.");
        }
      }
    }
    void prepareRecovery();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
      releaseRecoveryLifecycle();
    };
  }, []);

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
      passwordUpdateCompletedRef.current = true;
      if (!isMountedRef.current) return;
      navigate("/restaurant/login", {
        replace: true,
        state: { logoutMessage: "Dein Passwort wurde geändert. Du kannst dich jetzt anmelden." },
      });
    } catch (caught) {
      if (isMountedRef.current) {
        setError(caught instanceof Error ? caught.message : "Das Passwort konnte nicht geändert werden.");
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
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
