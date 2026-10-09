import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { safeCustomerReturnPath } from "./customerReturnPath.mjs";
import { AppShell, CustomerLanguageAction, PremiumCard, PrimaryButton, SecondaryButton } from "./components/PremiumCustomerUi";
import "./central-customer.css";

type TermsDocument = {
  document_id: string;
  version: string;
  sha256: string;
  language: string;
  provider_snapshot: string;
  body_markdown: string;
  test_only: boolean;
};

type TermsStatus = {
  test_context_available?: boolean;
  status: "UNAVAILABLE" | "ACCEPTANCE_REQUIRED" | "ACCEPTED";
  account_exists: boolean;
  next_step: string;
  document?: TermsDocument;
  receipt?: { id: string; request_id: string; document_id: string } | null;
};

type TermsReceiptReadback = {
  found: boolean;
  request_id?: string;
  document_id?: string;
  sha256?: string;
};

export function CustomerPlatformTermsPage() {
  const { loading: authLoading, portalAccess, retryAuthorization, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const testScope = searchParams.get("scope") === "tenant_test";
  const statusRpc = testScope ? "get_platform_customer_test_terms_status" : "get_platform_customer_terms_status";
  const returnTo = safeCustomerReturnPath(searchParams.get("returnTo"));
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const loadRevisionRef = useRef(0);
  const documentIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const revision = ++loadRevisionRef.current;
    setState("loading");
    setError(null);
    const { data, error: readError } = await supabase.rpc(statusRpc);
    if (revision !== loadRevisionRef.current) return;
    if (readError) {
      setState("error");
      setError("Der Rechtsstatus konnte gerade nicht geprüft werden. Bitte versuche es erneut.");
      return;
    }
    const nextStatus = data as TermsStatus;
    const nextDocumentId = nextStatus.document?.document_id ?? null;
    if (documentIdRef.current !== nextDocumentId) {
      documentIdRef.current = nextDocumentId;
      requestRef.current = null;
      setAccepted(false);
    }
    setStatus(nextStatus);
    setState("ready");
  }, [statusRpc, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    requestRef.current = null;
    documentIdRef.current = null;
    setAccepted(false);
    void load();
    return () => { loadRevisionRef.current += 1; };
  }, [authLoading, load, user]);

  if (authLoading) return <AppShell className="central-auth-shell"><p role="status">Konto wird geprüft …</p></AppShell>;
  if (!user) return <Navigate replace to={`/customer/login?returnTo=${encodeURIComponent(returnTo)}`} />;

  async function continueToAccount() {
    if (!supabase) return;
    setSaving(true);
    setError(null);
    try {
      const { error: accountError } = await supabase.rpc("ensure_authenticated_customer_account");
      if (accountError) {
        if (accountError.message.includes("CUSTOMER_PROFILE_INCOMPLETE") || accountError.message.includes("CUSTOMER_PROFILE_PHONE_INVALID")) {
          navigate(`/customer/register?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }
        throw accountError;
      }
      retryAuthorization();
      window.location.assign(returnTo);
    } catch {
      setError("Das Konto konnte noch nicht geöffnet werden. Bitte versuche es erneut.");
    } finally {
      setSaving(false);
    }
  }

  async function acceptTerms() {
    if (!supabase || !accepted || !status?.document || saving) return;
    setSaving(true);
    setError(null);
    const requestId = requestRef.current ?? crypto.randomUUID();
    requestRef.current = requestId;
    const document = status.document;
    const revision = loadRevisionRef.current;
    try {
      const { error: writeError } = await supabase.rpc("accept_platform_customer_terms", {
        input_document_id: document.document_id,
        input_sha256: document.sha256,
        input_language: document.language,
        input_source: status.account_exists ? "existing_account" : "customer_registration",
        input_request_id: requestId,
      });
      if (writeError) throw writeError;
      if (loadRevisionRef.current !== revision) return;
      await load();
      retryAuthorization();
    } catch {
      // A lost transport response is not evidence that the write failed.
      try {
        const { data: receiptData, error: receiptError } = await supabase.rpc("get_platform_customer_terms_receipt", {
          input_request_id: requestId,
        });
        if (receiptError) throw receiptError;
        const receipt = receiptData as TermsReceiptReadback | null;
        const { data: statusData, error: statusError } = await supabase.rpc(statusRpc);
        if (statusError) throw statusError;
        if (loadRevisionRef.current !== revision) return;
        const authoritative = statusData as TermsStatus;
        const nextDocumentId = authoritative.document?.document_id ?? null;
        if (documentIdRef.current !== nextDocumentId) {
          documentIdRef.current = nextDocumentId;
          requestRef.current = null;
          setAccepted(false);
        }
        setStatus(authoritative);
        setState("ready");
        if (receipt?.found && receipt.request_id === requestId
          && receipt.document_id === document.document_id && receipt.sha256 === document.sha256
          && authoritative.status === "ACCEPTED" && nextDocumentId === document.document_id) {
          retryAuthorization();
        } else if (nextDocumentId !== document.document_id) {
          setError("Eine neue Fassung liegt vor. Bitte lies sie und stimme erneut zu.");
        } else {
          setError("Die Zustimmung konnte nicht sicher bestätigt werden. Prüfe den Status und versuche es erneut.");
        }
      } catch {
        if (loadRevisionRef.current === revision) {
          setError("Die Zustimmung konnte nicht sicher bestätigt werden. Prüfe den Status und versuche es erneut.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell className="central-auth-shell">
      <div className="central-auth-page">
        <PremiumCard className="central-auth-card">
          <div className="central-card-header-actions"><CustomerLanguageAction /></div>
          <h1>Plattformbedingungen für dein Kundenkonto</h1>
          {testScope ? <p role="status">Tenantgebundener TEST_ONLY-Zugang – keine allgemeine Plattform-Zustimmung.</p> : null}
          {state === "ready" && (testScope || status?.test_context_available) ? (
            <SecondaryButton disabled={saving} type="button" onClick={() => {
              loadRevisionRef.current += 1;
              setState("loading");
              setStatus(null);
              setAccepted(false);
              setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                if (testScope) next.delete("scope"); else next.set("scope", "tenant_test");
                return next;
              });
            }}>{testScope ? "Allgemeine Plattformfassung ansehen" : "Gesonderten tenantgebundenen Testzugang ansehen"}</SecondaryButton>
          ) : null}
          {state === "loading" ? <p role="status">Rechtsstatus wird geprüft …</p> : null}
          {state === "error" ? <SecondaryButton onClick={() => void load()} type="button">Erneut prüfen</SecondaryButton> : null}
          {state === "ready" && status?.status === "UNAVAILABLE" ? (
            <p role="status">Für das Plattformkonto liegt noch keine freigegebene Fassung vor. {status.account_exists ? "Dein bestehendes Konto bleibt erhalten; du musst erst einer künftigen Fassung ausdrücklich zustimmen." : "Die Registrierung kann noch nicht abgeschlossen werden."}</p>
          ) : null}
          {state === "ready" && status?.status === "ACCEPTANCE_REQUIRED" && status.document ? (
            <>
              {status.document.test_only ? <p role="status">Nur für einen gesondert gekennzeichneten Testzugang. Keine reale Rechtsfreigabe.</p> : null}
              <p data-i18n-skip="true">{status.document.provider_snapshot}</p>
              <p>Fassung <span data-i18n-skip="true">{status.document.version}</span> · Sprache <span data-i18n-skip="true">{status.document.language}</span></p>
              <p data-i18n-skip="true" style={{ overflowWrap: "anywhere" }}>SHA-256: {status.document.sha256}</p>
              <article data-i18n-skip="true" className="central-auth-legal-document" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{status.document.body_markdown}</article>
              <p><Link to="/platform/legal/platform_privacy">Datenschutzinformation ansehen</Link></p>
              <label className="central-auth-legal-choice">
                <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
                Ich habe diese Fassung gelesen und stimme den Plattformbedingungen ausdrücklich zu.
              </label>
              <p>Diese Entscheidung umfasst keine Werbung. Marketingentscheidungen für die Plattform und einzelne Restaurants bleiben getrennt und freiwillig.</p>
              <PrimaryButton disabled={!accepted || saving} onClick={() => void acceptTerms()} type="button">
                {saving ? "Zustimmung wird geprüft …" : "Verbindlich zustimmen"}
              </PrimaryButton>
            </>
          ) : null}
          {state === "ready" && status?.status === "ACCEPTED" ? (
            <>
              <p role="status">Deine Zustimmung zu dieser Fassung ist gespeichert. Frühere Zustimmungen bleiben unverändert.</p>
              <PrimaryButton disabled={saving} onClick={() => void continueToAccount()} type="button">
                {saving ? "Konto wird geöffnet …" : "Zum Kundenkonto"}
              </PrimaryButton>
            </>
          ) : null}
          {error ? <p className="central-status-message error" role="alert">{error}</p> : null}
          {state !== "loading" ? <SecondaryButton disabled={saving} onClick={() => void load()} type="button">Status erneut prüfen</SecondaryButton> : null}
          <p><Link to="/platform/legal/platform_terms">Plattformbedingungen</Link> · <Link to="/platform/legal/platform_privacy">Datenschutz</Link></p>
          {portalAccess.platform_terms_status === "ACCEPTED" && !portalAccess.customer_access ? <p>Deine Kontoangaben müssen möglicherweise noch ergänzt werden.</p> : null}
        </PremiumCard>
      </div>
    </AppShell>
  );
}
