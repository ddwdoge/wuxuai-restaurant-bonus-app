import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useAuth } from "../auth/AuthProvider";
import {
  loadPlatformTestCollectionControlContext,
  loadPlatformTestCollectionMfaProof,
  mutateAndConfirmPlatformTestCollectionMode,
  refreshPlatformTestCollectionRecentTotp,
  type PlatformTestCollectionMode,
} from "./platformAdminService";
import {
  canShowPlatformTestCollectionControl,
  classifyPlatformTestCollectionReceipt,
  platformTestCollectionTransition,
  platformTestControlEnvironmentEnabled,
} from "./platformTestCollectionModeContract.mjs";

type Factor = { id: string; friendly_name?: string };
type Operation = {
  expectedMode: PlatformTestCollectionMode;
  targetMode: PlatformTestCollectionMode;
  idempotencyKey: string;
};

const modeLabels: Record<PlatformTestCollectionMode, string> = {
  restaurant_controlled_only: "Nur Restaurant-gesteuert",
  both: "Beide Sammelwege",
};

function factorLabel(factor: Factor, index: number) {
  return String(factor.friendly_name ?? "").trim() || `Authenticator-Gerät ${index + 1}`;
}

export function PlatformTestCollectionModeControl({ restaurant }: {
  restaurant: { id: string; name: string; slug: string };
}) {
  const { platformRole } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PlatformTestCollectionMode | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const inFlight = useRef(false);

  const environmentEnabled = useMemo(() => platformTestControlEnvironmentEnabled({
    featureFlag: import.meta.env.VITE_PLATFORM_TEST_CONTROL_ENABLED,
    expectedProjectRef: import.meta.env.VITE_PLATFORM_TEST_CONTROL_PROJECT_REF,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    appOrigin: import.meta.env.VITE_APP_BASE_URL,
    runtimeOrigin: window.location.origin,
  }), []);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setVisible(false);
    setMode(null);
    setError("");
    setMessage("");
    setLocked(false);
    setOperation(null);
    if (!environmentEnabled || (platformRole !== "platform_owner" && platformRole !== "platform_admin")) return;
    setLoading(true);
    try {
      const proof = await loadPlatformTestCollectionMfaProof();
      if (request !== generation.current) return;
      const context = await loadPlatformTestCollectionControlContext({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
      });
      if (request !== generation.current) return;
      const allowed = canShowPlatformTestCollectionControl({
        environmentEnabled,
        platformRole,
        aal2: proof.aal2,
        verifiedTotp: proof.verifiedFactors.length > 0,
        exactTestOnlyTenant: context.exactTestOnlyTenant,
      });
      if (!allowed) return;
      setFactors(proof.verifiedFactors);
      setFactorId(proof.verifiedFactors[0]?.id ?? "");
      setMode(context.currentMode);
      setVisible(true);
    } catch {
      // Fail closed: no control or tenant detail is rendered when any proof fails.
      setVisible(false);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [environmentEnabled, platformRole, restaurant.id, restaurant.name, restaurant.slug]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const transition = platformTestCollectionTransition(mode);

  function openConfirmation() {
    if (!transition || locked || busy) return;
    setOperation({
      expectedMode: transition.currentMode,
      targetMode: transition.targetMode,
      idempotencyKey: crypto.randomUUID(),
    });
    setTotpCode("");
    setConfirmed(false);
    setError("");
    setMessage("");
  }

  function closeConfirmation() {
    if (busy) return;
    setOperation(null);
    setTotpCode("");
    setConfirmed(false);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation || locked || busy || inFlight.current || !factorId || totpCode.length !== 6 || !confirmed) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await refreshPlatformTestCollectionRecentTotp(factorId, totpCode);
    } catch {
      setError("Der aktuelle TOTP-Nachweis wurde nicht bestätigt. Es wurde keine Änderung angefordert.");
      setTotpCode("");
      setBusy(false);
      inFlight.current = false;
      return;
    }
    try {
      const result = await mutateAndConfirmPlatformTestCollectionMode({
        restaurantId: restaurant.id,
        expectedMode: operation.expectedMode,
        targetMode: operation.targetMode,
        idempotencyKey: operation.idempotencyKey,
      });
      const receipt = classifyPlatformTestCollectionReceipt(result.receipt, operation.expectedMode, operation.targetMode);
      if (receipt.status === "committed") {
        setOperation(null);
        setTotpCode("");
        setConfirmed(false);
        await load();
        setMessage("Die auditierte Teständerung wurde serverseitig bestätigt.");
      } else if (receipt.status === "not_committed") {
        setLocked(true);
        setError("Die Änderung ist nicht belegt. Es erfolgt keine automatische Wiederholung. Bitte den Vorgang manuell prüfen.");
      } else if (receipt.status === "unclear") {
        setLocked(true);
        setError("Der Zustand hat sich ohne passenden Beleg verändert. Weitere Änderungen sind bis zur manuellen Prüfung gesperrt.");
      } else {
        setLocked(true);
        setError("Der Sicherheitsbeleg widerspricht dem erwarteten Vorgang. Weitere Änderungen sind gesperrt.");
      }
    } catch {
      setLocked(true);
      setError("Der Vorgang konnte nicht sicher belegt werden. Es erfolgt keine automatische Wiederholung.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  if (loading || !visible) return null;

  return <section className="platform-test-collection-control" data-testid="platform-test-collection-control">
    <header>
      <div><span className="platform-health-badge test">TEST_ONLY</span><h3>TEST_ONLY Punkte-Sammelmodus</h3></div>
      <ShieldCheck aria-hidden="true" size={24} />
    </header>
    <dl>
      <div><dt>Betrieb</dt><dd>{restaurant.name}</dd></div>
      <div><dt>Aktueller Sammelmodus</dt><dd>{mode ? modeLabels[mode] : "Nicht sicher lesbar"}</dd></div>
    </dl>
    <p>Diese temporäre Teständerung wird unveränderbar protokolliert. Punkte-, Belohnungs- und Abrechnungsdaten bleiben unverändert.</p>
    {message ? <p className="status-message" role="status">{message}</p> : null}
    {locked && error ? <p className="status-message error" role="alert">{error}</p> : null}
    {transition ? <button className="button secondary" disabled={busy || locked} onClick={openConfirmation} type="button">{transition.label}</button> : <p className="status-message error" role="status">Für den aktuellen Sammelmodus ist keine Testaktion erlaubt.</p>}

    <AppDrawer
      closeLabel="Abbrechen"
      description="Nur der angezeigte TEST_ONLY-Betrieb und der fest abgeleitete Sammelmodus werden geändert."
      dismissOnOverlay={!busy}
      onClose={closeConfirmation}
      open={Boolean(operation)}
      size="compact"
      title="TEST_ONLY-Sammelmodus bestätigen"
    >
      {operation ? <form className="platform-test-collection-form" onSubmit={(event) => void submit(event)}>
        <div className="platform-test-collection-warning"><AlertTriangle aria-hidden="true" size={22} /><p>Die Änderung erzeugt einen append-only Auditbeleg. Punkte-, Belohnungs- und Abrechnungsdaten werden nicht verändert.</p></div>
        <dl>
          <div><dt>Betrieb</dt><dd>{restaurant.name}</dd></div>
          <div><dt>Ausgangsmodus</dt><dd>{modeLabels[operation.expectedMode]}</dd></div>
          <div><dt>Zielmodus</dt><dd>{modeLabels[operation.targetMode]}</dd></div>
        </dl>
        {factors.length > 1 ? <fieldset disabled={busy}>
          <legend>Authenticator-Gerät</legend>
          {factors.map((factor, index) => <label key={factor.id}><input checked={factorId === factor.id} name="test-control-factor" onChange={() => { setFactorId(factor.id); setTotpCode(""); }} type="radio" /><span>{factorLabel(factor, index)}</span></label>)}
        </fieldset> : null}
        <label htmlFor="platform-test-control-totp">Aktueller sechsstelliger TOTP-Code</label>
        <input autoComplete="one-time-code" disabled={busy || locked} id="platform-test-control-totp" inputMode="numeric" maxLength={6} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={totpCode} />
        <label className="platform-test-collection-confirm"><input checked={confirmed} disabled={busy || locked} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>Ich bestätige den angezeigten Betrieb und den einmaligen Moduswechsel.</span></label>
        {error ? <p className="status-message error" role="alert">{error}</p> : null}
        <div className="platform-test-collection-actions"><button className="button secondary" disabled={busy} onClick={closeConfirmation} type="button">Abbrechen</button><button className="button primary" disabled={busy || locked || !confirmed || totpCode.length !== 6} type="submit">Sicher ausführen</button></div>
      </form> : null}
    </AppDrawer>
  </section>;
}
