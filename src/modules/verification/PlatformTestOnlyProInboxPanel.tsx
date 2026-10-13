import { useCallback, useEffect, useRef, useState } from "react";
import { totpFactorLabel } from "../platform/platformAdminMfa.mjs";
import { confirmTestOnlyKybReauthentication, prepareTestOnlyKybReauthentication, type TestOnlyKybTotpFactor } from "./testOnlyKybReviewService";
import { decideTestOnlyProInboxAccess, normalizeTestOnlyProInboxMfaError, readTestOnlyProInboxAccess, type TestOnlyProInboxAccessState, type TestOnlyProInboxErrorCode } from "./testOnlyProInboxAccessService";

const errors: Record<TestOnlyProInboxErrorCode, string> = {
  NOT_ELIGIBLE: "Der gebundene synthetische Gast- und Readiness-Vertrag ist nicht vollständig.",
  FRESH_AAL2_REQUIRED: "Der serverseitige TOTP-Nachweis ist abgelaufen. Bitte erneut bestätigen.",
  TOTP_FACTOR_REQUIRED: "Für diese Platform-Identität ist kein verifizierter Authenticator verfügbar.",
  TOTP_REAUTH_REJECTED: "Der Bestätigungscode ist falsch oder abgelaufen. Es wurde nichts geändert.",
  IDENTITY_CHANGED: "Die Platform-Identität hat sich während der Bestätigung geändert.",
  STALE: "Projekt-, Tenant-, Gast- oder Readiness-Belege haben sich geändert.",
  REPLAY_CONFLICT: "Diese Anforderungs-ID wurde bereits mit anderen Daten verwendet.",
  WINDOW_INVALID: "Das Testfenster muss zwischen 15 Minuten und vier Stunden liegen.",
  PERMISSION: "Die aktuelle Platform-Identität ist nicht berechtigt.",
  UNKNOWN: "Der TEST_ONLY-PRO-In-App-Vertrag konnte nicht sicher verarbeitet werden.",
};

const time = (value: string | null) => value
  ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value))
  : "NULL";

export function PlatformTestOnlyProInboxPanel({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<TestOnlyProInboxAccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [recent, setRecent] = useState(false);
  const [identityId, setIdentityId] = useState("");
  const [factors, setFactors] = useState<TestOnlyKybTotpFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("Synthetischer Staging-v2 PRO-In-App-Test");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null);

  const clear = useCallback(() => { setConfirmation(""); setAcknowledged(false); request.current = null; }, []);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setState(await readTestOnlyProInboxAccess(restaurantId)); setRecent(false); clear(); }
    catch (caught) { setState(null); setError(errors[normalizeTestOnlyProInboxMfaError(caught).code]); }
    finally { setLoading(false); }
  }, [clear, restaurantId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const action = state?.next_action ?? "GRANT";
  const phrase = `TEST_ONLY PRO IN_APP ${action} ${restaurantId}`;

  async function beginReauth() {
    if (busy || reauthBusy) return;
    setReauthBusy(true); setError(""); setResult(""); setRecent(false); clear();
    try {
      const proof = await prepareTestOnlyKybReauthentication();
      setIdentityId(proof.identityId); setFactors(proof.factors); setFactorId(proof.factors[0]?.id ?? "");
      setCode(""); setReauthOpen(true);
    } catch (caught) { setError(errors[normalizeTestOnlyProInboxMfaError(caught).code]); }
    finally { setReauthBusy(false); }
  }

  async function verifyReauth() {
    if (busy || reauthBusy || !identityId || !factorId || code.length !== 6) return;
    setReauthBusy(true); setError(""); setResult(""); setRecent(false);
    try {
      await confirmTestOnlyKybReauthentication({ expectedIdentityId: identityId, factorId, code });
      setState(await readTestOnlyProInboxAccess(restaurantId)); setRecent(true); setReauthOpen(false);
      setIdentityId(""); setFactors([]); setFactorId(""); setCode(""); clear();
      setResult("TOTP und frischer serverseitiger Vertrags-Readback bestanden.");
    } catch (caught) { setError(errors[normalizeTestOnlyProInboxMfaError(caught).code]); setCode(""); clear(); }
    finally { setReauthBusy(false); }
  }

  async function submit() {
    if (!state || busy || !recent || !acknowledged || confirmation !== phrase || reason.trim().length < 10) return;
    const key = `${action}:${state.snapshot_sha256}:${state.previous_receipt_id ?? "FIRST"}:${minutes}`;
    if (!request.current || request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError(""); setResult("");
    try {
      const receipt = await decideTestOnlyProInboxAccess({ action,
        expiresAt: action === "GRANT" ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
        reason, confirmation, requestId: request.current.id, expectedState: state });
      setResult(receipt.idempotent ? "Der identische TEST_ONLY-Schritt war bereits gespeichert."
        : action === "GRANT" ? `Synthetische In-App-Prüfung bis ${time(receipt.expires_at)} geöffnet.`
          : "Synthetische In-App-Prüfung widerrufen.");
      setState(await readTestOnlyProInboxAccess(restaurantId)); setRecent(false); clear();
    } catch (caught) { setError(errors[normalizeTestOnlyProInboxMfaError(caught).code]); setRecent(false); clear(); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="test-only-pro-inbox-title" className="platform-test-only-kyb-review platform-test-only-readiness" data-testid="test-only-pro-inbox-access">
    <div className="platform-test-only-kyb-heading"><div><p className="eyebrow">Befristete synthetische Benachrichtigung</p><h3 id="test-only-pro-inbox-title">TEST_ONLY PRO · In-App</h3></div><strong className="platform-test-only-badge">Kein echtes PRO</strong></div>
    <p className="platform-test-only-warning">Dieser isolierte Pfad gilt nur für den exakt gebundenen Test-Gast. Er erzeugt weder echtes PRO noch E-Mail, Push, Checkout, Stripe oder Katalogzugriff.</p>
    <div className="platform-test-only-reauth"><div><h4>Frische TOTP-Bestätigung</h4><p>Nach TOTP werden Projekt, Tenant, Gast, Readiness und Realzustand erneut gelesen.</p></div>
      {recent ? <p className="platform-test-only-complete" role="status">TOTP und frischer Readback sind bestätigt.</p> : null}
      {!reauthOpen ? <button className="button secondary" disabled={busy || reauthBusy} onClick={() => void beginReauth()} type="button">TOTP erneut bestätigen</button>
        : <form onSubmit={(event) => { event.preventDefault(); void verifyReauth(); }}>
          {factors.length > 1 ? <label>Authenticator-Gerät<select value={factorId} onChange={(event) => { setFactorId(event.target.value); setCode(""); }}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}</select></label> : null}
          <label htmlFor="test-only-pro-inbox-totp">Aktueller sechsstelliger Bestätigungscode</label>
          <input id="test-only-pro-inbox-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          <div className="platform-test-only-reauth-actions"><button className="button" disabled={reauthBusy || code.length !== 6} type="submit">TOTP sicher bestätigen</button><button className="button secondary" type="button" onClick={() => { setReauthOpen(false); setRecent(false); setCode(""); clear(); }}>Abbrechen</button></div>
        </form>}
    </div>
    {loading ? <p role="status">TEST_ONLY-PRO-In-App-Vertrag wird gelesen …</p> : null}
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    {state ? <>
      <dl className="platform-test-only-revision">
        <div><dt>Status</dt><dd>{state.active ? "AKTIV – TEST_ONLY" : "GESCHLOSSEN"}</dd></div>
        <div><dt>Gültig bis</dt><dd>{time(state.expires_at)}</dd></div>
        <div><dt>Gebundener Gast</dt><dd><code>{state.snapshot.guest_auth_user_id}</code></dd></div>
        <div><dt>Einwilligung</dt><dd>{state.consent_active ? "TEST_ONLY bestätigt" : "Nicht bestätigt"}</dd></div>
        <div><dt>Inbox</dt><dd>{state.notification_count} gesamt · {state.unread_count} ungelesen</dd></div>
        <div><dt>Snapshot-SHA-256</dt><dd><code>{state.snapshot_sha256}</code></dd></div>
        <div><dt>Realausgänge</dt><dd>PRO aus · E-Mail aus · Push aus</dd></div>
      </dl>
      {recent ? <div className="platform-test-only-decision">
        {action === "GRANT" ? <label>Testfenster<select className="input" value={minutes} onChange={(event) => { setMinutes(Number(event.target.value)); request.current = null; }}><option value={30}>30 Minuten</option><option value={60}>60 Minuten</option><option value={120}>2 Stunden</option><option value={240}>4 Stunden</option></select></label> : null}
        <label>Begründung<textarea className="input" minLength={10} maxLength={300} value={reason} onChange={(event) => { setReason(event.target.value); request.current = null; }} /></label>
        <label className="platform-test-only-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>Nur der gebundene synthetische Gast und nur In-App; alle realen Ausgänge bleiben geschlossen.</span></label>
        <label>Bestätigungsphrase exakt eingeben:<code>{phrase}</code><input className="input" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); request.current = null; }} /></label>
        <button className="button" disabled={busy || !acknowledged || confirmation !== phrase || reason.trim().length < 10} onClick={() => void submit()} type="button">{action === "GRANT" ? "TEST_ONLY PRO In-App öffnen" : "TEST_ONLY PRO In-App widerrufen"}</button>
      </div> : <p className="platform-test-only-auth-required">Bestätige TOTP erneut. Erst danach ist eine Entscheidung möglich.</p>}
      {result ? <p className="platform-test-only-complete" role="status">{result}</p> : null}
      <button className="button secondary" disabled={busy} onClick={() => void refresh()} type="button">Vertrag neu laden</button>
    </> : null}
  </section>;
}
