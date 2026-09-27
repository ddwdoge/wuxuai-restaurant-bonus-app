import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabase";
import { UiButton, UiCard, UiState } from "../../shared/ui";
import { useAuth } from "../auth/AuthProvider";
import {
  isPlatformSessionProofCurrent,
  normalizeTotpCode,
  platformAdminMfaMode,
  totpFactorLabel,
  verifiedTotpFactors,
  type PlatformMfaMode,
} from "./platformAdminMfa.mjs";

type Enrollment = {
  factorId: string;
  qrCode: string;
};

type VerifiedFactor = { id: string; status?: string; friendly_name?: string; created_at?: string; updated_at?: string };

export function PlatformAdminMfaGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [mode, setMode] = useState<PlatformMfaMode | "checking" | "error">("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [factors, setFactors] = useState<VerifiedFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedSessionToken, setVerifiedSessionToken] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const currentSessionToken = session?.access_token ?? null;

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    if (!supabase) {
      if (generation !== refreshGeneration.current) return;
      setVerifiedSessionToken(null);
      setError("Die sichere Anmeldung ist derzeit nicht verfügbar.");
      setMode("error");
      return;
    }
    setError(null);
    const [sessionResult, aalResult, factorsResult] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (generation !== refreshGeneration.current) return;
    const checkedSessionToken = sessionResult.data.session?.access_token ?? null;
    if (sessionResult.error || aalResult.error || factorsResult.error || !checkedSessionToken) {
      setVerifiedSessionToken(null);
      setError("Der zusätzliche Sicherheitsnachweis konnte nicht geprüft werden.");
      setMode("error");
      return;
    }
    const nextMode = platformAdminMfaMode({
      currentLevel: aalResult.data.currentLevel,
      currentAuthenticationMethods: aalResult.data.currentAuthenticationMethods,
      verifiedTotpFactors: factorsResult.data.totp,
    });
    setVerifiedSessionToken(checkedSessionToken);
    setMode(nextMode);
    const nextFactors = verifiedTotpFactors(factorsResult.data.totp);
    setFactors(nextFactors);
    setFactorId((current) => nextFactors.some((factor) => factor.id === current) ? current : (nextFactors[0]?.id ?? null));
    if (nextMode === "authorized") {
      setEnrollment(null);
      setCode("");
    }
  }, []);

  useEffect(() => {
    const request = refresh();
    const generation = refreshGeneration.current;
    void request.catch(() => {
      if (generation !== refreshGeneration.current) return;
      setVerifiedSessionToken(null);
      setError("Der zusätzliche Sicherheitsnachweis konnte nicht geprüft werden.");
      setMode("error");
    });
    return () => { refreshGeneration.current += 1; };
  }, [currentSessionToken, refresh]);

  async function beginEnrollment() {
    if (!supabase) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "WUXUAI Platform Admin – Gerät 1",
      });
      if (result.error) throw result.error;
      setEnrollment({ factorId: result.data.id, qrCode: result.data.totp.qr_code });
      setFactorId(result.data.id);
    } catch {
      setError("TOTP konnte nicht eingerichtet werden. Die bestehende Anmeldung wurde nicht verändert.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !factorId || code.length !== 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw result.error;
      setVerifiedSessionToken(null);
      setMode("checking");
      await refresh();
    } catch {
      setError("Der Bestätigungscode ist ungültig oder abgelaufen. Bitte versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  const sessionProofIsCurrent = isPlatformSessionProofCurrent(verifiedSessionToken, currentSessionToken);

  if (mode === "authorized" && sessionProofIsCurrent) return <>{children}</>;

  if (mode === "checking" || (mode !== "error" && !sessionProofIsCurrent)) {
    return <div className="auth-shell"><UiState description="Die aktuelle Sitzung wird sicher geprüft." kind="loading" title="Sicherheitsnachweis wird geprüft" /></div>;
  }

  return (
    <main className="auth-shell platform-mfa-shell">
      <UiCard className="platform-mfa-card">
        <p className="eyebrow">Platform Admin</p>
        <h1>Zwei-Faktor-Anmeldung erforderlich</h1>
        <p>Dieser interne Bereich ist erst nach einer aktuellen Bestätigung mit deiner Authenticator-App zugänglich.</p>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        {mode === "enroll" && !enrollment ? (
          <>
            <p>Richte TOTP einmalig ein. Andere angemeldete Platform-Admin-Sitzungen können dadurch beendet werden; diese Sitzung bleibt für die Bestätigung geöffnet.</p>
            <UiButton disabled={submitting} loading={submitting} onClick={() => void beginEnrollment()} type="button">
              Authenticator einrichten
            </UiButton>
          </>
        ) : null}

        {enrollment ? (
          <div className="platform-mfa-setup">
            <p>Scanne den QR-Code mit deiner Authenticator-App. Der darin enthaltene Schlüssel wird weder protokolliert noch gespeichert.</p>
            <img alt="QR-Code zur Einrichtung der Authenticator-App" className="platform-mfa-qr" src={enrollment.qrCode} />
          </div>
        ) : null}

        {(mode === "challenge" || enrollment) && factorId ? (
          <form className="platform-mfa-form" onSubmit={(event) => void verify(event)}>
            {mode === "challenge" && factors.length > 1 ? (
              <fieldset className="platform-mfa-factor-choice">
                <legend>Authenticator-Gerät auswählen</legend>
                {factors.map((factor, index) => (
                  <label key={factor.id}>
                    <input checked={factorId === factor.id} name="platform-admin-factor" onChange={() => { setFactorId(factor.id); setCode(""); }} type="radio" />
                    <span>{totpFactorLabel(factor, index)}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label htmlFor="platform-admin-totp">Sechsstelliger Bestätigungscode</label>
            <input
              autoComplete="one-time-code"
              id="platform-admin-totp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
              pattern="[0-9]{6}"
              required
              type="text"
              value={code}
            />
            <UiButton disabled={submitting || code.length !== 6} loading={submitting} type="submit">
              Sicher bestätigen
            </UiButton>
          </form>
        ) : null}
      </UiCard>
    </main>
  );
}
