import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./central-customer.css";

type Document = { text: string; version: string; sha256: string };
type Bundle = { status: "READY"; test_only: true; bundle_id: string; bundle_hash: string; terms: Document; privacy: Document };
const hashPattern = /^[a-f0-9]{64}$/;
function bundleValid(value: unknown): value is Bundle {
  if (!value || typeof value !== "object") return false;
  const b = value as Bundle;
  return b.status === "READY" && b.test_only === true && hashPattern.test(b.bundle_hash)
    && b.bundle_id === `at-test-${b.bundle_hash}`
    && [b.terms, b.privacy].every(d => d && typeof d.text === "string" && d.text.startsWith("TEST ONLY:")
      && typeof d.version === "string" && d.version.startsWith("TEST_ONLY_") && hashPattern.test(d.sha256));
}
function enabled() {
  const host = window.location.hostname;
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const staging = host === "staging-app.bonus.wuxuaisbi.com"
    && url === "https://bwhvfjuwixgwduoeqaya.supabase.co";
  const local = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(host)
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);
  return import.meta.env.VITE_PLATFORM_TEST_CONTROL_ENABLED === "true" && (staging || local);
}

// Separate opt-in route. Ordinary CustomerRestaurantAccess and its RPC remain untouched.
export function CustomerTestOnlyJoinPage() {
  const { slug = "", branchId = "" } = useParams();
  const { user } = useAuth();
  const key = `${user?.id ?? ""}:${slug}:${branchId}`;
  return <TestOnlyJoin key={key} contextKey={key} slug={slug} branchId={branchId} authenticated={Boolean(user)} />;
}

function TestOnlyJoin({ contextKey: key, slug, branchId, authenticated }: { contextKey: string; slug: string; branchId: string; authenticated: boolean }) {
  const current = useRef(key);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const request = useRef<{ key: string; bundle: string; id: string } | null>(null);
  const [view, setView] = useState<{ key: string; bundle: Bundle | null; loading: boolean; error: string | null; receipt: string | null }>({ key, bundle: null, loading: true, error: null, receipt: null });
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const allowed = enabled() && authenticated;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setTerms(false); setPrivacy(false);
    setView({ key, bundle: null, loading: true, error: null, receipt: null });
    if (!allowed || !supabase) { setView({ key, bundle: null, loading: false, error: null, receipt: null }); return; }
    try {
      const { data, error } = await supabase.rpc("get_customer_test_only_merchant_bundle", { input_restaurant_slug: slug, input_branch_id: branchId });
      if (current.current !== key || generation.current !== seq) return;
      setView({ key, bundle: !error && bundleValid(data) ? data : null, loading: false,
        error: error ? "Die Testunterlagen konnten nicht geladen werden. Bitte erneut prüfen." : null, receipt: null });
    } catch {
      if (current.current === key && generation.current === seq) setView({ key, bundle: null, loading: false, error: "Die Testunterlagen konnten nicht geladen werden. Bitte erneut prüfen.", receipt: null });
    }
  }, [allowed, key, slug, branchId]);
  useEffect(() => { current.current = key; void load(); return () => { current.current = ""; generation.current = -1; }; }, [key, load]);
  const bundle = view.key === key ? view.bundle : null;
  async function join() {
    if (!allowed || !supabase || !bundle || !terms || !privacy || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    if (request.current?.key !== key || request.current.bundle !== bundle.bundle_id)
      request.current = { key, bundle: bundle.bundle_id, id: crypto.randomUUID() };
    const requestId = request.current.id;
    try {
      // Server independently rechecks current publication under its transaction locks.
      try { await supabase.rpc("join_customer_account_test_only_at_legal", {
        input_restaurant_slug: slug, input_branch_id: branchId, input_terms_accepted: true,
        input_privacy_acknowledged: true, input_bundle_id: bundle.bundle_id,
        input_bundle_hash: bundle.bundle_hash, input_request_id: requestId,
      }); } catch { /* Unknown transport outcome: resolve only through the authoritative receipt below. */ }
      const { data: receipt, error } = await supabase.rpc("get_customer_test_only_join_receipt", { input_request_id: requestId });
      if (current.current !== key) return;
      if (error || receipt?.found !== true || receipt.test_only !== true || receipt.request_id !== requestId
        || receipt.branch_id !== branchId || receipt.bundle_id !== bundle.bundle_id || receipt.bundle_hash !== bundle.bundle_hash
        || receipt.legal_version !== bundle.terms.version || receipt.legal_sha256 !== bundle.terms.sha256
        || receipt.privacy_version !== bundle.privacy.version || receipt.privacy_sha256 !== bundle.privacy.sha256) throw new Error("Receipt unavailable");
      setView({ key, bundle: null, loading: false, error: null, receipt: requestId });
    } catch {
      if (current.current !== key) return;
      await load();
      if (current.current === key) setView(v => ({ ...v, error: "Der Beitritt ist nicht bestätigt. Bitte aktuelle Unterlagen erneut prüfen. Eine geänderte oder zurückgezogene Fassung kann nicht angenommen werden." }));
    } finally { inFlight.current = false; setSaving(false); }
  }
  if (!allowed) return <main><h1>Testzugang nicht verfügbar</h1></main>;
  return <main className="central-auth-page" style={{ maxWidth: 720, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>TEST_ONLY – Beitritt zum Testbetrieb</h1>
    <p>Nur synthetischer Test. Keine reale Rechtsfreigabe, Punktebuchung oder Versandfreigabe.</p>
    {view.key !== key || view.loading ? <p role="status">Testunterlagen werden geladen …</p> : null}
    {view.key === key && view.error ? <p role="alert">{view.error}</p> : null}
    {view.key === key && view.receipt ? <p role="status">Testbeitritt bestätigt. Der unveränderliche Beleg wurde vom Server gelesen.</p> : <>
      {!view.loading && !bundle ? <p role="status">Für diesen Testzugang sind keine gültigen Unterlagen verfügbar. Eine Zustimmung ist nicht möglich.</p> : null}
      {bundle ? <>
        {([['Teilnahmebedingungen', bundle.terms], ['Datenschutzhinweise', bundle.privacy]] as const).map(([title, doc]) => <section key={title}><h2>{title}</h2><p>Fassung: {doc.version}</p><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{doc.text}</pre><details><summary>Prüfsumme anzeigen</summary><code>{doc.sha256}</code></details></section>)}
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={terms} disabled={saving} onChange={e => setTerms(e.target.checked)} /> Ich akzeptiere die angezeigten Test-Teilnahmebedingungen.</label>
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={privacy} disabled={saving} onChange={e => setPrivacy(e.target.checked)} /> Ich habe die angezeigten Test-Datenschutzhinweise gelesen.</label>
        <button type="button" style={{ minHeight: 44 }} disabled={saving || !terms || !privacy} onClick={() => void join()}>{saving ? "Beitritt wird geprüft …" : "Testbeitritt bestätigen"}</button>
      </> : null}
      <button type="button" style={{ minHeight: 44, margin: 8 }} disabled={saving} onClick={() => void load()}>Unterlagen erneut prüfen</button>
    </>}
  </main>;
}
