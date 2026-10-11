import { useCallback, useEffect, useRef, useState } from "react";
import { totpFactorLabel } from "../platform/platformAdminMfa.mjs";
import {
  confirmTestOnlyKybReauthentication,
  prepareTestOnlyKybReauthentication,
  type TestOnlyKybTotpFactor,
} from "./testOnlyKybReviewService";
import {
  decideTestOnlyBasicAccess,
  normalizeTestOnlyBasicMfaError,
  readTestOnlyBasicAccess,
  TestOnlyBasicError,
  type TestOnlyBasicAccessState,
} from "./testOnlyBasicAccessService";

const errorMessages: Record<Exclude<TestOnlyBasicError["code"], "NOT_ELIGIBLE">, string> = {
  FRESH_AAL2_REQUIRED: "Der serverseitige TOTP-Nachweis ist abgelaufen. Bitte erneut bestätigen.",
  TOTP_FACTOR_REQUIRED: "Für diese Platform-Identität ist kein verifizierter Authenticator verfügbar.",
  TOTP_REAUTH_REJECTED: "Der Bestätigungscode ist falsch oder abgelaufen. Es wurde nichts geändert.",
  IDENTITY_CHANGED: "Die Platform-Identität hat sich während der Bestätigung geändert. Es wurde nichts geändert.",
  STALE: "Readiness-, Customer- oder Tenant-Belege haben sich geändert. Es wurde nichts geändert.",
  REPLAY_CONFLICT: "Diese Anforderungs-ID wurde bereits mit anderen Daten verwendet.",
  WINDOW_INVALID: "Das Testfenster muss zwischen 15 Minuten und vier Stunden liegen.",
  PERMISSION: "Die aktuelle Platform-Identität ist für diesen TEST_ONLY-Schritt nicht berechtigt.",
  UNKNOWN: "Der TEST_ONLY-BASIC-Zugriff konnte nicht sicher verarbeitet werden.",
};

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) : "NULL";
}

export function PlatformTestOnlyBasicAccessPanel({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<TestOnlyBasicAccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEligible, setNotEligible] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [recentReadbackPassed, setRecentReadbackPassed] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [identityId, setIdentityId] = useState("");
  const [factors, setFactors] = useState<TestOnlyKybTotpFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [reason, setReason] = useState("Synthetischer Staging-v2 BASIC-Funktionstest");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null);

  const clearDecision = useCallback(() => {
    setConfirmation("");
    setAcknowledged(false);
    request.current = null;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fresh = await readTestOnlyBasicAccess(restaurantId);
      setState(fresh);
      setNotEligible(false);
      setRecentReadbackPassed(false);
      clearDecision();
    } catch (caught) {
      const normalized = normalizeTestOnlyBasicMfaError(caught);
      if (normalized.code === "NOT_ELIGIBLE") {
        setNotEligible(true);
        setState(null);
      } else {
        setError(errorMessages[normalized.code]);
      }
    } finally {
      setLoading(false);
    }
  }, [clearDecision, restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  if (notEligible) return null;

  const action = state?.next_action ?? "GRANT";
  const phrase = `TEST_ONLY BASIC ${action} ${restaurantId}`;

  async function beginReauthentication() {
    if (reauthBusy || busy) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    clearDecision();
    try {
      const proof = await prepareTestOnlyKybReauthentication();
      setIdentityId(proof.identityId);
      setFactors(proof.factors);
      setFactorId(proof.factors[0]?.id ?? "");
      setTotpCode("");
      setReauthOpen(true);
    } catch (caught) {
      const normalized = normalizeTestOnlyBasicMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "UNKNOWN" : normalized.code]);
    } finally {
      setReauthBusy(false);
    }
  }

  function cancelReauthentication() {
    if (reauthBusy) return;
    setReauthOpen(false);
    setIdentityId("");
    setFactors([]);
    setFactorId("");
    setTotpCode("");
    setRecentReadbackPassed(false);
    setError("");
    clearDecision();
  }

  async function verifyReauthentication() {
    if (reauthBusy || busy || !identityId || !factorId || totpCode.length !== 6) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    try {
      await confirmTestOnlyKybReauthentication({ expectedIdentityId: identityId, factorId, code: totpCode });
      const fresh = await readTestOnlyBasicAccess(restaurantId);
      setState(fresh);
      setNotEligible(false);
      clearDecision();
      setRecentReadbackPassed(true);
      setReauthOpen(false);
      setIdentityId("");
      setFactors([]);
      setFactorId("");
      setTotpCode("");
      setResult("TOTP und frischer serverseitiger Vertrags-Readback bestanden.");
    } catch (caught) {
      const normalized = normalizeTestOnlyBasicMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "STALE" : normalized.code]);
      setTotpCode("");
      clearDecision();
    } finally {
      setReauthBusy(false);
    }
  }

  async function submit() {
    if (!state || busy || !recentReadbackPassed || !acknowledged || confirmation !== phrase || reason.trim().length < 10) return;
    const key = `${action}:${state.snapshot_sha256}:${state.previous_receipt_id ?? "FIRST"}:${windowMinutes}`;
    if (!request.current || request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setResult("");
    try {
      const expiresAt = action === "GRANT" ? new Date(Date.now() + windowMinutes * 60_000).toISOString() : null;
      const receipt = await decideTestOnlyBasicAccess({
        action,
        expiresAt,
        reason,
        confirmation,
        requestId: request.current.id,
        expectedState: state,
      });
      setResult(receipt.idempotent
        ? "Der identische TEST_ONLY-Schritt war bereits gespeichert."
        : action === "GRANT"
          ? `Synthetischer BASIC-Testzugriff bis ${formatTime(receipt.expires_at)} freigegeben.`
          : "Synthetischer BASIC-Testzugriff widerrufen.");
      const fresh = await readTestOnlyBasicAccess(restaurantId);
      setState(fresh);
      setRecentReadbackPassed(false);
      clearDecision();
    } catch (caught) {
      const normalized = normalizeTestOnlyBasicMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "STALE" : normalized.code]);
      setRecentReadbackPassed(false);
      clearDecision();
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="test-only-basic-access-title" className="platform-test-only-kyb-review platform-test-only-readiness" data-testid="test-only-basic-access">
    <div className="platform-test-only-kyb-heading">
      <div><p className="eyebrow">Befristeter synthetischer Betrieb</p><h3 id="test-only-basic-access-title">TEST_ONLY BASIC</h3></div>
      <strong className="platform-test-only-badge">Kein echtes Entitlement</strong>
    </div>
    <p className="platform-test-only-warning">Dieser getrennte Vertrag öffnet nur den gebundenen synthetischen Tenant befristet für BASIC-Funktionsprüfungen. Reale Aktivierung, Trial, KYB/Legal, Stripe, PRO, Mailversand und V1-Katalog bleiben geschlossen.</p>

    <div className="platform-test-only-reauth" data-testid="test-only-basic-reauth">
      <div><h4>Frische TOTP-Bestätigung</h4><p>Nach TOTP liest der Server Readiness, Customer-Bindung, Projekt und den letzten Zugriff erneut.</p></div>
      {recentReadbackPassed ? <p className="platform-test-only-complete" role="status">TOTP und frischer Readback sind für die angezeigte Entscheidung bestätigt.</p> : null}
      {!reauthOpen ? <button className="button secondary" disabled={reauthBusy || busy} onClick={() => void beginReauthentication()} type="button">{reauthBusy ? "Authenticator wird geprüft …" : "TOTP erneut bestätigen"}</button>
        : <form onSubmit={(event) => { event.preventDefault(); void verifyReauthentication(); }}>
          {factors.length > 1 ? <label>Authenticator-Gerät<select disabled={reauthBusy} onChange={(event) => { setFactorId(event.target.value); setTotpCode(""); }} value={factorId}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}</select></label> : null}
          <label htmlFor="test-only-basic-totp">Aktueller sechsstelliger Bestätigungscode</label>
          <input autoComplete="one-time-code" disabled={reauthBusy} id="test-only-basic-totp" inputMode="numeric" maxLength={6} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={totpCode} />
          <div className="platform-test-only-reauth-actions"><button className="button" disabled={reauthBusy || totpCode.length !== 6} type="submit">TOTP sicher bestätigen</button><button className="button secondary" disabled={reauthBusy} onClick={cancelReauthentication} type="button">Abbrechen</button></div>
        </form>}
    </div>

    {loading ? <p role="status">TEST_ONLY-BASIC-Vertrag wird frisch gelesen …</p> : null}
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    {state ? <>
      <dl className="platform-test-only-revision">
        <div><dt>Status</dt><dd>{state.active ? "AKTIV – TEST_ONLY" : "GESCHLOSSEN"}</dd></div>
        <div><dt>Nächste Aktion</dt><dd>{state.next_action}</dd></div>
        <div><dt>Gültig von / bis</dt><dd>{formatTime(state.starts_at)} / {formatTime(state.expires_at)}</dd></div>
        <div><dt>Snapshot-SHA-256</dt><dd><code>{state.snapshot_sha256}</code></dd></div>
        <div><dt>Readiness-Receipt</dt><dd><code>{state.snapshot.readiness_receipt_id}</code></dd></div>
        <div><dt>Customer-Join-Receipt</dt><dd><code>{state.snapshot.customer_join_receipt_id}</code></dd></div>
        <div><dt>Tenant</dt><dd><code>{state.snapshot.restaurant_id}<br />{state.snapshot.organization_id}<br />{state.snapshot.branch_id}</code></dd></div>
        <div><dt>Synthetischer Gast</dt><dd><code>{state.snapshot.customer_id}</code></dd></div>
        <div><dt>Test-Plan</dt><dd>BASIC · 5 Angebote · Benachrichtigungen aus · Katalog aus</dd></div>
        <div><dt>Reale Zustände</dt><dd>Aktivierung false · Trial false · Entitlement false · KYB false · Legal false</dd></div>
      </dl>
      {recentReadbackPassed ? <div className="platform-test-only-decision">
        <h4>{action === "GRANT" ? "Befristeten synthetischen Betrieb öffnen" : "Synthetischen Betrieb sofort widerrufen"}</h4>
        {action === "GRANT" ? <label>Testfenster<select className="input" onChange={(event) => { setWindowMinutes(Number(event.target.value)); request.current = null; }} value={windowMinutes}><option value={30}>30 Minuten</option><option value={60}>60 Minuten</option><option value={120}>2 Stunden</option><option value={240}>4 Stunden</option></select></label> : null}
        <label>Begründung ohne personenbezogene Daten<textarea className="input" maxLength={300} minLength={10} onChange={(event) => { setReason(event.target.value); request.current = null; }} value={reason} /></label>
        <label className="platform-test-only-check"><input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" /><span>Ich bestätige den ausschließlich synthetischen, tenantgebundenen und befristeten TEST_ONLY-BASIC-Vertrag. Reale Gates bleiben geschlossen.</span></label>
        <label>Bestätigungsphrase exakt eingeben:<code>{phrase}</code><input className="input" onChange={(event) => { setConfirmation(event.target.value); request.current = null; }} value={confirmation} /></label>
        <button className="button" disabled={busy || !acknowledged || confirmation !== phrase || reason.trim().length < 10} onClick={() => void submit()} type="button">{busy ? "Wird sicher geprüft …" : action === "GRANT" ? "TEST_ONLY BASIC befristet öffnen" : "TEST_ONLY BASIC sofort widerrufen"}</button>
      </div> : <p className="platform-test-only-auth-required">Bestätige TOTP erneut. Erst danach wird die Entscheidung auf einem frischen Readback angeboten.</p>}
      {result ? <p className="platform-test-only-complete" role="status">{result}</p> : null}
      <button className="button secondary" disabled={busy} onClick={() => void refresh()} type="button">Vertrag neu laden</button>
    </> : null}
  </section>;
}
