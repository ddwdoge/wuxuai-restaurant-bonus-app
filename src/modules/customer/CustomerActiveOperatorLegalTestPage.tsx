import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../../shared/lib/supabase";

type TestDocument = { text: string; version: string; sha256: string };
type TestBundle = {
  status: "READY"; test_only: true; bundle_id: string; bundle_hash: string;
  material_revision: number; accepted: boolean; accepted_at: string | null;
  terms: TestDocument; privacy: TestDocument;
};
const digest = /^[0-9a-f]{64}$/;

function enabled() {
  const host = window.location.hostname;
  const backend = import.meta.env.VITE_SUPABASE_URL ?? "";
  const staging = host === "staging-app.bonus.wuxuaisbi.com"
    && backend === "https://bwhvfjuwixgwduoeqaya.supabase.co";
  const local = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(host)
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend);
  return import.meta.env.VITE_PLATFORM_TEST_CONTROL_ENABLED === "true" && (staging || local);
}

function valid(value: unknown): value is TestBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as TestBundle;
  return bundle.status === "READY" && bundle.test_only === true
    && digest.test(bundle.bundle_hash) && bundle.bundle_id === `at-test-${bundle.bundle_hash}`
    && Number.isSafeInteger(bundle.material_revision) && bundle.material_revision > 0
    && typeof bundle.accepted === "boolean"
    && [bundle.terms, bundle.privacy].every(doc => doc && typeof doc.text === "string"
      && doc.text.startsWith("TEST ONLY:") && typeof doc.version === "string"
      && doc.version.startsWith("TEST_ONLY_") && digest.test(doc.sha256));
}

export function CustomerActiveOperatorLegalTestPage() {
  const { slug = "", branchId = "" } = useParams();
  const { user } = useAuth();
  const context = `${user?.id ?? ""}:${slug}:${branchId}`;
  return <TestLegalContext key={context} context={context} slug={slug} branchId={branchId} authenticated={Boolean(user)} />;
}

function TestLegalContext({ context, slug, branchId, authenticated }: {
  context: string; slug: string; branchId: string; authenticated: boolean;
}) {
  const generation = useRef(0);
  const submitting = useRef(false);
  const request = useRef<{ bundleId: string; id: string } | null>(null);
  const [view, setView] = useState<{ loading: boolean; bundle: TestBundle | null; error: string | null }>({
    loading: true, bundle: null, error: null,
  });
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const allowed = enabled() && authenticated;
  const load = useCallback(async () => {
    const sequence = ++generation.current;
    setTerms(false); setPrivacy(false);
    setView({ loading: true, bundle: null, error: null });
    if (!allowed || !supabase) {
      setView({ loading: false, bundle: null, error: null });
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_customer_active_operator_test_legal", {
        input_restaurant_slug: slug, input_branch_id: branchId,
      });
      if (generation.current !== sequence) return;
      setView({ loading: false, bundle: !error && valid(data) ? data : null,
        error: error ? "Die aktuelle Testfassung konnte nicht geprüft werden. Bitte erneut laden." : null });
    } catch {
      if (generation.current === sequence) setView({ loading: false, bundle: null,
        error: "Die aktuelle Testfassung konnte nicht geprüft werden. Bitte erneut laden." });
    }
  }, [allowed, slug, branchId]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [context, load]);

  async function accept() {
    const bundle = view.bundle;
    if (!allowed || !supabase || !bundle || bundle.accepted || !terms || !privacy || submitting.current) return;
    submitting.current = true; setSaving(true);
    if (request.current?.bundleId !== bundle.bundle_id) request.current = { bundleId: bundle.bundle_id, id: crypto.randomUUID() };
    try {
      let failed = false;
      try {
        const { error } = await supabase.rpc("accept_customer_active_operator_test_legal", {
          input_restaurant_slug: slug, input_branch_id: branchId,
          input_bundle_id: bundle.bundle_id, input_bundle_hash: bundle.bundle_hash,
          input_material_revision: bundle.material_revision,
          input_terms_accepted: true, input_privacy_acknowledged: true,
          input_request_id: request.current.id,
        });
        failed = Boolean(error);
      } catch { failed = true; }
      // A lost response is resolved only by an authenticated, current server read.
      await load();
      if (failed) setView(previous => previous.bundle?.accepted ? previous : {
        ...previous, error: "Die Zustimmung wurde nicht bestätigt. Bitte die aktuelle Fassung erneut prüfen.",
      });
    } finally { submitting.current = false; setSaving(false); }
  }

  if (!allowed) return <main><h1>Testzugang nicht verfügbar</h1></main>;
  return <main style={{ width: "min(100%, 760px)", margin: "auto", padding: 16, boxSizing: "border-box", overflowWrap: "anywhere" }}>
    <h1>TEST_ONLY – neue Betreiberfassung</h1>
    <p>Nur ein synthetischer Test. Keine reale AT- oder anwaltliche Freigabe.</p>
    {view.loading ? <p role="status">Testunterlagen werden geprüft …</p> : null}
    {view.error ? <p role="alert">{view.error}</p> : null}
    {!view.loading && !view.bundle ? <p role="status">Keine aktuell passende Testfassung verfügbar. Eine Zustimmung ist gesperrt.</p> : null}
    {view.bundle ? <>
      <p>Materielle Prüfrevision: {view.bundle.material_revision}</p>
      <p>Bundle: <code>{view.bundle.bundle_id}</code><br />SHA-256: <code>{view.bundle.bundle_hash}</code></p>
      {([['Teilnahmebedingungen', view.bundle.terms], ['Datenschutzhinweise', view.bundle.privacy]] as const)
        .map(([title, document]) => <section key={title}>
          <h2>{title}</h2><p>Version: {document.version}<br />SHA-256: <code>{document.sha256}</code></p>
          <div style={{ whiteSpace: "pre-wrap" }}>{document.text}</div>
        </section>)}
      {view.bundle.accepted ? <p role="status">Diese exakt gebundene Testfassung wurde bereits bestätigt.</p> : <>
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={terms} disabled={saving} onChange={event => setTerms(event.target.checked)} /> Ich stimme den angezeigten Test-Teilnahmebedingungen zu.</label>
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={privacy} disabled={saving} onChange={event => setPrivacy(event.target.checked)} /> Ich habe die angezeigten Test-Datenschutzhinweise gelesen.</label>
        <button type="button" style={{ minHeight: 44 }} disabled={saving || !terms || !privacy} onClick={() => void accept()}>{saving ? "Zustimmung wird geprüft …" : "Testfassung bestätigen"}</button>
      </>}
    </> : null}
    <button type="button" style={{ minHeight: 44, marginTop: 16 }} disabled={saving} onClick={() => void load()}>Aktuelle Fassung erneut prüfen</button>
  </main>;
}
