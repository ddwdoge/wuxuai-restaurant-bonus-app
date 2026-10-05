import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useAuth } from "../auth/AuthProvider";
import { loadPlatformTestCollectionMfaProof, loadPlatformTestTenantCleanupPreflight, refreshPlatformTestCollectionRecentTotp } from "./platformAdminService";
import { totpFactorLabel } from "./platformAdminMfa.mjs";
import { platformTestControlEnvironmentEnabled } from "./platformTestCollectionModeContract.mjs";
import {
  classifyTestLegalError, testLegalConfirmation, testLegalDocuments, validTestCustomerId,
  type TestLegalDocuments, type TestLegalScope,
} from "./platformTestLegalSetupContract.mjs";
import {
  bindTestLegalCustomer, loadTestLegalScope, publishTestMerchantBundle,
  publishTestPlatformTerms, readTestMerchantPublicationReceipt,
} from "./platformTestLegalSetupService";
import "./platform-test-legal-setup.css";

type Step = "identity" | "platform" | "merchant";
type Factor = { id: string; friendly_name?: string };
type Operation = { step: Step; requestId: string; customerId: string; confirmation: string; uncertain: boolean };

const labels: Record<Step, string> = {
  identity: "Test-Gast-Identität binden",
  platform: "Synthetische Plattformbedingungen veröffentlichen",
  merchant: "Synthetisches Betriebsbundle veröffentlichen",
};
const areas = ["legal", "privacy", "document_catalog", "retention"] as const;
const areaLabels = { legal: "Teilnahmebedingungen", privacy: "Datenschutzinformation",
  document_catalog: "Dokumentkatalog", retention: "Aufbewahrungs-Prüftext" };

export function PlatformTestLegalSetupControl({ restaurantId, restaurantName, canWrite }: {
  restaurantId: string; restaurantName: string; canWrite: boolean;
}) {
  const { platformRole } = useAuth();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"loading" | "authentication" | "ready" | "error">("loading");
  const [scope, setScope] = useState<TestLegalScope | null>(null);
  const [documents, setDocuments] = useState<TestLegalDocuments | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [step, setStep] = useState<Step>("identity");
  const [customerId, setCustomerId] = useState("");
  const [completed, setCompleted] = useState({ identity: false, platform: false, merchant: false });
  const [operation, setOperation] = useState<Operation | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const inFlight = useRef(false);
  const environmentEnabled = useMemo(() => platformTestControlEnvironmentEnabled({
    featureFlag: import.meta.env.VITE_PLATFORM_TEST_CONTROL_ENABLED,
    expectedProjectRef: import.meta.env.VITE_PLATFORM_TEST_CONTROL_PROJECT_REF,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
  }), []);
  const authorized = platformRole === "platform_owner" || platformRole === "platform_admin";

  const load = useCallback(async () => {
    const request = ++generation.current;
    setVisible(false); setPhase("loading"); setScope(null); setDocuments(null);
    setOperation(null); setCompleted({ identity: false, platform: false, merchant: false });
    setError(""); setMessage(""); setLocked(false); setTotpCode("");
    if (!environmentEnabled || !authorized || !canWrite) return;
    try {
      const preflight = await loadPlatformTestTenantCleanupPreflight(restaurantId);
      if (request !== generation.current) return;
      const markers = (preflight as typeof preflight & { registry_states?: Array<{ state?: string; restaurant_id?: string }> }).registry_states;
      if (!Array.isArray(markers) || markers.length !== 1
        || markers[0]?.state !== "ACTIVE" || markers[0]?.restaurant_id !== restaurantId) return;
      setVisible(true);
      const proof = await loadPlatformTestCollectionMfaProof();
      if (request !== generation.current) return;
      setFactors(proof.verifiedFactors);
      setFactorId(proof.verifiedFactors[0]?.id ?? "");
      if (!proof.aal2 || !proof.verifiedFactors.length) { setPhase("authentication"); return; }
      const verifiedScope = await loadTestLegalScope(restaurantId, restaurantName);
      if (request !== generation.current) return;
      if (!verifiedScope) { setPhase("error"); setError("Der Testbetrieb ist nicht exakt gebunden. Es sind keine Aktionen verfügbar."); return; }
      setScope(verifiedScope);
      setDocuments(await testLegalDocuments(restaurantId));
      if (request !== generation.current) return;
      setPhase("ready");
    } catch (failure) {
      if (request !== generation.current) return;
      const code = String((failure as { message?: string })?.message ?? "");
      setPhase(code.includes("RECENT_PLATFORM_TOTP_REQUIRED") ? "authentication" : "error");
      setError(classifyTestLegalError(failure));
    }
  }, [authorized, canWrite, environmentEnabled, restaurantId, restaurantName]);

  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  async function confirmAuthenticator(event: FormEvent) {
    event.preventDefault();
    if (!factorId || totpCode.length !== 6 || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await refreshPlatformTestCollectionRecentTotp(factorId, totpCode); setTotpCode(""); await load(); }
    catch { setError("Der aktuelle Authenticator-Nachweis wurde nicht bestätigt. Es wurde nichts veröffentlicht."); setTotpCode(""); }
    finally { setBusy(false); inFlight.current = false; }
  }

  function prepare() {
    if (!scope || !documents || phase !== "ready" || busy || locked || operation
      || (step === "identity" && !validTestCustomerId(customerId))
      || (step === "platform" && !completed.identity)
      || (step === "merchant" && (!completed.identity || !completed.platform || scope.merchantStatus !== "NOT_FOUND"))) return;
    const normalizedCustomer = customerId.trim().toLowerCase();
    setOperation({ step, requestId: crypto.randomUUID(), customerId: normalizedCustomer,
      confirmation: testLegalConfirmation(step, scope, normalizedCustomer), uncertain: false });
    setTypedConfirmation(""); setTotpCode(""); setError(""); setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation || !scope || !documents || !factorId || totpCode.length !== 6
      || typedConfirmation !== operation.confirmation || busy || inFlight.current || locked) return;
    inFlight.current = true; setBusy(true); setError("");
    let mutationStarted = false;
    try {
      await refreshPlatformTestCollectionRecentTotp(factorId, totpCode);
      const current = await loadTestLegalScope(restaurantId, restaurantName);
      if (!current || current.branchId !== scope.branchId || current.testSessionId !== scope.testSessionId
        || current.organizationId !== scope.organizationId) throw new Error("AT_LEGAL_TEST_SCOPE_DENIED");
      if (operation.step === "merchant" && current.merchantStatus !== "NOT_FOUND") {
        if (!operation.uncertain) throw new Error("AT_LEGAL_TEST_EXPECTED_STATE_MISMATCH");
        const receipt = await readTestMerchantPublicationReceipt(current, operation.requestId);
        if (!receipt.found) throw new Error("AT_LEGAL_TEST_EXPECTED_STATE_MISMATCH");
        setScope({ ...current, merchantStatus: "PUBLISHED_TEST", bundleId: receipt.bundleId ?? null,
          bundleHash: receipt.bundleHash ?? null });
      } else {
        mutationStarted = true;
        if (operation.step === "identity") {
          await bindTestLegalCustomer(current, operation.customerId, operation.requestId);
        } else if (operation.step === "platform") {
          await publishTestPlatformTerms(current, documents, operation.requestId);
        } else {
          const receipt = await publishTestMerchantBundle(current, documents, operation.requestId);
          setScope({ ...current, merchantStatus: "PUBLISHED_TEST", bundleId: receipt.bundle_id,
            bundleHash: receipt.bundle_hash });
        }
      }
      setCompleted(previous => ({ ...previous, [operation.step]: true }));
      setStep(operation.step === "identity" ? "platform" : "merchant");
      setMessage(`${labels[operation.step]}: serverseitiger Beleg bestätigt.`);
      setOperation(null); setTypedConfirmation(""); setTotpCode("");
    } catch (failure) {
      const detail = String((failure as { message?: string })?.message ?? "");
      setError(classifyTestLegalError(failure));
      setTotpCode("");
      if (mutationStarted && !/RECEIPT_CONFLICT|READBACK_CONFLICT/.test(detail)) {
        setOperation(previous => previous ? { ...previous, uncertain: true } : previous);
      } else if (/RECEIPT_CONFLICT|READBACK_CONFLICT/.test(detail)) setLocked(true);
    } finally { setBusy(false); inFlight.current = false; }
  }

  if (!visible) return null;
  const actionReady = phase === "ready" && scope && documents && scope.merchantStatus === "NOT_FOUND";
  return <section className="platform-test-legal-setup" data-testid="platform-test-legal-setup" aria-busy={busy || phase === "loading"}>
    <header><span className="platform-health-badge test">TEST_ONLY</span><h3>Synthetische Rechtstexte für Staging vorbereiten</h3></header>
    <p>Nur für einen eindeutig markierten Testbetrieb. Diese Texte ersetzen keine echte Rechtsfreigabe und öffnen das reale AT-Intake nicht.</p>
    {phase === "authentication" ? <form onSubmit={(event) => void confirmAuthenticator(event)}>
      <p role="status">Ein frischer Authenticator-Nachweis ist nötig, bevor der Testkontext gelesen werden kann.</p>
      <label>Authenticator-Gerät<select disabled={busy} onChange={event => { setFactorId(event.target.value); setTotpCode(""); }} value={factorId}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}</select></label>
      <label>Aktueller sechsstelliger Bestätigungscode<input autoComplete="one-time-code" disabled={busy} inputMode="numeric" maxLength={6} onChange={event => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={totpCode} /></label>
      <button className="button secondary" disabled={busy || !factorId || totpCode.length !== 6} type="submit">Nachweis bestätigen und Testkontext lesen</button>
    </form> : null}
    {phase === "error" ? <button className="button secondary" onClick={() => void load()} type="button">Status erneut prüfen</button> : null}
    {scope && documents ? <>
      <dl className="platform-test-legal-facts">
        <div><dt>Testbetrieb</dt><dd>{scope.restaurantName} · {scope.restaurantId}</dd></div>
        <div><dt>Test-Standort</dt><dd>{scope.branchId}</dd></div>
        <div><dt>Test-Sitzung</dt><dd>{scope.testSessionId}</dd></div>
        <div><dt>Betriebsbundle</dt><dd>{scope.merchantStatus === "NOT_FOUND" ? "Noch nicht veröffentlicht" : `${scope.merchantStatus} · ${scope.bundleId ?? "–"}`}</dd></div>
      </dl>
      {actionReady ? <>
        <label>Einzelschritt auswählen<select disabled={busy || Boolean(operation)} onChange={event => setStep(event.target.value as Step)} value={step}>
          <option value="identity">1. Test-Gast binden</option><option disabled={!completed.identity} value="platform">2. Plattformbedingungen</option>
          <option disabled={!completed.identity || !completed.platform} value="merchant">3. Betriebsbundle</option>
        </select></label>
        {step === "identity" ? <label>Bestätigte Test-Gast-Kennung<input autoComplete="off" disabled={busy || Boolean(operation)} onChange={event => setCustomerId(event.target.value)} placeholder="00000000-0000-4000-8000-000000000000" value={customerId} /></label> : null}
        {step !== "identity" ? <details><summary>Exakte synthetische Fassung vor Bestätigung lesen</summary>
          {step === "platform" ? <article><h4>Plattformbedingungen · {documents.platform.version}</h4><p>{documents.platform.body}</p><p>Anbieterfassung: {documents.platform.providerSnapshot}</p><code>SHA-256 {documents.platform.sha256}</code></article>
            : areas.map(area => <article key={area}><h4>{areaLabels[area]} · {documents.manifest[area].version}</h4><p>{documents.manifest[area].body}</p><code>SHA-256 {documents.manifest[area].sha256}</code></article>)}
        </details> : null}
        <button className="button secondary" disabled={busy || locked || Boolean(operation)
          || (step === "identity" && !validTestCustomerId(customerId))} onClick={prepare} type="button">{labels[step]} vorbereiten</button>
      </> : <p role="status">Für diesen Betrieb ist kein weiterer Erst-Publikationsvorgang erlaubt.</p>}
    </> : null}
    {message ? <p className="status-message" role="status">{message}</p> : null}
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
    <AppDrawer closeLabel="Abbrechen" description="Nur der angezeigte TEST_ONLY-Betrieb und die exakte Testfassung sind betroffen."
      dismissOnEscape={!busy} dismissOnOverlay={!busy} onClose={() => { if (!busy) { setOperation(null); setTypedConfirmation(""); setTotpCode(""); } }}
      open={Boolean(operation)} size="compact" title={operation ? labels[operation.step] : "Testaktion bestätigen"}>
      {operation && scope && documents ? <form className="platform-test-legal-form" onSubmit={(event) => void submit(event)}>
        <p>Diese Aktion erzeugt einen unveränderlichen TEST_ONLY-Beleg. Sie aktiviert weder den Betrieb noch das reale AT-Intake.</p>
        <dl><div><dt>Betrieb</dt><dd>{scope.restaurantName} · {scope.restaurantId}</dd></div>
          <div><dt>Filiale</dt><dd>{scope.branchId}</dd></div><div><dt>Test-Sitzung</dt><dd>{scope.testSessionId}</dd></div>
          {operation.step === "identity" ? <div><dt>Test-Gast</dt><dd>{operation.customerId}</dd></div>
            : <div><dt>Dokument-/Bundle-Version</dt><dd>{documents.platform.version}</dd></div>}
          {operation.step === "platform" ? <div><dt>Dokument-Hash</dt><dd>{documents.platform.sha256}</dd></div> : null}
          {operation.step === "merchant" ? areas.map(area => <div key={area}><dt>{areaLabels[area]} · Hash</dt><dd>{documents.manifest[area].sha256}</dd></div>) : null}
        </dl>
        <label>Bestätigung exakt eingeben<input autoComplete="off" disabled={busy} onChange={event => setTypedConfirmation(event.target.value)} value={typedConfirmation} /></label>
        <code className="platform-test-legal-confirmation">{operation.confirmation}</code>
        <label>Authenticator-Gerät<select disabled={busy} onChange={event => { setFactorId(event.target.value); setTotpCode(""); }} value={factorId}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}</select></label>
        <label>Aktueller sechsstelliger Bestätigungscode<input autoComplete="one-time-code" disabled={busy || locked} inputMode="numeric" maxLength={6} onChange={event => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={totpCode} /></label>
        {operation.uncertain ? <p role="alert">Der Ausgang ist unklar. Nur dieselbe Vorgangskennung wird erneut geprüft; keine neue Aktion vorbereiten.</p> : null}
        <div className="platform-test-legal-actions"><button className="button secondary" disabled={busy} onClick={() => { setOperation(null); setTypedConfirmation(""); setTotpCode(""); }} type="button">Abbrechen</button>
          <button className="button primary" disabled={busy || locked || !factorId || totpCode.length !== 6 || typedConfirmation !== operation.confirmation} type="submit">{operation.uncertain ? "Denselben Vorgang prüfen" : "Einmalig bestätigen"}</button></div>
      </form> : null}
    </AppDrawer>
  </section>;
}
