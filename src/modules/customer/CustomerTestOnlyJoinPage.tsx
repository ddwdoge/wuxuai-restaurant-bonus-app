import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./central-customer.css";

type Document = { text: string; version: string; sha256: string };
type Bundle = { status: "READY"; test_only: true; bundle_id: string; bundle_hash: string; terms: Document; privacy: Document };
type DocumentKind = "terms" | "privacy";
type JoinedStatus = {
  status: "JOINED"; test_only: true; restaurant_slug: string; restaurant_id: string; branch_id: string;
  membership_id: string; request_id: string; bundle_id: string; bundle_hash: string;
  legal_version: string; legal_sha256: string; privacy_version: string; privacy_sha256: string;
  accepted_at: string;
};
const hashPattern = /^[a-f0-9]{64}$/;
function bundleValid(value: unknown): value is Bundle {
  if (!value || typeof value !== "object") return false;
  const b = value as Bundle;
  return b.status === "READY" && b.test_only === true && hashPattern.test(b.bundle_hash)
    && b.bundle_id === `at-test-${b.bundle_hash}`
    && [b.terms, b.privacy].every(d => d && typeof d.text === "string" && d.text.startsWith("TEST ONLY:")
      && typeof d.version === "string" && d.version.startsWith("TEST_ONLY_") && hashPattern.test(d.sha256));
}
function joinStatusValid(value: unknown, slug: string, branchId: string): value is JoinedStatus | {
  status: "NOT_JOINED"; test_only: true; restaurant_slug: string; restaurant_id: string; branch_id: string;
} {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  if (status.test_only !== true || status.restaurant_slug !== slug || status.branch_id !== branchId
    || typeof status.restaurant_id !== "string") return false;
  if (status.status === "NOT_JOINED") return true;
  return status.status === "JOINED" && typeof status.membership_id === "string"
    && typeof status.request_id === "string" && typeof status.accepted_at === "string"
    && hashPattern.test(String(status.bundle_hash)) && status.bundle_id === `at-test-${status.bundle_hash}`
    && typeof status.legal_version === "string" && hashPattern.test(String(status.legal_sha256))
    && typeof status.privacy_version === "string" && hashPattern.test(String(status.privacy_sha256));
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

function documentPath(slug: string, branchId: string, kind: DocumentKind, bundle: Bundle) {
  const document = bundle[kind];
  const expected = new URLSearchParams({ bundle: bundle.bundle_hash, version: document.version, document: document.sha256 });
  return `/customer/test-only/${encodeURIComponent(slug)}/${encodeURIComponent(branchId)}/document/${kind}?${expected}`;
}

function joinPath(slug: string, branchId: string) {
  return `/customer/test-only/${encodeURIComponent(slug)}/${encodeURIComponent(branchId)}`;
}

// This route has no consent controls. A direct visit always re-reads the
// current server-validated publication instead of trusting navigation state.
export function CustomerTestOnlyDocumentPage() {
  const { slug = "", branchId = "", documentKind = "" } = useParams();
  const [expected] = useSearchParams();
  const { user } = useAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  const kind = documentKind === "terms" || documentKind === "privacy" ? documentKind : null;
  const expectedBundle = expected.get("bundle") ?? "";
  const expectedVersion = expected.get("version") ?? "";
  const expectedDocument = expected.get("document") ?? "";
  const allowed = enabled() && Boolean(user) && kind !== null && hashPattern.test(expectedBundle) && Boolean(expectedVersion) && hashPattern.test(expectedDocument);
  const [view, setView] = useState<{ loading: boolean; bundle: Bundle | null; error: boolean }>({ loading: true, bundle: null, error: false });

  useEffect(() => { heading.current?.focus(); }, [slug, branchId, kind]);
  useEffect(() => {
    let current = true;
    setView({ loading: true, bundle: null, error: false });
    if (!allowed || !supabase) {
      setView({ loading: false, bundle: null, error: false });
      return () => { current = false; };
    }
    void supabase.rpc("get_customer_test_only_merchant_bundle", {
      input_restaurant_slug: slug, input_branch_id: branchId,
    }).then(({ data, error }) => {
      if (!current) return;
      setView({ loading: false, bundle: !error && bundleValid(data) ? data : null, error: Boolean(error) });
    }, () => {
      if (current) setView({ loading: false, bundle: null, error: true });
    });
    return () => { current = false; };
  }, [allowed, slug, branchId, user?.id]);

  if (!allowed) return <main><h1>Testzugang nicht verfügbar</h1></main>;
  const title = kind === "terms" ? "Teilnahmebedingungen" : "Datenschutzhinweise";
  const document = kind && view.bundle && view.bundle.bundle_hash === expectedBundle
    && view.bundle[kind].version === expectedVersion && view.bundle[kind].sha256 === expectedDocument
    ? view.bundle[kind] : null;
  return <main className="test-only-document-page">
    <Link className="test-only-document-back" to={joinPath(slug, branchId)}>Zurück zum Testbeitritt</Link>
    <h1 ref={heading} tabIndex={-1}>{title}</h1>
    <p>Nur synthetischer Test. Keine reale Rechtsfreigabe.</p>
    {view.loading ? <p role="status">Dokument wird geladen …</p> : null}
    {!view.loading && !document ? <p role="alert">{view.error ? "Das Testdokument konnte nicht geladen werden. Bitte gehe zurück und prüfe die Unterlagen erneut." : "Für diesen Testzugang ist keine gültige Fassung verfügbar. Eine Zustimmung ist nicht möglich."}</p> : null}
    {document && view.bundle ? <article aria-label={`${title}, Fassung ${document.version}`}>
      <p>Fassung: {document.version}</p>
      <p>Dokument-Prüfsumme: <code>{document.sha256}</code></p>
      <p>Testbundle: <code>{view.bundle.bundle_id}</code></p>
      <p>Testbundle-Prüfsumme: <code>{view.bundle.bundle_hash}</code></p>
      <div className="test-only-document-text">{document.text}</div>
    </article> : null}
  </main>;
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
  const [view, setView] = useState<{ key: string; bundle: Bundle | null; loading: boolean; error: string | null; joined: JoinedStatus | null }>({ key, bundle: null, loading: true, error: null, joined: null });
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const allowed = enabled() && authenticated;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setTerms(false); setPrivacy(false);
    setView({ key, bundle: null, loading: true, error: null, joined: null });
    if (!allowed || !supabase) { setView({ key, bundle: null, loading: false, error: null, joined: null }); return "ERROR"; }
    try {
      const { data: state, error: stateError } = await supabase.rpc("get_customer_test_only_join_status", {
        input_restaurant_slug: slug, input_branch_id: branchId,
      });
      if (stateError || !joinStatusValid(state, slug, branchId)) throw new Error("Join status unavailable");
      if (current.current !== key || generation.current !== seq) return "ERROR";
      const joined = state.status === "JOINED" ? state : null;
      try {
        const { data, error } = await supabase.rpc("get_customer_test_only_merchant_bundle", { input_restaurant_slug: slug, input_branch_id: branchId });
        if (current.current !== key || generation.current !== seq) return "ERROR";
        setView({ key, bundle: !error && bundleValid(data) ? data : null, loading: false,
          error: error ? "Die aktuellen Testunterlagen konnten nicht geladen werden. Bitte erneut prüfen." : null, joined });
      } catch {
        if (current.current === key && generation.current === seq) setView({ key, bundle: null, loading: false,
          error: "Die aktuellen Testunterlagen konnten nicht geladen werden. Bitte erneut prüfen.", joined });
      }
      return state.status;
    } catch {
      if (current.current === key && generation.current === seq) setView({ key, bundle: null, loading: false,
        error: "Dein Beitrittsstatus konnte nicht sicher geprüft werden. Bitte erneut versuchen.", joined: null });
      return "ERROR";
    }
  }, [allowed, key, slug, branchId]);
  useEffect(() => { current.current = key; void load(); return () => { current.current = ""; generation.current = -1; }; }, [key, load]);
  const bundle = view.key === key ? view.bundle : null;
  const joined = view.key === key ? view.joined : null;
  async function join() {
    if (!allowed || !supabase || !bundle || joined || !terms || !privacy || inFlight.current) return;
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
      const { data: state, error: stateError } = await supabase.rpc("get_customer_test_only_join_status", {
        input_restaurant_slug: slug, input_branch_id: branchId,
      });
      if (stateError || !joinStatusValid(state, slug, branchId) || state.status !== "JOINED"
        || state.request_id !== requestId || state.bundle_id !== bundle.bundle_id
        || state.bundle_hash !== bundle.bundle_hash) throw new Error("Membership unavailable");
      setView({ key, bundle, loading: false, error: null, joined: state });
    } catch {
      if (current.current !== key) return;
      const status = await load();
      if (current.current === key && status === "NOT_JOINED") setView(v => ({ ...v,
        error: "Der Beitritt ist nicht bestätigt. Bitte aktuelle Unterlagen erneut prüfen. Eine geänderte oder zurückgezogene Fassung kann nicht angenommen werden." }));
    } finally { inFlight.current = false; setSaving(false); }
  }
  if (!allowed) return <main><h1>Testzugang nicht verfügbar</h1></main>;
  return <main className="central-auth-page test-only-join-page" style={{ maxWidth: 720, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>TEST_ONLY – Beitritt zum Testbetrieb</h1>
    <p>Nur synthetischer Test. Keine reale Rechtsfreigabe, Punktebuchung oder Versandfreigabe.</p>
    {view.key !== key || view.loading ? <p role="status">Testunterlagen werden geladen …</p> : null}
    {view.key === key && view.error ? <p role="alert">{view.error}</p> : null}
    {joined ? <p role="status">Bereits beigetreten. Der unveränderliche Beleg und deine Mitgliedschaft wurden vom Server gelesen. Bestätigte Fassung: {joined.legal_version}.</p> : null}
    {!view.loading && !bundle && !joined ? <p role="status">Für diesen Testzugang sind keine gültigen Unterlagen verfügbar. Eine Zustimmung ist nicht möglich.</p> : null}
    {!view.loading && !bundle && joined ? <p>Aktuelle Testunterlagen sind nicht verfügbar. Dein bestehender Beitritt bleibt nachgewiesen.</p> : null}
    {bundle ? <>
        {joined && joined.bundle_hash !== bundle.bundle_hash ? <p role="status">Die aktuellen Testunterlagen unterscheiden sich von der beim Beitritt bestätigten Fassung.</p> : null}
        {([['Teilnahmebedingungen', 'terms', bundle.terms], ['Datenschutzhinweise', 'privacy', bundle.privacy]] as const).map(([title, kind, doc]) => <section key={kind}><h2><Link to={documentPath(slug, branchId, kind, bundle)}>{title} vollständig öffnen</Link></h2><p>Fassung: {doc.version}</p><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{doc.text}</pre><details><summary>Prüfsumme anzeigen</summary><code>{doc.sha256}</code></details></section>)}
        {!joined ? <>
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={terms} disabled={saving} onChange={e => setTerms(e.target.checked)} /> Ich akzeptiere die angezeigten Test-Teilnahmebedingungen.</label>
        <label style={{ display: "block", padding: 12 }}><input type="checkbox" checked={privacy} disabled={saving} onChange={e => setPrivacy(e.target.checked)} /> Ich habe die angezeigten Test-Datenschutzhinweise gelesen.</label>
        <button type="button" style={{ minHeight: 44 }} disabled={saving || !terms || !privacy} onClick={() => void join()}>{saving ? "Beitritt wird geprüft …" : "Testbeitritt bestätigen"}</button>
        </> : null}
      </> : null}
    <button type="button" style={{ minHeight: 44, margin: 8 }} disabled={saving} onClick={() => void load()}>{joined ? "Status erneut prüfen" : "Unterlagen erneut prüfen"}</button>
  </main>;
}
