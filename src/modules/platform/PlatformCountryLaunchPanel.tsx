import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, Settings2, RefreshCw } from "lucide-react";
import { supabase } from "../../shared/lib/supabase";
import { countryNameForCode } from "../../shared/countries.mjs";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { canActivateCountry, COUNTRY_READINESS_KEYS, countryReadinessStatus, type CountryReadiness } from "./countryLaunchReadiness.mjs";

type Country = { country_code: string; enabled: boolean; revision: number; updated_at: string; currency_code: string | null;
  market_status: string; activated_at: string | null; readiness: CountryReadiness };
type CountryAudit = { id: string; country_code: string; actor_id: string | null; actor_role: string; reason: string; created_at: string;
  before_state: { enabled?: boolean; market_status?: string } | null; after_state: { enabled: boolean; market_status?: string } };

export function PlatformCountryLaunchPanel({ role }: { role: string | null }) {
  const { language, translateKey } = useI18n();
  const t = (key: string) => translateKey(`platform.country.${key}`);
  const [countries, setCountries] = useState<Country[]>([]);
  const [audit, setAudit] = useState<CountryAudit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ country: Country; enabled: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const canWrite = role === "platform_owner" || role === "platform_admin";
  const reload = useCallback(async () => {
    setError("");
    if (!supabase) { setError("unavailable"); return; }
    const { data, error: loadError } = await supabase.rpc("get_platform_country_launch_status");
    if (loadError || !Array.isArray(data?.countries)) {
      setCountries([]); setAudit([]); setError("unavailable"); return;
    }
    setCountries(data.countries); setAudit(data.audit ?? []);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZoneName: undefined }).format(new Date(value))
    : t("not_configured");
  const openChange = (country: Country, enabled: boolean) => {
    if (enabled && !canActivateCountry(country)) return;
    setTarget({ country, enabled }); setReason(""); setConfirmation(""); request.current = null;
  };

  async function submit() {
    if (!supabase || !target || !canWrite || inFlight.current) return;
    if (target.enabled && !canActivateCountry(target.country)) return;
    const payload = JSON.stringify([target.country.country_code,target.enabled,reason.trim()]);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const { error: saveError } = await supabase.rpc("set_platform_country_launch_status", {
        input_country: target.country.country_code, input_enabled: target.enabled,
        input_reason: reason.trim(), input_confirmation: confirmation, input_request_id: request.current.id,
      });
      if (saveError) throw saveError;
      request.current = null; setTarget(null); await reload();
    } catch { setError("failed"); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="country-launch-section" aria-labelledby="country-launch-title" data-i18n-skip="true">
    <header className="country-launch-heading"><h2 id="country-launch-title">{t("title")}</h2>
      <button className="button secondary" aria-label={t("refresh")} title={t("refresh")} onClick={() => void reload()} disabled={busy}><RefreshCw size={18} /></button>
    </header>
    {error ? <p role="alert">{t(error)}</p> : null}
    {!countries.length && !error ? <p role="status">{t("loading")}</p> : null}
    <div className="country-launch-list">{countries.map((country) => {
      const name = countryNameForCode(country.country_code, language);
      const eligible = canActivateCountry(country);
      const history = audit.filter(entry => entry.country_code === country.country_code);
      return <article className="country-launch-card" key={country.country_code} aria-label={name}>
        <header><h3>{name} <span>{country.country_code}</span></h3><strong>{country.currency_code || t("not_configured")}</strong></header>
        <dl className="country-status-grid">
          <div><dt>{t("registration")}</dt><dd>{t(country.enabled ? "active" : "prepared")}</dd></div>
          <div><dt>{t("market")}</dt><dd>{t(country.market_status === "live" ? (eligible ? "live" : "expired") : country.market_status === "paused" ? "paused" : "market_prepared")}</dd></div>
          <div><dt>{t("activated_at")}</dt><dd>{country.activated_at ? date(country.activated_at) : t("never_activated")}</dd></div>
        </dl>
        <h4>{t("readiness")}</h4>
        <dl className="country-readiness-grid">{COUNTRY_READINESS_KEYS.map(key => {
          const check = country.readiness?.checks?.find(item => item.key === key);
          const status = countryReadinessStatus(check);
          return <div key={key}><dt>{t(key)}</dt><dd data-readiness={status}>{t(status)}</dd>
            {check?.valid_until ? <dd>{t("valid_until")}: {date(check.valid_until)}</dd> : null}
            {key === "required_documents" && check?.document_version_refs?.length ? <dd>{check.document_version_refs.join(" · ")}</dd> : null}
          </div>;
        })}</dl>
        {!eligible ? <p className="country-readiness-notice" id={`country-blocked-${country.country_code}`}>{t("prerequisites_missing")}</p> : null}
        <div className="country-launch-actions">
          {canWrite ? <>
            <button className="button secondary" disabled={busy || !eligible || country.market_status === "live"}
              aria-describedby={!eligible ? `country-blocked-${country.country_code}` : undefined}
              onClick={() => openChange(country, true)}><Settings2 size={18} />{t("enable")}</button>
            {country.enabled ? <button className="button secondary" disabled={busy} onClick={() => openChange(country, false)}><LockKeyhole size={18} />{t("disable")}</button> : null}
          </> : <span><LockKeyhole size={18} />{t("readonly")}</span>}
        </div>
        <h4>{t("history")}</h4>
        <p className="country-audit-caption">{t("history_recent")}</p>
        {history.length ? <ol className="country-audit-list">{history.map(entry => <li key={entry.id}>
          <strong>{t(entry.after_state.enabled ? "activation" : "pause")}</strong>
          <dl>
            <div><dt>{t("before")}</dt><dd>{entry.before_state ? t(entry.before_state.enabled ? "active" : "blocked") : t("not_configured")}</dd></div>
            <div><dt>{t("after")}</dt><dd>{t(entry.after_state.enabled ? "active" : "blocked")}</dd></div>
            <div><dt>{t("actor")}</dt><dd>{entry.actor_id || t("not_configured")}</dd></div>
            <div><dt>{t("at")}</dt><dd><time dateTime={entry.created_at}>{date(entry.created_at)}</time></dd></div>
            <div><dt>{t("reason")}</dt><dd>{entry.reason}</dd></div>
          </dl>
        </li>)}</ol> : <p>{t("no_history")}</p>}
      </article>;
    })}</div>
    <AppDrawer open={Boolean(target)} onClose={() => { if (!busy) setTarget(null); }} title={t("change")} closeLabel={t("close")} size="compact" dismissOnOverlay={!busy}>
      {target ? <form className="form country-launch-confirmation" data-i18n-skip="true" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p>{countryNameForCode(target.country.country_code, language)}: {t(target.enabled ? "enable" : "disable")}</p>
        <label htmlFor="country-change-reason">{t("reason")}</label>
        <textarea className="input" id="country-change-reason" required minLength={10} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
        <label htmlFor="country-change-confirmation">{t("confirmation")}: CONFIRMED:{target.country.country_code}</label>
        <input className="input" id="country-change-confirmation" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
        <button className="button" type="submit" disabled={busy || (target.enabled && !canActivateCountry(target.country)) || reason.trim().length < 10 || confirmation !== `CONFIRMED:${target.country.country_code}`}>{t("submit")}</button>
      </form> : null}
    </AppDrawer>
  </section>;
}
