import { FormEvent, useEffect, useRef, useState } from "react";
import {
  readOwnerOperatorChangeStatus,
  submitOwnerOperatorChangeDraft,
  type OperatorBranchAddress,
  type OperatorProfile,
  type OwnerOperatorChangeStatus,
} from "./operatorChangeService";

const profileFields: Array<{ key: keyof OperatorProfile; label: string; required?: boolean; max: number }> = [
  { key: "legal_name", label: "Unternehmensname", required: true, max: 240 },
  { key: "legal_form", label: "Rechtsform", required: true, max: 120 },
  { key: "register_identifier", label: "Firmenbuchnummer", max: 120 },
  { key: "register_court", label: "Firmenbuchgericht", max: 240 },
  { key: "vat_id", label: "Umsatzsteuer-ID", max: 120 },
  { key: "authorized_representative", label: "Vertretungsberechtigte Person", required: true, max: 240 },
  { key: "authorized_representative_role", label: "Funktion der Vertretung", required: true, max: 120 },
  { key: "gisa_number", label: "GISA-Zahl", required: true, max: 120 },
];

const addressFields: Array<{ key: keyof OperatorBranchAddress; label: string; max: number }> = [
  { key: "address", label: "Straße und Hausnummer", max: 240 },
  { key: "postal_code", label: "Postleitzahl", max: 40 },
  { key: "city", label: "Ort", max: 120 },
];

function formFrom(state: OwnerOperatorChangeStatus) {
  const source = state.draft?.material_revision === state.material_revision ? state.draft : null;
  return {
    profile: { ...(source?.profile ?? state.live_profile) },
    branch: { ...(source?.branch_address ?? state.live_branch_address) },
  };
}

export function OwnerActiveOperatorChangePanel({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<OwnerOperatorChangeStatus | null>(null);
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [branch, setBranch] = useState<OperatorBranchAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);

  async function refresh() {
    const next = await readOwnerOperatorChangeStatus(restaurantId);
    const form = formFrom(next);
    setState(next);
    setProfile(form.profile);
    setBranch(form.branch);
    return next;
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setState(null); setEditing(false); requestId.current = null;
    void readOwnerOperatorChangeStatus(restaurantId).then((next) => {
      if (!active) return;
      const form = formFrom(next);
      setState(next); setProfile(form.profile); setBranch(form.branch);
    }).catch(() => { if (active) setError("Der Änderungsstand konnte nicht geladen werden."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restaurantId]);

  function changeProfile(key: keyof OperatorProfile, value: string | boolean) {
    requestId.current = null;
    setProfile((current) => current ? { ...current, [key]: value } : current);
  }

  function changeBranch(key: keyof OperatorBranchAddress, value: string) {
    requestId.current = null;
    setBranch((current) => current ? { ...current, [key]: value } : current);
    if (profile?.registered_address_source === "restaurant") {
      const profileKey = { address: "business_street", postal_code: "business_postal_code", city: "business_city", country: "business_country" }[key] as keyof OperatorProfile;
      changeProfile(profileKey, value);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!state || !profile || !branch || busy.current) return;
    busy.current = true; setSaving(true); setError(""); setMessage("");
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    try {
      const receipt = await submitOwnerOperatorChangeDraft({ status: state, profile, branchAddress: branch, requestId: id });
      const next = await refresh();
      if (next.draft?.id !== receipt.draft_id || next.material_revision !== receipt.material_revision) throw new Error("Readback mismatch");
      requestId.current = null;
      setEditing(false);
      setMessage("Der neue Entwurf ist eingereicht. Die bisherige Fassung bleibt bis zur gesonderten Prüfung und Veröffentlichung wirksam.");
    } catch {
      try {
        const next = await readOwnerOperatorChangeStatus(restaurantId);
        if (next.draft?.request_id === id) {
          await refresh(); requestId.current = null; setEditing(false);
          setMessage("Der eingereichte Entwurf wurde serverseitig bestätigt. Die bisherige Fassung bleibt wirksam.");
        } else setError("Der Entwurf konnte nicht bestätigt werden. Bitte lade den Stand neu, bevor du es erneut versuchst.");
      } catch { setError("Der Ausgang ist unklar. Bitte lade den Stand neu, bevor du es erneut versuchst."); }
    } finally { busy.current = false; setSaving(false); }
  }

  const current = state && state.draft?.material_revision === state.material_revision ? state.draft : null;
  const unchanged = state && profile && branch && JSON.stringify({ profile, branch }) === JSON.stringify(formFrom(state));
  if (loading) return <section className="card" aria-busy="true"><h2>Unternehmensänderung</h2><p>Änderungsstand wird geladen …</p></section>;
  if (!state || !profile || !branch) return <section className="card"><h2>Unternehmensänderung</h2><p role="alert">{error || "Änderungsstand nicht verfügbar."}</p><button className="button secondary" onClick={() => { setLoading(true); void refresh().catch(() => setError("Änderungsstand nicht verfügbar.")).finally(() => setLoading(false)); }} type="button">Erneut versuchen</button></section>;

  return <section className="card owner-operator-change" aria-labelledby="owner-operator-change-title">
    <h2 id="owner-operator-change-title">Unternehmensangaben ändern</h2>
    <p>Die derzeit wirksame Fassung bleibt sichtbar, bis zwei interne Prüfer den neuen Entwurf geprüft haben und er gesondert veröffentlicht wurde.</p>
    <dl><div><dt>Wirksamer Unternehmensname</dt><dd>{state.live_profile.legal_name}</dd></div>
      <div><dt>Wirksame Anschrift</dt><dd>{state.live_profile.business_street}, {state.live_profile.business_postal_code} {state.live_profile.business_city}</dd></div></dl>
    {current ? <p role="status">Entwurf für Prüffassung {current.material_revision} eingereicht. Er ist noch nicht wirksam.</p> : null}
    {!editing ? <button className="button secondary" onClick={() => { setEditing(true); setError(""); setMessage(""); }} type="button">{current ? "Entwurf ändern" : "Neue Fassung vorbereiten"}</button> : null}
    {editing ? <form onSubmit={(event) => void submit(event)}>
      <h3>Neue Fassung</h3>
      <div className="owner-legal-grid">{profileFields.map((field) => <label className="field" key={field.key}>{field.label}
        <input className="input" maxLength={field.max} onChange={(event) => changeProfile(field.key, event.target.value)} required={field.required} value={String(profile[field.key] ?? "")} />
      </label>)}</div>
      <label><input checked={profile.owner_is_authorized_representative} onChange={(event) => changeProfile("owner_is_authorized_representative", event.target.checked)} type="checkbox" /> Ich bin diese vertretungsberechtigte Person.</label>
      <label><input checked={profile.commercial_register_applicable} onChange={(event) => changeProfile("commercial_register_applicable", event.target.checked)} type="checkbox" /> Firmenbucheintrag ist erforderlich.</label>
      <h3>Standort</h3><p>Falls der bisherige Standort keine eigene Anschrift enthält, bleiben leere Felder unverändert. Bei einer neuen Standortanschrift müssen alle Angaben vollständig sein.</p>
      <div className="owner-legal-grid">{addressFields.map((field) => <label className="field" key={field.key}>{field.label}
        <input className="input" maxLength={field.max} onChange={(event) => changeBranch(field.key, event.target.value)} value={branch[field.key] ?? ""} />
      </label>)}</div>
      <label>Geschäftsanschrift
        <select className="input" onChange={(event) => {
          const source = event.target.value as OperatorProfile["registered_address_source"];
          setProfile((value) => value ? { ...value, registered_address_source: source,
            ...(source === "restaurant" ? { business_street: branch.address, business_postal_code: branch.postal_code,
              business_city: branch.city, business_country: branch.country } : {}) } : value);
          requestId.current = null;
        }} value={profile.registered_address_source}><option value="restaurant">Wie Standort</option><option value="separate">Eigene Geschäftsanschrift</option></select>
      </label>
      {profile.registered_address_source === "separate" ? <div className="owner-legal-grid">{addressFields.map((field) => {
        const key = { address: "business_street", postal_code: "business_postal_code", city: "business_city", country: "business_country" }[field.key] as keyof OperatorProfile;
        return <label className="field" key={key}>Geschäftsanschrift: {field.label}<input className="input" maxLength={field.max} onChange={(event) => changeProfile(key, event.target.value)} required value={String(profile[key] ?? "")} /></label>;
      })}</div> : null}
      <p>Einreichung ist keine Freigabe. Auch nach einer Änderung bleibt die bisher veröffentlichte Fassung zunächst wirksam.</p>
      <div className="owner-legal-form-actions"><button className="button secondary" onClick={() => { setEditing(false); const form = formFrom(state); setProfile(form.profile); setBranch(form.branch); requestId.current = null; }} type="button">Abbrechen</button>
        <button className="button" disabled={saving || Boolean(unchanged)} type="submit">{saving ? "Entwurf wird eingereicht …" : "Entwurf zur Prüfung einreichen"}</button></div>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
