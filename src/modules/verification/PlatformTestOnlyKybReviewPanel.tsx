import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideTestOnlyKybReview,
  readTestOnlyKybReview,
  TestOnlyKybReviewError,
  type TestOnlyKybReviewAction,
  type TestOnlyKybReviewState,
} from "./testOnlyKybReviewService";

const documentNames = {
  GISA_EXTRACT: "GISA-Auszug",
  TRADE_LICENSE: "Gewerbeberechtigung",
} as const;

const errorMessages: Record<Exclude<TestOnlyKybReviewError["code"], "NOT_ELIGIBLE">, string> = {
  FRESH_AAL2_REQUIRED: "Die TOTP-Bestätigung ist nicht mehr frisch. Bitte mit der eigenen Authenticator-App erneut bestätigen und die Prüfdaten neu laden.",
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
  const request = useRef<{ action: TestOnlyKybReviewAction; snapshot: string; id: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fresh = await readTestOnlyKybReview(restaurantId);
      setState(fresh);
      setNotEligible(false);
      setConfirmation("");
      setAcknowledged(false);
      request.current = null;
    } catch (caught) {
      const code = caught instanceof TestOnlyKybReviewError ? caught.code : "UNKNOWN";
      if (code === "NOT_ELIGIBLE") {
        setNotEligible(true);
        setState(null);
      } else {
        setError(errorMessages[code]);
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (notEligible) return null;

  const action = state ? nextAction(state) : null;
  const phrase = action ? `TEST_ONLY KYB ${action} ${restaurantName}` : "";
  const sameReviewerBlocked = action === "APPROVE_TEST" && state?.same_reviewer === true;

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
      setConfirmation("");
      setAcknowledged(false);
      request.current = null;
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

      {state.synthetic_review_complete ? <p className="platform-test-only-complete" role="status">Die zwei getrennten synthetischen Prüfschritte sind für genau diese Revision und diese Dokumentbytes gespeichert. Reale KYB-/Legal-Gates bleiben unverändert.</p> : <div className="platform-test-only-decision">
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
      </div>}
      {result ? <p className="platform-test-only-complete" role="status">{result}</p> : null}
      <button className="button secondary" disabled={busy} onClick={() => void refresh()} type="button">Prüfbasis neu laden</button>
    </> : null}
  </section>;
}
