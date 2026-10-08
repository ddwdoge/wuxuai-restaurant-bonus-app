import { useEffect, useRef, useState } from "react";
import {
  decidePlatformOperatorReview,
  publishReviewedOperatorChange,
  readPlatformOperatorReview,
  type OperatorProfile,
  type PlatformOperatorReview,
} from "./operatorChangeService";

type Step = "FIRST_REVIEW" | "APPROVE" | "PUBLISH" | "WAIT_SECOND" | "PUBLISHED" | "NO_DRAFT" | "STALE";

function stepFor(state: PlatformOperatorReview): Step {
  const { kyb, publication } = state;
  const draft = kyb.snapshot.owner_draft;
  if (!draft) return "NO_DRAFT";
  if (publication?.draft_id === draft.id) return "PUBLISHED";
  if (kyb.draft_revision !== kyb.revision) return "STALE";
  if (kyb.current && kyb.action === "APPROVE" && kyb.review_hash === kyb.hash) return "PUBLISH";
  if (kyb.action === "FIRST_REVIEW" && kyb.review_hash === kyb.hash && kyb.review_revision === kyb.revision) {
    return kyb.same_reviewer ? "WAIT_SECOND" : "APPROVE";
  }
  return "FIRST_REVIEW";
}

const stepLabel: Record<Step, string> = {
  FIRST_REVIEW: "Erste Prüfung bestätigen",
  APPROVE: "Zweite Prüfung bestätigen",
  PUBLISH: "Geprüfte Fassung veröffentlichen",
  WAIT_SECOND: "Eine andere berechtigte Person muss die zweite Prüfung bestätigen.",
  PUBLISHED: "Diese Fassung ist bereits veröffentlicht.",
  NO_DRAFT: "Es liegt kein neuer Betreiberentwurf vor.",
  STALE: "Die Prüffassung ist durch eine weitere materielle Änderung veraltet.",
};

const materialFields: Array<{ key: keyof OperatorProfile; label: string }> = [
  { key: "legal_name", label: "Unternehmensname" },
  { key: "legal_form", label: "Rechtsform" },
  { key: "register_identifier", label: "Firmenbuchnummer" },
  { key: "register_court", label: "Firmenbuchgericht" },
  { key: "vat_id", label: "Umsatzsteuer-ID" },
  { key: "registered_address_source", label: "Quelle der Geschäftsanschrift" },
  { key: "business_street", label: "Geschäftsanschrift – Straße" },
  { key: "business_postal_code", label: "Geschäftsanschrift – PLZ" },
  { key: "business_city", label: "Geschäftsanschrift – Ort" },
  { key: "business_country", label: "Geschäftsanschrift – Land" },
  { key: "authorized_representative", label: "Vertretungsberechtigte Person" },
  { key: "authorized_representative_role", label: "Funktion der Vertretung" },
  { key: "owner_is_authorized_representative", label: "Owner ist vertretungsberechtigt" },
  { key: "commercial_register_applicable", label: "Firmenbucheintrag erforderlich" },
  { key: "gisa_number", label: "GISA-Zahl" },
];

function fieldValue(value: string | boolean | null) {
  return typeof value === "boolean" ? (value ? "Ja" : "Nein") : (value || "Nicht angegeben");
}

export function PlatformOperatorChangePanel({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<PlatformOperatorReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [expiries, setExpiries] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);
  const requestId = useRef<string | null>(null);

  async function read() {
    const next = await readPlatformOperatorReview(restaurantId);
    setState(next);
    setExpiries(Object.fromEntries(next.kyb.snapshot.documents.map((document) => [
      document.id, next.kyb.document_expiries[document.id] ?? null,
    ])));
    return next;
  }

  useEffect(() => {
    let active = true;
    setState(null); setLoading(true); setError(""); setMessage(""); setConfirmation(""); requestId.current = null;
    void readPlatformOperatorReview(restaurantId).then((next) => {
      if (!active) return;
      setState(next);
      setExpiries(Object.fromEntries(next.kyb.snapshot.documents.map((document) => [document.id, next.kyb.document_expiries[document.id] ?? null])));
    }).catch(() => { if (active) setError("Der geschützte Prüfstand konnte nicht geladen werden. Bitte den aktuellen Authenticator-Nachweis prüfen."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restaurantId]);

  async function submit() {
    if (!state || busyLock.current) return;
    const step = stepFor(state);
    if (!["FIRST_REVIEW", "APPROVE", "PUBLISH"].includes(step)) return;
    const phrase = `${step === "PUBLISH" ? "PUBLISH KYB" : `KYB ${step}`} ${state.restaurant_name}`;
    if (confirmation !== phrase || (step !== "PUBLISH" && !/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(reference))) return;
    busyLock.current = true; setBusy(true); setError(""); setMessage("");
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    try {
      const fresh = await readPlatformOperatorReview(restaurantId);
      if (fresh.kyb.hash !== state.kyb.hash || fresh.kyb.revision !== state.kyb.revision
        || fresh.kyb.previous_id !== state.kyb.previous_id || stepFor(fresh) !== step) {
        setState(fresh);
        throw new Error("STALE");
      }
      if (step === "PUBLISH") await publishReviewedOperatorChange({ state: fresh, confirmation, requestId: id });
      else await decidePlatformOperatorReview({ state: fresh, action: step as "FIRST_REVIEW" | "APPROVE",
        reference, documentExpiries: expiries, confirmation, requestId: id });
      const after = await read();
      if (step === "PUBLISH" ? after.publication?.request_id !== id : after.kyb.review_request_id !== id) {
        throw new Error("READBACK_MISMATCH");
      }
      requestId.current = null; setConfirmation(""); setReference("");
      setMessage(step === "PUBLISH" ? "Die geprüfte Fassung wurde gesondert veröffentlicht. Der Beleg ist serverseitig bestätigt."
        : "Die Entscheidung wurde mit der aktuellen Prüffassung und ihrem Beleg serverseitig bestätigt.");
    } catch {
      try {
        const after = await read();
        if (step === "PUBLISH" ? after.publication?.request_id === id : after.kyb.review_request_id === id) {
          requestId.current = null; setConfirmation("");
          setMessage("Die Aktion wurde serverseitig bestätigt. Bitte nicht erneut auslösen.");
        } else setError("Die Aktion wurde nicht bestätigt oder der Prüfstand hat sich geändert. Bitte den neuen Stand und den Authenticator-Nachweis prüfen.");
      } catch { setError("Der Ausgang ist unklar. Bitte den Prüfstand neu laden; keinen zweiten Auftrag auslösen."); }
    } finally { busyLock.current = false; setBusy(false); }
  }

  if (loading) return <section className="card" aria-busy="true"><h3>Materielle Unternehmensänderung</h3><p>Prüfstand wird geladen …</p></section>;
  if (!state) return <section className="card"><h3>Materielle Unternehmensänderung</h3><p role="alert">{error}</p><button className="button secondary" onClick={() => { setLoading(true); void read().catch(() => setError("Prüfstand nicht verfügbar.")).finally(() => setLoading(false)); }} type="button">Erneut laden</button></section>;
  const step = stepFor(state);
  const { snapshot } = state.kyb;
  const phrase = `${step === "PUBLISH" ? "PUBLISH KYB" : `KYB ${step}`} ${state.restaurant_name}`;
  const actionAllowed = ["FIRST_REVIEW", "APPROVE", "PUBLISH"].includes(step);
  return <section className="card platform-operator-change" aria-labelledby="platform-operator-change-title">
    <h3 id="platform-operator-change-title">Materielle Unternehmensänderung</h3>
    <p>{state.restaurant_name} · Prüffassung {state.kyb.revision} · {stepLabel[step]}</p>
    {snapshot.owner_draft ? <div className="platform-operator-comparison">
      <div><h4>Neuer Entwurf – noch nicht wirksam</h4><dl>{materialFields.map(({ key, label }) =>
        <div key={key}><dt>{label}</dt><dd>{fieldValue(snapshot.operator[key])}</dd></div>)}</dl>
        <h4>Primärfiliale</h4><dl>{Object.entries(snapshot.owner_draft.branch_address).map(([key, value]) =>
          <div key={key}><dt>{({ address: "Straße", postal_code: "PLZ", city: "Ort", country: "Land" } as Record<string, string>)[key] ?? key}</dt>
            <dd>{value || "Nicht angegeben"}</dd></div>)}</dl></div>
      <div><h4>Prüfbindung</h4><p>Revision {state.kyb.revision}</p><p>Prüfsumme: <code>{state.kyb.hash}</code></p>
        <p>Erste Prüfung: {state.kyb.action === "FIRST_REVIEW" && state.kyb.review_hash === state.kyb.hash ? "für diese Fassung vorhanden" : "nicht aktuell"}</p>
        <p>Zweite Prüfung: {state.kyb.current ? "für diese Fassung vorhanden" : "nicht aktuell"}</p></div>
    </div> : null}
    {snapshot.documents.length ? <details><summary>Referenzierte Nachweise ({snapshot.documents.length})</summary><ul>{snapshot.documents.map((document) => <li key={document.id}>
      {document.type} · Fassung {document.version} · SHA-256 <code>{document.sha256}</code>
      {step === "FIRST_REVIEW" ? <label>Dokumentablauf, falls tatsächlich angegeben
        <input className="input" onChange={(event) => { requestId.current = null; setExpiries((old) => ({ ...old, [document.id]: event.target.value ? new Date(event.target.value).toISOString() : null })); }} type="datetime-local" />
      </label> : null}
      {step !== "FIRST_REVIEW" && state.kyb.document_expiries[document.id] ? <span> · Ablauf: {new Date(state.kyb.document_expiries[document.id]!).toLocaleString("de-AT")}</span> : null}
    </li>)}</ul></details> : null}
    {actionAllowed ? <div className="platform-operator-action">
      <p>{step === "PUBLISH" ? "Die Veröffentlichung ist eine eigene Aktion nach beiden Prüfungen. Eine neue externe Legal-Freigabe wird dadurch nicht behauptet."
        : "Nur nach eigener Prüfung der konkreten Fassung und Nachweise bestätigen. Der serverseitige aktuelle Authenticator-Nachweis ist erforderlich."}</p>
      {step !== "PUBLISH" ? <label>Interne Prüfungsreferenz
        <input className="input" maxLength={80} onChange={(event) => { requestId.current = null; setReference(event.target.value.toUpperCase()); }} value={reference} />
      </label> : null}
      <label>Zur Bestätigung exakt eingeben: <code>{phrase}</code>
        <input className="input" onChange={(event) => { requestId.current = null; setConfirmation(event.target.value); }} value={confirmation} />
      </label>
      <button className="button" disabled={busy || confirmation !== phrase || (step !== "PUBLISH" && !/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(reference))} onClick={() => void submit()} type="button">{busy ? "Prüfung läuft …" : stepLabel[step]}</button>
    </div> : null}
    <button className="button secondary" disabled={busy} onClick={() => { void read().catch(() => setError("Prüfstand konnte nicht aktualisiert werden.")); }} type="button">Prüfstand aktualisieren</button>
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
