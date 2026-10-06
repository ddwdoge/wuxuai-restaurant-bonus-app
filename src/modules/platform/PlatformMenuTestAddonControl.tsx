import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabase";
import { loadPlatformTestCollectionMfaProof, refreshPlatformTestCollectionRecentTotp } from "./platformAdminService";

type AddonState = { restaurant_id: string; branch_id: string; grant_id: string | null; expires_at: string | null; active: boolean };

export function PlatformMenuTestAddonControl({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const [state, setState] = useState<AddonState | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<{ id: string; expiresAt: string | null } | null>(null);
  const action = state?.active ? "REVOKE" : "GRANT";
  const expected = `TEST_ONLY MENÜ ${restaurantName} ${action === "GRANT" ? "ERTEILEN" : "WIDERRUFEN"}`;
  const local = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const staging = window.location.hostname === "staging-app.bonus.wuxuaisbi.com"
    && import.meta.env.VITE_PLATFORM_TEST_CONTROL_ENABLED === "true"
    && typeof import.meta.env.VITE_SUPABASE_URL === "string"
    && import.meta.env.VITE_SUPABASE_URL.startsWith(`https://${import.meta.env.VITE_PLATFORM_TEST_CONTROL_PROJECT_REF}.supabase.co`);

  const load = useCallback(async () => {
    if (!supabase || !(local || staging)) return;
    setError("");
    try {
      const proof = await loadPlatformTestCollectionMfaProof();
      if (!proof.aal2 || proof.verifiedFactors.length === 0) { setError("AAL2 mit verifiziertem Authenticator ist erforderlich."); return; }
      const { data, error: readError } = await supabase.rpc("get_platform_test_menu_addon", { input_restaurant_id: restaurantId });
      if (readError) throw readError;
      setFactorId(proof.verifiedFactors[0].id);
      setState(data as AddonState);
    } catch { setState(null); setError("TEST_ONLY-Kontext oder geschützter Status ist nicht lesbar."); }
  }, [restaurantId, local, staging]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!supabase || !state || busy || !factorId || code.length !== 6 || reason.trim().length < 10 || confirmation !== expected) return;
    setBusy(true); setError("");
    const operation = request.current ?? {
      id: crypto.randomUUID(),
      expiresAt: action === "GRANT" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
    };
    request.current = operation;
    try {
      await refreshPlatformTestCollectionRecentTotp(factorId, code);
      const { data, error: writeError } = await supabase.rpc("set_platform_test_menu_addon", {
        input_restaurant_id: state.restaurant_id, input_branch_id: state.branch_id,
        input_action: action, input_expected_grant_id: state.grant_id,
        input_expires_at: operation.expiresAt,
        input_reason: reason.trim(), input_request_id: operation.id,
      });
      if (writeError || !data?.event_id) throw writeError ?? new Error("RECEIPT_MISSING");
      const { data: readback, error: readError } = await supabase.rpc("get_platform_test_menu_addon", { input_restaurant_id: restaurantId });
      if (readError || readback?.active !== (action === "GRANT")) throw readError ?? new Error("READBACK_MISMATCH");
      setState(readback as AddonState); setCode(""); setReason(""); setConfirmation(""); request.current = null;
    } catch { setState(null); request.current = null; setError("Aktion nicht bestätigt. Bitte Status lesen, bevor du erneut handelst."); }
    finally { setBusy(false); }
  }

  if (!(local || staging)) return null;
  return <section aria-label="TEST_ONLY-Menü-Add-on" className="card pro-section">
    <h3>TEST_ONLY-Menü-Add-on · {restaurantName}</h3>
    {error ? <p role="alert">{error}</p> : null}
    {!state ? <button onClick={() => void load()} type="button">Geschützten Status lesen</button> : <>
      <p role="status">{state.active ? `Aktiv bis ${state.expires_at ?? "–"}` : "Nicht aktiv"} · Filiale {state.branch_id}</p>
      <p>Nur synthetischer STAGING-Kontext; keine kommerzielle Freischaltung.</p>
      <label>Grund<textarea minLength={10} onChange={(event) => setReason(event.target.value)} value={reason} /></label>
      <label>Aktueller Authenticator-Code<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} value={code} /></label>
      <label>Exakte Bestätigung<input autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></label>
      <code>{expected}</code>
      <button disabled={busy || code.length !== 6 || reason.trim().length < 10 || confirmation !== expected} onClick={() => void submit()} type="button">{action === "GRANT" ? "Für eine Stunde erteilen" : "Widerrufen"}</button>
    </>}
  </section>;
}
