import { FormEvent, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { supabase } from "../../shared/lib/supabase";
import { UiButton } from "../../shared/ui";
import {
  canRemoveTotpFactor,
  nextTotpDeviceName,
  normalizeTotpCode,
  totpFactorLabel,
  verifiedTotpFactors,
} from "./platformAdminMfa.mjs";

type Factor = { id: string; status?: string; friendly_name?: string; created_at?: string; updated_at?: string };
type Enrollment = { factorId: string; qrCode: string };

export function PlatformAdminMfaSecurityControl() {
  const [open, setOpen] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [proofFactor, setProofFactor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshFactors() {
    if (!supabase) throw new Error("Supabase unavailable");
    const result = await supabase.auth.mfa.listFactors();
    if (result.error) throw result.error;
    setFactors(verifiedTotpFactors(result.data.totp));
  }

  useEffect(() => {
    if (!open) return;
    void refreshFactors().catch(() => setError("Die registrierten Geräte konnten nicht sicher geladen werden."));
  }, [open]);

  const proofChoices = useMemo(() => factors.filter((factor) => factor.id !== removeTarget), [factors, removeTarget]);

  async function beginEnrollment() {
    if (!supabase || factors.length >= 2) return;
    setBusy(true); setError(null);
    try {
      const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: nextTotpDeviceName(factors) });
      if (result.error) throw result.error;
      setEnrollment({ factorId: result.data.id, qrCode: result.data.totp.qr_code });
      setCode("");
    } catch { setError("Das zweite Authenticator-Gerät konnte nicht eingerichtet werden."); }
    finally { setBusy(false); }
  }

  async function verifyEnrollment(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !enrollment || code.length !== 6) return;
    setBusy(true); setError(null);
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
      if (result.error) throw result.error;
      setEnrollment(null); setCode("");
      await refreshFactors();
    } catch { setError("Der Bestätigungscode ist ungültig oder abgelaufen."); }
    finally { setBusy(false); }
  }

  function requestRemoval(targetId: string) {
    const remaining = factors.find((factor) => factor.id !== targetId)?.id ?? null;
    setRemoveTarget(targetId); setProofFactor(remaining); setCode(""); setError(null);
  }

  async function confirmRemoval(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !removeTarget || !proofFactor || code.length !== 6 || !canRemoveTotpFactor(factors, removeTarget, proofFactor)) return;
    setBusy(true); setError(null);
    try {
      const proof = await supabase.auth.mfa.challengeAndVerify({ factorId: proofFactor, code });
      if (proof.error) throw proof.error;
      const removed = await supabase.auth.mfa.unenroll({ factorId: removeTarget });
      if (removed.error) throw removed.error;
      setRemoveTarget(null); setProofFactor(null); setCode("");
      await refreshFactors();
    } catch { setError("Das verlorene Gerät wurde nicht entfernt. Bestätige den Vorgang mit dem verbleibenden Gerät."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="button secondary platform-mfa-security-trigger" onClick={() => setOpen(true)} type="button">
      <ShieldCheck aria-hidden="true" size={19} /><span>Anmeldeschutz</span>
    </button>
    <AppDrawer closeLabel="Schließen" description="Zwei getrennte Authenticator-Geräte schützen den Platform-Admin-Zugang." onClose={() => setOpen(false)} open={open} size="compact" title="Authenticator-Geräte">
      <div className="platform-mfa-security">
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <p>Registriert: {factors.length} von 2 Geräten</p>
        <ul className="platform-mfa-device-list">
          {factors.map((factor, index) => <li key={factor.id}>
            <div><strong>{totpFactorLabel(factor, index)}</strong><span>Verifiziert</span></div>
            <UiButton disabled={busy || factors.length < 2} onClick={() => requestRemoval(factor.id)} type="button">Verlorenes Gerät entfernen</UiButton>
          </li>)}
        </ul>
        {factors.length < 2 && !enrollment ? <>
          <p role="status">Richte jetzt ein zweites, getrenntes Gerät ein. Bei gleichzeitigem Verlust beider Geräte bleibt der Zugang gesperrt.</p>
          <UiButton disabled={busy} loading={busy} onClick={() => void beginEnrollment()} type="button">Zweites Gerät einrichten</UiButton>
        </> : null}
        {enrollment ? <form className="platform-mfa-form" onSubmit={(event) => void verifyEnrollment(event)}>
          <p>Scanne diesen QR-Code ausschließlich mit dem zweiten Gerät. Er wird nicht gespeichert oder protokolliert.</p>
          <img alt="QR-Code für das zweite Authenticator-Gerät" className="platform-mfa-qr" src={enrollment.qrCode} />
          <label htmlFor="platform-admin-second-device-code">Bestätigungscode des zweiten Geräts</label>
          <input autoComplete="one-time-code" id="platform-admin-second-device-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(normalizeTotpCode(event.target.value))} pattern="[0-9]{6}" required type="text" value={code} />
          <UiButton disabled={busy || code.length !== 6} loading={busy} type="submit">Zweites Gerät bestätigen</UiButton>
        </form> : null}
        {removeTarget ? <form className="platform-mfa-form platform-mfa-removal" onSubmit={(event) => void confirmRemoval(event)}>
          <h3>Verlorenes Gerät entfernen</h3>
          <p>Bestätige zuerst mit dem anderen, weiterhin verfügbaren Gerät. Danach muss ein neues zweites Gerät eingerichtet werden.</p>
          {proofChoices.map((factor, index) => <label key={factor.id}>
            <input checked={proofFactor === factor.id} name="platform-admin-removal-proof" onChange={() => { setProofFactor(factor.id); setCode(""); }} type="radio" />
            <span>{totpFactorLabel(factor, index)}</span>
          </label>)}
          <label htmlFor="platform-admin-removal-code">Bestätigungscode des verbleibenden Geräts</label>
          <input autoComplete="one-time-code" id="platform-admin-removal-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(normalizeTotpCode(event.target.value))} pattern="[0-9]{6}" required type="text" value={code} />
          <UiButton disabled={busy || code.length !== 6} loading={busy} type="submit">Verlust bestätigen und Gerät entfernen</UiButton>
          <UiButton disabled={busy} onClick={() => { setRemoveTarget(null); setProofFactor(null); setCode(""); }} type="button">Abbrechen</UiButton>
        </form> : null}
      </div>
    </AppDrawer>
  </>;
}
