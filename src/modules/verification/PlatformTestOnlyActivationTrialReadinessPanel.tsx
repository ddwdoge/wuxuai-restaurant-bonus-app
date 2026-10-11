import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabase";
import { totpFactorLabel } from "../platform/platformAdminMfa.mjs";
import {
  confirmTestOnlyKybReauthentication,
  prepareTestOnlyKybReauthentication,
  type TestOnlyKybTotpFactor,
} from "./testOnlyKybReviewService";
import {
  decideTestOnlyActivationTrialReadiness,
  normalizeReadinessMfaError,
  readTestOnlyActivationTrialReadiness,
  TestOnlyActivationTrialReadinessError,
  type TestOnlyActivationTrialReadinessState,
} from "./testOnlyActivationTrialReadinessService";
import {
  clearTestOnlyActivationTrialReauthContinuation,
  createTestOnlyActivationTrialReauthContinuation,
  matchesTestOnlyActivationTrialReauthContinuation,
  readTestOnlyActivationTrialReauthContinuation,
  writeTestOnlyActivationTrialReauthContinuation,
} from "./testOnlyActivationTrialReauthContinuation.mjs";

const documentNames = {
  GISA_EXTRACT: "GISA-Auszug",
  TRADE_LICENSE: "Gewerbeberechtigung",
} as const;

const errorMessages: Record<Exclude<TestOnlyActivationTrialReadinessError["code"], "NOT_ELIGIBLE">, string> = {
  FRESH_AAL2_REQUIRED: "Der serverseitige TOTP-Nachweis ist abgelaufen. Bitte erneut mit der eigenen Authenticator-App bestätigen.",
  TOTP_FACTOR_REQUIRED: "Für diese Platform-Identität ist kein verifizierter Authenticator verfügbar.",
  TOTP_REAUTH_REJECTED: "Der Bestätigungscode ist falsch oder abgelaufen. Es wurde keine Entscheidung angeboten.",
  IDENTITY_CHANGED: "Die Platform-Identität hat sich während der Bestätigung geändert. Es wurde keine Entscheidung angeboten.",
  NEWER_TOTP_REQUIRED: "Schritt 2 verlangt eine neuere TOTP-Bestätigung als Schritt 1. Bitte erneut bestätigen.",
  STALE: "Belege, Materialrevision oder Receipt-Kette haben sich geändert. Es wurde nichts entschieden. Lade den aktuellen Stand neu.",
  REPLAY_CONFLICT: "Diese Anforderungs-ID wurde bereits mit anderen Prüfdaten verwendet. Es wurde nichts entschieden.",
  PERMISSION: "Die aktuelle Platform-Identität ist für diesen synthetischen Readiness-Schritt nicht berechtigt.",
  UNKNOWN: "Der synthetische Readiness-Schritt konnte nicht sicher abgeschlossen werden.",
};

function formatNullable(value: string | null) {
  return value ?? "NULL";
}

export function PlatformTestOnlyActivationTrialReadinessPanel({ restaurantId }: {
  restaurantId: string;
}) {
  const [state, setState] = useState<TestOnlyActivationTrialReadinessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEligible, setNotEligible] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recentReadbackPassed, setRecentReadbackPassed] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthIdentityId, setReauthIdentityId] = useState("");
  const [totpFactors, setTotpFactors] = useState<TestOnlyKybTotpFactor[]>([]);
  const [totpFactorId, setTotpFactorId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const pendingContinuation = useRef(
    typeof window === "undefined" ? null : readTestOnlyActivationTrialReauthContinuation(window.sessionStorage),
  );

  const clearDecisionInputs = useCallback(() => {
    setConfirmation("");
    setAcknowledged(false);
  }, []);

  const resetDecision = useCallback(() => {
    clearDecisionInputs();
    request.current = null;
  }, [clearDecisionInputs]);

  const refresh = useCallback(async () => {
    const continuation = pendingContinuation.current;
    setLoading(true);
    setError("");
    try {
      const fresh = await readTestOnlyActivationTrialReadiness(restaurantId);
      setState(fresh);
      setNotEligible(false);
      resetDecision();
      const currentUser = supabase ? await supabase.auth.getUser() : null;
      const resumed = Boolean(
        continuation
        && currentUser
        && !currentUser.error
        && currentUser.data.user
        && matchesTestOnlyActivationTrialReauthContinuation(continuation, {
          restaurantId,
          identityId: currentUser.data.user.id,
        }),
      );
      pendingContinuation.current = null;
      if (!resumed) clearTestOnlyActivationTrialReauthContinuation(window.sessionStorage);
      setRecentReadbackPassed(resumed);
      if (resumed) setResult("Aktuelle TOTP-Bestätigung und frischer Read-RPC-Nachweis bestanden.");
    } catch (caught) {
      const normalized = normalizeReadinessMfaError(caught);
      if (normalized.code === "NOT_ELIGIBLE") {
        setNotEligible(true);
        setState(null);
      } else {
        setError(errorMessages[normalized.code]);
      }
      pendingContinuation.current = null;
      clearTestOnlyActivationTrialReauthContinuation(window.sessionStorage);
      setRecentReadbackPassed(false);
    } finally {
      setLoading(false);
    }
  }, [resetDecision, restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (notEligible) return null;

  const action = state?.next_action ?? null;
  const phrase = action ? `TEST_ONLY ${action} ${restaurantId}` : "";

  async function beginReauthentication() {
    if (reauthBusy || busy) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    clearDecisionInputs();
    try {
      const proof = await prepareTestOnlyKybReauthentication();
      setReauthIdentityId(proof.identityId);
      setTotpFactors(proof.factors);
      setTotpFactorId(proof.factors[0]?.id ?? "");
      setTotpCode("");
      setReauthOpen(true);
    } catch (caught) {
      const normalized = normalizeReadinessMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "UNKNOWN" : normalized.code]);
    } finally {
      setReauthBusy(false);
    }
  }

  function cancelReauthentication() {
    if (reauthBusy) return;
    setReauthOpen(false);
    setReauthIdentityId("");
    setTotpFactors([]);
    setTotpFactorId("");
    setTotpCode("");
    setRecentReadbackPassed(false);
    setError("");
    clearDecisionInputs();
    pendingContinuation.current = null;
    clearTestOnlyActivationTrialReauthContinuation(window.sessionStorage);
  }

  async function verifyReauthentication() {
    if (reauthBusy || busy || !reauthIdentityId || !totpFactorId || totpCode.length !== 6) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    const continuation = createTestOnlyActivationTrialReauthContinuation({
      restaurantId,
      identityId: reauthIdentityId,
    });
    pendingContinuation.current = continuation;
    writeTestOnlyActivationTrialReauthContinuation(window.sessionStorage, continuation);
    try {
      await confirmTestOnlyKybReauthentication({
        expectedIdentityId: reauthIdentityId,
        factorId: totpFactorId,
        code: totpCode,
      });
      // This read is authoritative for what the administrator sees after TOTP.
      const fresh = await readTestOnlyActivationTrialReadiness(restaurantId);
      setState(fresh);
      setNotEligible(false);
      clearDecisionInputs();
      setRecentReadbackPassed(true);
      setReauthOpen(false);
      setReauthIdentityId("");
      setTotpFactors([]);
      setTotpFactorId("");
      setTotpCode("");
      setResult("Aktuelle TOTP-Bestätigung und frischer Read-RPC-Nachweis bestanden.");
      pendingContinuation.current = null;
    } catch (caught) {
      const normalized = normalizeReadinessMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "STALE" : normalized.code]);
      setTotpCode("");
      pendingContinuation.current = null;
      clearTestOnlyActivationTrialReauthContinuation(window.sessionStorage);
    } finally {
      setReauthBusy(false);
    }
  }

  async function submit() {
    if (!state || !action || busy || !recentReadbackPassed || !acknowledged || confirmation !== phrase) return;
    const requestKey = `${action}:${state.snapshot_sha256}:${state.previous_receipt_id ?? "FIRST"}`;
    if (!request.current || request.current.key !== requestKey) {
      request.current = { key: requestKey, id: crypto.randomUUID() };
    }
    setBusy(true);
    setError("");
    setResult("");
    try {
      const receipt = await decideTestOnlyActivationTrialReadiness({
        action,
        confirmation,
        reference: `TEST_ONLY_PLATFORM_UI_${action}`,
        requestId: request.current.id,
        expectedState: state,
      });
      setResult(receipt.idempotent
        ? "Der identische TEST_ONLY-Schritt war bereits unverändert gespeichert."
        : action === "ACTIVATION_READINESS_TEST"
          ? "Synthetische Aktivierungsbereitschaft gespeichert. Schritt 2 bleibt bis zu einer neueren TOTP-Bestätigung geschlossen."
          : "Synthetische Trial-Bereitschaft gespeichert. Es wurde kein realer Trial gestartet.");
      const fresh = await readTestOnlyActivationTrialReadiness(restaurantId);
      setState(fresh);
      setRecentReadbackPassed(false);
      clearDecisionInputs();
      request.current = null;
      clearTestOnlyActivationTrialReauthContinuation(window.sessionStorage);
    } catch (caught) {
      const normalized = normalizeReadinessMfaError(caught);
      setError(errorMessages[normalized.code === "NOT_ELIGIBLE" ? "STALE" : normalized.code]);
      setRecentReadbackPassed(false);
      clearDecisionInputs();
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="test-only-activation-trial-title" className="platform-test-only-kyb-review platform-test-only-readiness" data-testid="test-only-activation-trial-readiness">
    <div className="platform-test-only-kyb-heading">
      <div>
        <p className="eyebrow">Synthetischer Readiness-Pfad</p>
        <h3 id="test-only-activation-trial-title">TEST_ONLY Aktivierungs- und Trial-Bereitschaft</h3>
      </div>
      <strong className="platform-test-only-badge">Keine reale Aktivierung</strong>
    </div>
    <p className="platform-test-only-warning">Dieses Panel erzeugt nur zwei unveränderliche TEST_ONLY-Receipts. Es aktiviert keinen Betrieb, startet keinen Trial und öffnet weder Stripe, PRO, Checkout, Versand noch Katalog.</p>

    <div className="platform-test-only-reauth" data-testid="test-only-activation-trial-reauth">
      <div>
        <h4>Frische TOTP-Bestätigung vor jedem Schritt</h4>
        <p>Nach der Bestätigung liest der Server alle Belege neu. Schritt 2 verlangt zusätzlich einen TOTP-Zeitpunkt, der strikt neuer als der Nachweis von Schritt 1 ist.</p>
      </div>
      {recentReadbackPassed ? <p className="platform-test-only-complete" role="status">TOTP und frischer Read-RPC-Nachweis sind für den angezeigten Schritt aktuell bestätigt.</p> : null}
      {!reauthOpen ? <button className="button secondary" disabled={reauthBusy || busy || state?.synthetic_chain_complete === true} onClick={() => void beginReauthentication()} type="button">
        {reauthBusy ? "Authenticator wird geprüft …" : "TOTP erneut bestätigen"}
      </button> : <form onSubmit={(event) => { event.preventDefault(); void verifyReauthentication(); }}>
        {totpFactors.length > 1 ? <label>Authenticator-Gerät
          <select disabled={reauthBusy} onChange={(event) => { setTotpFactorId(event.target.value); setTotpCode(""); }} value={totpFactorId}>
            {totpFactors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}
          </select>
        </label> : null}
        <label htmlFor="test-only-activation-trial-totp">Aktueller sechsstelliger Bestätigungscode</label>
        <input autoComplete="one-time-code" disabled={reauthBusy} id="test-only-activation-trial-totp" inputMode="numeric" maxLength={6}
          onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={totpCode} />
        <div className="platform-test-only-reauth-actions">
          <button className="button" disabled={reauthBusy || totpCode.length !== 6} type="submit">{reauthBusy ? "Wird sicher bestätigt …" : "TOTP sicher bestätigen"}</button>
          <button className="button secondary" disabled={reauthBusy} onClick={cancelReauthentication} type="button">Abbrechen</button>
        </div>
      </form>}
    </div>

    {loading ? <p role="status">Aktuelle TEST_ONLY-Readiness-Belege werden sicher geladen …</p> : null}
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    {!loading && !state && error ? <button className="button secondary" onClick={() => void refresh()} type="button">Readiness-Belege neu laden</button> : null}

    {state ? <>
      <dl className="platform-test-only-revision">
        <div><dt>Nächster Schritt</dt><dd>{state.next_action ?? "TEST_ONLY-Kette vollständig"}</dd></div>
        <div><dt>Materialrevision</dt><dd>{state.snapshot.material_revision}</dd></div>
        <div><dt>Readiness-Snapshot-SHA-256</dt><dd><code>{state.snapshot_sha256}</code></dd></div>
        <div><dt>Vorheriges Receipt</dt><dd><code>{state.previous_receipt_id ?? "NULL"}</code></dd></div>
        <div><dt>Projekt / Issuer / Origin</dt><dd><code>{state.snapshot.project.project_ref}<br />{state.snapshot.project.auth_issuer}<br />{state.snapshot.project.app_origin}</code></dd></div>
        <div><dt>Tenant-Bindung</dt><dd><code>{state.snapshot.restaurant_id}<br />{state.snapshot.organization_id}<br />{state.snapshot.branch_id}<br />{state.snapshot.case_id}</code></dd></div>
      </dl>

      <section className="platform-test-only-evidence" aria-labelledby="test-only-readiness-kyb">
        <h4 id="test-only-readiness-kyb">Synthetische KYB-Belege</h4>
        <dl className="platform-test-only-revision">
          <div><dt>KYB-Receipt</dt><dd><code>{state.snapshot.kyb.receipt_id}</code></dd></div>
          <div><dt>KYB-Snapshot-SHA-256</dt><dd><code>{state.snapshot.kyb.snapshot_sha256}</code></dd></div>
          <div><dt>Reale KYB-Verifikation</dt><dd>false</dd></div>
        </dl>
        <div className="platform-test-only-documents">
          {state.snapshot.kyb.documents.map((document) => <article data-document-type={document.type} key={document.id}>
            <strong>{documentNames[document.type]}</strong>
            <span>Fassung {document.version}</span>
            <dl>
              <div><dt>Dokument-ID</dt><dd><code>{document.id}</code></dd></div>
              <div><dt>SHA-256</dt><dd><code>{document.sha256}</code></dd></div>
            </dl>
          </article>)}
        </div>
      </section>

      <section className="platform-test-only-evidence" aria-labelledby="test-only-readiness-legal">
        <h4 id="test-only-readiness-legal">Synthetische Legal-Belege</h4>
        <dl className="platform-test-only-revision">
          <div><dt>Plattform-Publikation</dt><dd><code>{state.snapshot.legal.platform_publication_id}</code></dd></div>
          <div><dt>Plattform-Version</dt><dd><code>{state.snapshot.legal.platform_version}</code></dd></div>
          <div><dt>Plattform-SHA-256</dt><dd><code>{state.snapshot.legal.platform_sha256}</code></dd></div>
          <div><dt>Betriebs-Publikation</dt><dd><code>{state.snapshot.legal.merchant_publication_id}</code></dd></div>
          <div><dt>Betriebs-Bundle</dt><dd><code>{state.snapshot.legal.merchant_bundle_id}</code></dd></div>
          <div><dt>Bundle-SHA-256</dt><dd><code>{state.snapshot.legal.merchant_bundle_hash}</code></dd></div>
          <div><dt>Reale Legal-Readiness</dt><dd>false</dd></div>
        </dl>
      </section>

      <section className="platform-test-only-evidence" aria-labelledby="test-only-readiness-closed-state">
        <h4 id="test-only-readiness-closed-state">Unverändert geschlossener Realzustand</h4>
        <dl className="platform-test-only-revision">
          <div><dt>Betrieb / Aktivierung / Filiale</dt><dd>{state.snapshot.baseline.restaurant_status} / {state.snapshot.baseline.activation_status} / {state.snapshot.baseline.branch_status}</dd></div>
          <div><dt>Subscription / Zahlung</dt><dd>{state.snapshot.baseline.subscription_status} / {state.snapshot.baseline.payment_status}</dd></div>
          <div><dt>Trial Start / Ende</dt><dd>{formatNullable(state.snapshot.baseline.trial_started_at)} / {formatNullable(state.snapshot.baseline.trial_ends_at)}</dd></div>
          <div><dt>Stripe Customer / Subscription</dt><dd>{formatNullable(state.snapshot.baseline.stripe_customer_id)} / {formatNullable(state.snapshot.baseline.stripe_subscription_id)}</dd></div>
          <div><dt>Reales AT-Intake / Katalog</dt><dd>{state.snapshot.baseline.real_intake_status} / {String(state.snapshot.baseline.catalog_access)}</dd></div>
        </dl>
      </section>

      {state.synthetic_chain_complete ? <p className="platform-test-only-complete" role="status">Beide synthetischen Readiness-Receipts sind gespeichert. Betrieb, Trial, Stripe, PRO, Versand und Katalog bleiben unverändert geschlossen.</p> : recentReadbackPassed && action ? <div className="platform-test-only-decision">
        <h4>{action === "ACTIVATION_READINESS_TEST" ? "Schritt 1: Synthetische Aktivierungsbereitschaft" : "Schritt 2: Synthetische Trial-Bereitschaft"}</h4>
        <label className="platform-test-only-check">
          <input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
          <span>Ich habe den frisch gelesenen Projekt-, Tenant-, KYB-, Legal- und geschlossenen Realzustand geprüft. Dieses Receipt ist ausschließlich TEST_ONLY.</span>
        </label>
        <label>Bestätigungsphrase exakt eingeben:
          <code>{phrase}</code>
          <input className="input" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
        </label>
        <button className="button" disabled={busy || !acknowledged || confirmation !== phrase} onClick={() => void submit()} type="button">
          {busy ? "Wird sicher geprüft …" : action === "ACTIVATION_READINESS_TEST" ? "Synthetische Aktivierungsbereitschaft speichern" : "Synthetische Trial-Bereitschaft speichern"}
        </button>
      </div> : <p className="platform-test-only-auth-required">Bestätige TOTP erneut. Vor dem Schreiben wird der vollständige Zustand nochmals frisch per Read-RPC geprüft.</p>}
      {result ? <p className="platform-test-only-complete" role="status">{result}</p> : null}
      <button className="button secondary" disabled={busy} onClick={() => void refresh()} type="button">Readiness-Belege neu laden</button>
    </> : null}
  </section>;
}
