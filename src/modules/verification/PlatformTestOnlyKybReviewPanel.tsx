import { useCallback, useEffect, useRef, useState } from "react";
import {
  confirmTestOnlyKybReauthentication,
  decideTestOnlyKybReview,
  prepareTestOnlyKybReauthentication,
  readTestOnlyKybReview,
  TestOnlyKybReviewError,
  type TestOnlyKybReviewAction,
  type TestOnlyKybReviewState,
  type TestOnlyKybTotpFactor,
} from "./testOnlyKybReviewService";
import { totpFactorLabel } from "../platform/platformAdminMfa.mjs";
import {
  clearTestOnlyKybReauthContinuation,
  createTestOnlyKybReauthContinuation,
  matchesTestOnlyKybReauthContinuation,
  readTestOnlyKybReauthContinuation,
  writeTestOnlyKybReauthContinuation,
} from "./testOnlyKybReauthContinuation.mjs";
import { supabase } from "../../shared/lib/supabase";

const documentNames = {
  GISA_EXTRACT: "GISA-Auszug",
  TRADE_LICENSE: "Gewerbeberechtigung",
} as const;

const errorMessages: Record<Exclude<TestOnlyKybReviewError["code"], "NOT_ELIGIBLE">, string> = {
  FRESH_AAL2_REQUIRED: "Die TOTP-Bestätigung ist nicht mehr frisch. Bitte mit der eigenen Authenticator-App erneut bestätigen und die Prüfdaten neu laden.",
  TOTP_FACTOR_REQUIRED: "Für diese Platform-Identität ist kein verifizierter Authenticator verfügbar.",
  TOTP_REAUTH_REJECTED: "Der Bestätigungscode ist falsch oder abgelaufen. Es wurde keine Entscheidung angeboten.",
  IDENTITY_CHANGED: "Die Platform-Identität hat sich während der Bestätigung geändert. Bitte beginne den TOTP-Nachweis erneut.",
  SECOND_PERSON_REQUIRED: "Der zweite Prüfschritt muss mit einer anderen berechtigten Platform-Identität erfolgen.",
  STALE: "Dokumente oder Materialrevision haben sich geändert. Es wurde nichts entschieden. Lade den aktuellen Stand neu.",
  REPLAY_CONFLICT: "Diese Anforderungs-ID wurde bereits mit anderen Prüfdaten verwendet. Es wurde nichts entschieden.",
  PERMISSION: "Die aktuelle Platform-Identität ist für diesen synthetischen Prüfschritt nicht berechtigt.",
  UNKNOWN: "Der synthetische Prüfschritt konnte nicht sicher abgeschlossen werden.",
};

function nextAction(state: TestOnlyKybReviewState): TestOnlyKybReviewAction | null {
  if (state.synthetic_review_complete) return null;
  return state.previous_action === "FIRST_REVIEW" ? "APPROVE_TEST" : "FIRST_REVIEW";
}

export function PlatformTestOnlyKybReviewPanel({ restaurantId, restaurantName }: {
  restaurantId: string;
  restaurantName: string;
}) {
  const [state, setState] = useState<TestOnlyKybReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEligible, setNotEligible] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [recentReadbackPassed, setRecentReadbackPassed] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthIdentityId, setReauthIdentityId] = useState("");
  const [totpFactors, setTotpFactors] = useState<TestOnlyKybTotpFactor[]>([]);
  const [totpFactorId, setTotpFactorId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const request = useRef<{ action: TestOnlyKybReviewAction; snapshot: string; id: string } | null>(null);
  const pendingReauthContinuation = useRef(
    typeof window === "undefined" ? null : readTestOnlyKybReauthContinuation(window.sessionStorage),
  );

  const refresh = useCallback(async () => {
    const continuation = pendingReauthContinuation.current;
    setLoading(true);
    setError("");
    try {
      const fresh = await readTestOnlyKybReview(restaurantId);
      setState(fresh);
      setNotEligible(false);
      setConfirmation("");
      setAcknowledged(false);
      const currentUser = supabase ? await supabase.auth.getUser() : null;
      const resumed = Boolean(
        continuation
        && currentUser
        && !currentUser.error
        && currentUser.data.user
        && matchesTestOnlyKybReauthContinuation(continuation, {
          restaurantId,
          identityId: currentUser.data.user.id,
        }),
      );
      pendingReauthContinuation.current = null;
      if (!resumed) clearTestOnlyKybReauthContinuation(window.sessionStorage);
      setRecentReadbackPassed(resumed);
      if (resumed) setResult("Aktuelle TOTP-Bestätigung und serverseitige Frischeprüfung bestanden.");
      request.current = null;
    } catch (caught) {
      const code = caught instanceof TestOnlyKybReviewError ? caught.code : "UNKNOWN";
      if (code === "NOT_ELIGIBLE") {
        setNotEligible(true);
        setState(null);
      } else {
        setError(errorMessages[code]);
      }
      pendingReauthContinuation.current = null;
      clearTestOnlyKybReauthContinuation(window.sessionStorage);
      setRecentReadbackPassed(false);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (notEligible) return null;

  const action = state ? nextAction(state) : null;
  const phrase = action ? `TEST_ONLY KYB ${action} ${restaurantName}` : "";
  const sameReviewerBlocked = action === "APPROVE_TEST" && state?.same_reviewer === true;

  async function beginReauthentication() {
    if (reauthBusy || busy) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    try {
      const proof = await prepareTestOnlyKybReauthentication();
      setReauthIdentityId(proof.identityId);
      setTotpFactors(proof.factors);
      setTotpFactorId(proof.factors[0]?.id ?? "");
      setTotpCode("");
      setReauthOpen(true);
    } catch (caught) {
      const code = caught instanceof TestOnlyKybReviewError ? caught.code : "UNKNOWN";
      setError(errorMessages[code === "NOT_ELIGIBLE" ? "UNKNOWN" : code]);
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
    pendingReauthContinuation.current = null;
    clearTestOnlyKybReauthContinuation(window.sessionStorage);
  }

  async function verifyReauthentication() {
    if (reauthBusy || busy || !reauthIdentityId || !totpFactorId || totpCode.length !== 6) return;
    setReauthBusy(true);
    setError("");
    setResult("");
    setRecentReadbackPassed(false);
    const continuation = createTestOnlyKybReauthContinuation({ restaurantId, identityId: reauthIdentityId });
    pendingReauthContinuation.current = continuation;
    writeTestOnlyKybReauthContinuation(window.sessionStorage, continuation);
    try {
      await confirmTestOnlyKybReauthentication({
        expectedIdentityId: reauthIdentityId,
        factorId: totpFactorId,
        code: totpCode,
      });
      const fresh = await readTestOnlyKybReview(restaurantId);
      setState(fresh);
      setNotEligible(false);
      setConfirmation("");
      setAcknowledged(false);
      request.current = null;
      setRecentReadbackPassed(true);
      setReauthOpen(false);
      setReauthIdentityId("");
      setTotpFactors([]);
      setTotpFactorId("");
      setTotpCode("");
      setResult("Aktuelle TOTP-Bestätigung und serverseitige Frischeprüfung bestanden.");
      pendingReauthContinuation.current = null;
    } catch (caught) {
      const code = caught instanceof TestOnlyKybReviewError ? caught.code : "UNKNOWN";
      setError(errorMessages[code === "NOT_ELIGIBLE" ? "UNKNOWN" : code]);
      setTotpCode("");
      pendingReauthContinuation.current = null;
      clearTestOnlyKybReauthContinuation(window.sessionStorage);
    } finally {
      setReauthBusy(false);
    }
  }

  async function submit() {
    if (!state || !action || busy || sameReviewerBlocked || !acknowledged || confirmation !== phrase) return;
    const requestKey = `${action}:${state.snapshot_sha256}:${state.previous_receipt_id ?? "FIRST"}`;
    if (!request.current || `${request.current.action}:${request.current.snapshot}` !== `${action}:${requestKey}`) {
      request.current = { action, snapshot: requestKey, id: crypto.randomUUID() };
    }
    setBusy(true);
    setError("");
    setResult("");
    try {
      const receipt = await decideTestOnlyKybReview({
        action,
        confirmation,
        reference: `TEST_ONLY_PLATFORM_UI_${action}`,
        requestId: request.current.id,
        state,
      });
      setResult(receipt.idempotent
        ? "Der identische Prüfschritt war bereits unverändert gespeichert."
        : action === "FIRST_REVIEW"
          ? "Erster synthetischer Prüfschritt gespeichert. Für den zweiten Schritt ist eine andere Platform-Identität erforderlich."
          : "Zweiter synthetischer Prüfschritt gespeichert. Dies ist keine reale KYB- oder Legal-Freigabe.");
      const fresh = await readTestOnlyKybReview(restaurantId);
      setState(fresh);
      setRecentReadbackPassed(false);
      setConfirmation("");
      setAcknowledged(false);
      request.current = null;
      clearTestOnlyKybReauthContinuation(window.sessionStorage);
    } catch (caught) {
      const code = caught instanceof TestOnlyKybReviewError ? caught.code : "UNKNOWN";
      setError(code === "NOT_ELIGIBLE" ? errorMessages.STALE : errorMessages[code]);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="test-only-kyb-review-title" className="platform-test-only-kyb-review" data-testid="test-only-kyb-review">
    <div className="platform-test-only-kyb-heading">
      <div>
        <p className="eyebrow">Synthetischer Prüfpfad</p>
        <h3 id="test-only-kyb-review-title">TEST_ONLY-KYB-Prüfung</h3>
      </div>
      <strong className="platform-test-only-badge">Keine reale Freigabe</strong>
    </div>
    <p className="platform-test-only-warning">Dieser Pfad erzeugt ausschließlich synthetische Test-Receipts. Er verifiziert kein reales Unternehmen und öffnet weder Aktivierung, Trial, PRO, Checkout noch Versand.</p>

    <div className="platform-test-only-reauth" data-testid="test-only-kyb-reauth">
      <div>
        <h4>Aktuelle TOTP-Bestätigung</h4>
        <p>Vor jeder synthetischen Entscheidung ist eine neue Bestätigung mit der eigenen Authenticator-App und anschließend ein serverseitiger Frischenachweis erforderlich.</p>
      </div>
      {recentReadbackPassed ? <p className="platform-test-only-complete" role="status">TOTP und serverseitiger Frischenachweis sind aktuell bestätigt. Erst jetzt ist die synthetische Entscheidung verfügbar.</p> : null}
      {!reauthOpen ? <button className="button secondary" disabled={reauthBusy || busy} onClick={() => void beginReauthentication()} type="button">
        {reauthBusy ? "Authenticator wird geprüft …" : "TOTP erneut bestätigen"}
      </button> : <form onSubmit={(event) => { event.preventDefault(); void verifyReauthentication(); }}>
        {totpFactors.length > 1 ? <label>Authenticator-Gerät
          <select disabled={reauthBusy} onChange={(event) => { setTotpFactorId(event.target.value); setTotpCode(""); }} value={totpFactorId}>
            {totpFactors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}
          </select>
        </label> : null}
        <label htmlFor="test-only-kyb-totp">Aktueller sechsstelliger Bestätigungscode</label>
        <input autoComplete="one-time-code" disabled={reauthBusy} id="test-only-kyb-totp" inputMode="numeric" maxLength={6}
          onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={totpCode} />
        <div className="platform-test-only-reauth-actions">
          <button className="button" disabled={reauthBusy || totpCode.length !== 6} type="submit">{reauthBusy ? "Wird sicher bestätigt …" : "TOTP sicher bestätigen"}</button>
          <button className="button secondary" disabled={reauthBusy} onClick={cancelReauthentication} type="button">Abbrechen</button>
        </div>
      </form>}
    </div>

    {loading ? <p role="status">Aktuelle materielle Prüfbasis wird sicher geladen …</p> : null}
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    {!loading && !state && error ? <button className="button secondary" onClick={() => void refresh()} type="button">Prüfbasis neu laden</button> : null}

    {state ? <>
      <dl className="platform-test-only-revision">
        <div><dt>Materialrevision</dt><dd data-testid="test-only-material-revision">{state.material_revision}</dd></div>
        <div><dt>Snapshot-SHA-256</dt><dd><code>{state.snapshot_sha256}</code></dd></div>
        <div><dt>Prüfstatus</dt><dd>{state.synthetic_review_complete ? "Synthetische Zweifachprüfung vollständig" : state.previous_action === "FIRST_REVIEW" ? "Erste Prüfung gespeichert" : "Noch nicht geprüft"}</dd></div>
      </dl>
      <div className="platform-test-only-documents">
        {state.documents.map((document) => <article data-document-type={document.type} key={document.id}>
          <strong>{documentNames[document.type]}</strong>
          <span>Fassung {document.version}</span>
          <dl>
            <div><dt>Dokument-ID</dt><dd><code>{document.id}</code></dd></div>
            <div><dt>SHA-256</dt><dd><code>{document.sha256}</code></dd></div>
          </dl>
        </article>)}
      </div>

      {state.synthetic_review_complete ? <p className="platform-test-only-complete" role="status">Die zwei getrennten synthetischen Prüfschritte sind für genau diese Revision und diese Dokumentbytes gespeichert. Reale KYB-/Legal-Gates bleiben unverändert.</p> : recentReadbackPassed ? <div className="platform-test-only-decision">
        <h4>{action === "FIRST_REVIEW" ? "1. synthetische Prüfung" : "2. synthetische Gegenprüfung"}</h4>
        {sameReviewerBlocked ? <p className="form-error" role="alert">Diese Identität hat bereits den ersten Schritt ausgeführt. Melde die zweite berechtigte Platform-Identität mit eigener frischer TOTP-Sitzung an.</p> : <>
          <label className="platform-test-only-check">
            <input checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); request.current = null; }} type="checkbox" />
            <span>Ich habe Materialrevision, Dokument-IDs, Fassungen und SHA-256-Werte geprüft. Die Entscheidung gilt nur für den synthetischen TEST_ONLY-Vertrag.</span>
          </label>
          <label>Bestätigungsphrase exakt eingeben:
            <code>{phrase}</code>
            <input className="input" onChange={(event) => { setConfirmation(event.target.value); request.current = null; }} value={confirmation} />
          </label>
          <button className="button" disabled={busy || !acknowledged || confirmation !== phrase} onClick={() => void submit()} type="button">
            {busy ? "Wird sicher geprüft …" : action === "FIRST_REVIEW" ? "Erste Testprüfung speichern" : "Synthetische Gegenprüfung speichern"}
          </button>
        </>}
      </div> : <p className="platform-test-only-auth-required">Bestätige TOTP erneut. Die Entscheidung bleibt bis zum bestandenen serverseitigen Frischenachweis geschlossen.</p>}
      {result ? <p className="platform-test-only-complete" role="status">{result}</p> : null}
      <button className="button secondary" disabled={busy} onClick={() => void refresh()} type="button">Prüfbasis neu laden</button>
    </> : null}
  </section>;
}
