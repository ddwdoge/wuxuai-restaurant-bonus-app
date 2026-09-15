import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock3, History, LockKeyhole, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useI18n } from "../../shared/i18n/I18nProvider";
import {
  loadProCommercialAudit, loadProCountryStatus, loadProEntitlements, loadProTestOnlyBusinesses,
  searchProRealBusinesses, setProAccess, setProCountryRelease,
  type ProBusiness, type ProCommercialAudit, type ProCountryStatus, type ProEntitlement, type ProGrantState,
} from "./platformAdminService";
import { proControlCenterMessages } from "./proControlCenterI18n";

type DrawerState =
  | { kind: "country"; country: ProCountryStatus; release: boolean }
  | { kind: "access"; business: ProBusiness; accessKind: "REAL_BUSINESS_PILOT" | "INTERNAL_TEST_ONLY"; action: "GRANT" | "EXTEND" | "REVOKE" };

const states: Array<"" | ProGrantState> = ["", "active", "scheduled", "expired", "revoked"];
function dateInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function addDays(value: string, days: number) { const date = value ? new Date(value) : new Date(); date.setDate(date.getDate() + days); return dateInput(date); }
function formatted(value: string | null | undefined, language: string) {
  if (!value) return "–";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function locationSummary(business: ProBusiness) {
  return business.locations?.map((location) => [location.name, location.city, location.country_code].filter(Boolean).join(" · ")).join(", ") || "–";
}

export function PlatformProControlCenter() {
  const { language } = useI18n();
  const t = proControlCenterMessages(language);
  const [countries, setCountries] = useState<ProCountryStatus[]>([]);
  const [grants, setGrants] = useState<ProEntitlement[]>([]);
  const [realBusinesses, setRealBusinesses] = useState<ProBusiness[]>([]);
  const [testBusinesses, setTestBusinesses] = useState<ProBusiness[]>([]);
  const [audit, setAudit] = useState<ProCommercialAudit[]>([]);
  const [stateFilter, setStateFilter] = useState<"" | ProGrantState>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [startsAt, setStartsAt] = useState(() => dateInput(new Date()));
  const [expiresAt, setExpiresAt] = useState(() => addDays(dateInput(new Date()), 30));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const requestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [countryData, grantData, realData, testData, auditData] = await Promise.all([
        loadProCountryStatus(), loadProEntitlements({ state: stateFilter, limit: 100 }),
        searchProRealBusinesses(search), loadProTestOnlyBusinesses(search), loadProCommercialAudit(),
      ]);
      setCountries(countryData.items); setGrants(grantData.items); setRealBusinesses(realData.items);
      setTestBusinesses(testData.items); setAudit(auditData.items);
    } catch (caught) {
      console.error("Pro control center read failed", caught);
      setError(t.loadError);
    } finally { setLoading(false); }
  }, [search, stateFilter, t.loadError]);

  useEffect(() => { void load(); }, [load]);
  const at = countries.find((country) => country.country_code === "AT");
  const exactConfirmation = useMemo(() => {
    if (!drawer) return "";
    if (drawer.kind === "country") return `PRO ${drawer.country.country_code} ${drawer.release ? "FREIGEBEN" : "SPERREN"}`;
    const kind = drawer.accessKind === "REAL_BUSINESS_PILOT" ? "PILOT" : "TEST_ONLY";
    const action = drawer.action === "GRANT" ? "FREIGEBEN" : drawer.action === "EXTEND" ? "VERLAENGERN" : "WIDERRUFEN";
    return `PRO ${kind} ${drawer.business.business_name} ${action}`;
  }, [drawer]);
  const valid = reason.trim().length >= 10 && confirmation === exactConfirmation
    && (drawer?.kind !== "access" || drawer.action === "REVOKE" || (Boolean(startsAt) && Boolean(expiresAt) && new Date(expiresAt) > new Date(startsAt)));

  function openDrawer(next: DrawerState) {
    const start = dateInput(new Date());
    setDrawer(next); setReason(""); setConfirmation(""); setStartsAt(start); setExpiresAt(addDays(start, 30));
    setFormError(""); requestId.current = crypto.randomUUID();
  }
  function closeDrawer() {
    if (saving) return;
    setDrawer(null); setReason(""); setConfirmation(""); setFormError(""); requestId.current = null;
  }
  async function submit() {
    if (!drawer || !valid || saving || !requestId.current) { setFormError(t.validation); return; }
    setSaving(true); setFormError("");
    try {
      if (drawer.kind === "country") {
        await setProCountryRelease({ country: drawer.country.country_code, release: drawer.release, reason: reason.trim(), confirmation, requestId: requestId.current });
      } else {
        await setProAccess({ restaurantId: drawer.business.restaurant_id, accessKind: drawer.accessKind, action: drawer.action,
          startsAt: drawer.action === "GRANT" ? new Date(startsAt).toISOString() : null,
          expiresAt: drawer.action === "REVOKE" ? null : new Date(expiresAt).toISOString(), reason: reason.trim(), confirmation, requestId: requestId.current });
      }
      setDrawer(null); setReason(""); setConfirmation(""); requestId.current = null; await load();
    } catch (caught) {
      const message = String((caught as { message?: string })?.message ?? "");
      if (/RECENT|JWT|AUTH/i.test(message)) setFormError(t.recentError);
      else if (/CONFLICT|UNCHANGED|ALREADY/i.test(message)) { setFormError(t.conflict); await load(); }
      else setFormError(t.saveError);
    } finally { setSaving(false); }
  }

  return <div className="pro-control-center" data-testid="pro-control-center">
    <section aria-live="polite" className={`pro-at-lock ${at?.release_state === "LOCKED" ? "locked" : "released"}`}>
      <LockKeyhole aria-hidden="true" size={28} /><div><strong>AT · {at?.release_state === "LOCKED" ? t.locked : t.released}</strong><span>{t.releaseImpact}</span></div>
    </section>
    <div className="pro-toolbar"><label><Search aria-hidden="true" size={18}/><span className="sr-only">{t.businessSearch}</span><input aria-label={t.businessSearch} onChange={(event) => setSearch(event.target.value)} placeholder={t.businessSearch} type="search" value={search}/></label><button className="button secondary" disabled={loading} onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={18}/>{t.refresh}</button></div>
    {loading ? <div className="pro-loading" role="status"><span/><span/><span/><p>{t.loading}</p></div> : null}
    {error ? <div className="platform-control-error" role="alert"><AlertTriangle aria-hidden="true"/><div><h2>{t.loadError}</h2><button className="button secondary" onClick={() => void load()} type="button">{t.retry}</button></div></div> : null}
    {!loading && !error ? <>
      <section aria-labelledby="pro-countries-title" className="card pro-section"><header><div><h2 id="pro-countries-title">{t.countries}</h2><p>{t.description}</p></div></header><div className="pro-country-grid">{countries.map((country) => <article key={country.country_code} className={country.release_state === "LOCKED" ? "locked" : "released"}><header><strong>{country.country_code}</strong><span className="pill">{country.release_state === "LOCKED" ? t.locked : t.released}</span></header><dl><div><dt>{t.entitlements}</dt><dd>{country.active_entitlement_count}</dd></div><div><dt>{t.paid} / {t.trial}</dt><dd>{country.active_paid_count} / {country.active_trial_count}</dd></div><div><dt>{t.pilot} / TEST_ONLY</dt><dd>{country.active_pilot_count} / {country.active_test_only_count}</dd></div><div><dt>{t.lastChange}</dt><dd>{formatted(country.last_changed_at, language)}</dd></div><div><dt>{t.actor}</dt><dd>{country.last_actor_role ?? "–"}</dd></div><div><dt>{t.reason}</dt><dd>{country.last_reason ?? t.noReason}</dd></div></dl><button className="button secondary" onClick={() => openDrawer({kind:"country",country,release:country.release_state === "LOCKED"})} type="button">{t.change}</button></article>)}</div></section>

      <section aria-labelledby="pro-real-title" className="card pro-section"><header><div><h2 id="pro-real-title">{t.realBusinesses}</h2><p>{t.pilotImpact}</p></div></header>{realBusinesses.length ? <div className="pro-business-list">{realBusinesses.map((business) => <article key={business.restaurant_id}><div><strong>{business.business_name}</strong><span>{business.country_code} · {locationSummary(business)}</span><span>{t.storedPlan}: {business.stored_plan ?? "BASIC"} · {t.effectivePlan}: {business.effective_plan}</span></div><button className="button secondary" disabled={business.country_release_state !== "RELEASED"} onClick={() => openDrawer({kind:"access",business,accessKind:"REAL_BUSINESS_PILOT",action:"GRANT"})} type="button">{t.createPilot}</button></article>)}</div> : <p className="empty-state-card">{t.noBusinesses}</p>}</section>

      <section aria-labelledby="pro-test-title" className="card pro-section"><header><div><h2 id="pro-test-title">{t.testOnlyTitle}</h2><p>TEST_ONLY</p></div></header>{testBusinesses.length ? <div className="pro-business-list">{testBusinesses.map((business) => <article key={business.restaurant_id}><div><strong>{business.business_name}</strong><span>{business.country_code} · {locationSummary(business)}</span><span>{t.effectivePlan}: {business.effective_plan}</span></div><button className="button secondary" onClick={() => openDrawer({kind:"access",business,accessKind:"INTERNAL_TEST_ONLY",action:"GRANT"})} type="button">{t.grant}</button></article>)}</div> : <div className="empty-state-card" role="status"><ShieldCheck aria-hidden="true" size={30}/><h3>{t.noTestOnly}</h3></div>}</section>

      <section aria-labelledby="pro-grants-title" className="card pro-section"><header><div><h2 id="pro-grants-title">{t.grants}</h2><p>{grants.length} · {t.entitlements}</p></div><div className="pro-state-filters" aria-label={t.grants}>{states.map((state) => <button aria-pressed={stateFilter === state} className={stateFilter === state ? "active" : ""} key={state || "all"} onClick={() => setStateFilter(state)} type="button">{t[state || "all"]}</button>)}</div></header>{grants.length ? <div className="pro-table-wrap"><table><thead><tr><th>{t.realBusinesses}</th><th>{t.entitlements}</th><th>{t.start}</th><th>{t.end}</th><th>{t.effectivePlan}</th></tr></thead><tbody>{grants.map((grant) => <tr key={`${grant.grant_type}-${grant.grant_id}`}><td><strong>{grant.business_name}</strong><small>{grant.country_code}</small></td><td>{t[grant.grant_type]} · {t[grant.grant_state]}</td><td>{formatted(grant.starts_at, language)}</td><td>{formatted(grant.expires_at, language)}</td><td>{grant.effective_plan}</td></tr>)}</tbody></table></div> : <p className="empty-state-card">{t.noGrants}</p>}</section>

      <section aria-labelledby="pro-audit-title" className="card pro-section"><header><div><h2 id="pro-audit-title">{t.audit}</h2><p>{t.lastChange}</p></div></header>{audit.length ? <div className="pro-audit-list">{audit.map((entry) => <article key={entry.id}><History aria-hidden="true" size={18}/><div><strong>{entry.action}</strong><span>{entry.country_code ?? "–"} · {formatted(entry.created_at, language)} · {entry.actor_role}</span><span>{entry.reason} · {t.result}: {entry.result}</span></div></article>)}</div> : <p className="empty-state-card">{t.noAudit}</p>}</section>
    </> : null}

    <AppDrawer closeLabel={t.cancel} description={t.recentAuth} dismissOnOverlay={!saving} onClose={closeDrawer} open={Boolean(drawer)} size="standard" title={drawer?.kind === "country" ? t.countryDrawer : drawer?.accessKind === "INTERNAL_TEST_ONLY" ? t.testDrawer : t.pilotDrawer} footer={<><button className="button secondary" disabled={saving} onClick={closeDrawer} type="button">{t.cancel}</button><button className="button primary" disabled={!valid || saving} onClick={() => void submit()} type="button">{t.submit}</button></>}>
      {drawer ? <form className="pro-action-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><div className="pro-impact"><AlertTriangle aria-hidden="true"/><div><strong>{t.impact}</strong><p>{drawer.kind === "country" ? (drawer.release ? t.releaseImpact : t.lockImpact) : t.pilotImpact}</p></div></div><div className="pro-recent-auth"><Clock3 aria-hidden="true" size={19}/><p>{t.recentAuth}</p></div>{drawer.kind === "access" && drawer.action !== "REVOKE" ? <><fieldset><legend>{t.duration}</legend>{[30,60,90].map((days) => <button className="button secondary" key={days} onClick={() => setExpiresAt(addDays(startsAt, days))} type="button">{t[`days${days}`]}</button>)}</fieldset><div className="grid two"><label>{t.start}<input className="input" onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt}/></label><label>{t.end}<input className="input" onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" value={expiresAt}/></label></div></> : null}<label>{t.reason}<textarea autoFocus className="input" minLength={10} onChange={(event) => setReason(event.target.value)} placeholder={t.enterReason} required rows={4} value={reason}/></label><label>{t.confirmation}<input autoComplete="off" className="input" onChange={(event) => setConfirmation(event.target.value)} required spellCheck={false} value={confirmation}/></label><code className="pro-confirmation">{exactConfirmation}</code>{formError ? <p className="status-message error" role="alert">{formError}</p> : null}</form> : null}
    </AppDrawer>
  </div>;
}
