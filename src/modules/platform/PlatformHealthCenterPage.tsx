import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Clock3,
  ExternalLink, Info, RefreshCw, Search, ShieldAlert, Stethoscope,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UiState } from "../../shared/ui/UiState";
import { LanguageSelector } from "../../shared/i18n/LanguageSelector";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { useAuth } from "../auth/AuthProvider";
import {
  loadPlatformHealthCenter,
  type PlatformHealthCenter,
  type PlatformHealthFinding,
  type PlatformHealthSeverity,
} from "./platformAdminService";
import {
  filterHealthFindings, isHealthSnapshotStale, normalizeHealthFilters,
} from "./platformHealthCenterView.mjs";

const severityIcons = {
  P0: ShieldAlert,
  P1: AlertCircle,
  P2: AlertTriangle,
  P3: Info,
} as const;

function valueText(value: unknown, yes: string, no: string, unavailable: string) {
  if (value === null || value === undefined || value === "") return unavailable;
  if (typeof value === "boolean") return value ? yes : no;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${String(item)}`)
      .join(" · ") || unavailable;
  }
  return String(value).replace(/_/g, " ");
}

export function PlatformHealthCenterPage() {
  const { platformRole, signOut } = useAuth();
  const { language, translateKey } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PlatformHealthCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = useCallback((key: string) => translateKey(`platform.health.${key}`), [translateKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadPlatformHealthCenter());
    } catch (loadError) {
      console.error("Health Center konnte nicht geladen werden.", loadError);
      setData(null);
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const filters = useMemo(() => normalizeHealthFilters(searchParams), [searchParams]);
  const filtered = useMemo(() => filterHealthFindings(
    data?.findings ?? [],
    filters,
    (finding) => `${t(`finding.${finding.type}`)} ${t(`category.${finding.category}`)}`,
  ), [data, filters, t]);
  const healthyTargets = useMemo(() => (data?.restaurant_targets ?? []).filter((target) => {
    if (target.status !== "HEALTHY") return false;
    if (filters.restaurant && target.restaurant_id !== filters.restaurant) return false;
    if (filters.location && target.location_id !== filters.location) return false;
    if (filters.country && target.country !== filters.country) return false;
    if (filters.plan && target.plan !== filters.plan) return false;
    const term = filters.query.trim().toLocaleLowerCase();
    return !term || `${target.restaurant_name} ${target.country ?? ""} ${target.plan ?? ""}`.toLocaleLowerCase().includes(term);
  }), [data, filters]);
  const selected = useMemo(() => data?.findings.find((finding) => finding.id === filters.finding) ?? filtered[0] ?? null, [data, filtered, filters.finding]);
  const stale = data ? isHealthSnapshotStale(data.generated_at) : false;

  const facets = useMemo(() => {
    const findings = data?.findings ?? [];
    const restaurants = new Map<string, string>();
    const locations = new Set<string>();
    const countries = new Set<string>();
    const plans = new Set<string>();
    for (const finding of findings) {
      if (finding.target.restaurant_id) restaurants.set(finding.target.restaurant_id, finding.target.restaurant_name ?? finding.target.restaurant_id);
      if (finding.target.location_id) locations.add(finding.target.location_id);
      if (finding.target.country) countries.add(finding.target.country);
      if (finding.target.plan) plans.add(finding.target.plan);
    }
    return { restaurants: [...restaurants], locations: [...locations], countries: [...countries], plans: [...plans] };
  }, [data]);

  function updateFilter(key: string, value: string, clearFinding = true) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "severity" && value) next.delete("health");
    if (key === "health" && value) next.delete("severity");
    if (clearFinding) next.delete("finding");
    setSearchParams(next, { replace: true });
  }

  const cards: Array<{ key: string; value: number; severity?: PlatformHealthSeverity; icon: typeof ShieldAlert }> = data ? [
    { key: "critical", value: data.summary.critical, severity: "P0", icon: ShieldAlert },
    { key: "errors", value: data.summary.errors, severity: "P1", icon: AlertCircle },
    { key: "warnings", value: data.summary.warnings, severity: "P2", icon: AlertTriangle },
    { key: "notices", value: data.summary.notices, severity: "P3", icon: Info },
    { key: "healthy", value: data.summary.healthy, icon: CheckCircle2 },
  ] : [];

  return (
    <main className="platform-admin-shell platform-health-shell">
      <header className="platform-admin-header">
        <div><span className="admin-brand-kicker">WUXUAI Admin</span><h1>{t("title")}</h1><p>{t("description")}</p></div>
        <div className="platform-admin-header-actions">
          <LanguageSelector />
          <span className="pill">{platformRole ?? t("platformAdmin")}</span>
          <Link className="button secondary" to="/admin/platform"><ArrowLeft size={18} />{t("back")}</Link>
          <button className="button secondary" onClick={() => void load()} type="button"><RefreshCw size={18} />{t("refresh")}</button>
          <button className="button secondary" onClick={signOut} type="button">{t("signOut")}</button>
        </div>
      </header>

      {loading ? <UiState description={t("loadingDescription")} kind="loading" title={t("loading")} /> : null}
      {error ? <UiState action={<button className="button secondary" onClick={() => void load()} type="button">{t("retry")}</button>} description={error} kind="error" title={t("unavailable")} /> : null}

      {data ? <>
        <section className="platform-health-meta" aria-label={t("freshness")}>
          <Clock3 size={18} aria-hidden="true" />
          <span>{stale ? t("stale") : t("snapshot")}</span>
          <time dateTime={data.generated_at}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(data.generated_at))}</time>
          <span>{t("manualRefresh")}</span>
        </section>

        <section className="platform-health-kpis" aria-label={t("summary")}>
          {cards.map((card) => {
            const Icon = card.icon;
            const active = card.severity ? filters.severity === card.severity : filters.health === "HEALTHY";
            return <button aria-pressed={active} className={`card platform-health-kpi severity-${card.severity?.toLowerCase() ?? "healthy"}${active ? " active" : ""}`} key={card.key} onClick={() => card.severity ? updateFilter("severity", active ? "" : card.severity) : updateFilter("health", active ? "" : "HEALTHY")} type="button"><Icon size={22} /><strong>{card.value}</strong><span>{t(card.key)}</span></button>;
          })}
        </section>

        <section className="card platform-health-filters" aria-labelledby="health-filter-title">
          <div className="section-heading"><h2 id="health-filter-title">{t("filters")}</h2><button className="button secondary" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })} type="button">{t("reset")}</button></div>
          <div className="platform-health-filter-grid">
            <label><span>{t("search")}</span><span className="platform-search"><Search size={18} /><input onChange={(event) => updateFilter("query", event.target.value)} placeholder={t("searchPlaceholder")} type="search" value={filters.query} /></span></label>
            <label><span>{t("severity")}</span><select className="input" onChange={(event) => updateFilter("severity", event.target.value)} value={filters.severity}><option value="">{t("all")}</option>{["P0", "P1", "P2", "P3"].map((value) => <option key={value} value={value}>{value} · {t(`severity.${value}`)}</option>)}</select></label>
            <label><span>{t("category")}</span><select className="input" onChange={(event) => updateFilter("category", event.target.value)} value={filters.category}><option value="">{t("all")}</option>{["ONBOARDING", "LOCATION", "LEGAL", "PLAN", "BONUS", "COUNTRY", "SYSTEM"].map((value) => <option key={value} value={value}>{t(`category.${value}`)}</option>)}</select></label>
            <label><span>{t("restaurant")}</span><select className="input" onChange={(event) => updateFilter("restaurant", event.target.value)} value={filters.restaurant}><option value="">{t("all")}</option>{facets.restaurants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label><span>{t("location")}</span><select className="input" onChange={(event) => updateFilter("location", event.target.value)} value={filters.location}><option value="">{t("all")}</option>{facets.locations.map((id) => <option key={id} value={id}>{id.slice(0, 8)}</option>)}</select></label>
            <label><span>{t("country")}</span><select className="input" onChange={(event) => updateFilter("country", event.target.value)} value={filters.country}><option value="">{t("all")}</option>{facets.countries.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>{t("plan")}</span><select className="input" onChange={(event) => updateFilter("plan", event.target.value)} value={filters.plan}><option value="">{t("all")}</option>{facets.plans.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
        </section>

        <section className="platform-health-grid">
          <div className="card platform-health-list-card">
            <div className="section-heading"><h2>{filters.health === "HEALTHY" ? t("healthyRestaurants") : t("findings")}</h2><p className="muted">{filters.health === "HEALTHY" ? healthyTargets.length : filtered.length} {t("results")}</p></div>
            {filters.health === "HEALTHY" ? <div className="platform-health-list">
              {healthyTargets.map((target) => <button className="platform-health-finding healthy" key={target.restaurant_id} onClick={() => navigate(target.route)} type="button"><CheckCircle2 size={21} /><span><strong>{target.restaurant_name}</strong><small>{[target.country, target.plan].filter(Boolean).join(" · ")}</small></span><ExternalLink size={18} /></button>)}
              {healthyTargets.length === 0 ? <div className="empty-state-card"><CheckCircle2 size={30} /><h3>{t("noHealthy")}</h3><p>{t("changeFilters")}</p></div> : null}
            </div> : <div className="platform-health-list">
              {filtered.map((finding) => { const Icon = severityIcons[finding.severity]; return <button aria-pressed={selected?.id === finding.id} className={`platform-health-finding severity-${finding.severity.toLowerCase()}${selected?.id === finding.id ? " active" : ""}`} key={finding.id} onClick={() => updateFilter("finding", finding.id, false)} type="button"><Icon size={21} /><span><strong>{t(`finding.${finding.type}`)}</strong><small>{finding.severity} · {t(`category.${finding.category}`)}{finding.target.restaurant_name ? ` · ${finding.target.restaurant_name}` : ""}</small></span><ExternalLink size={18} /></button>; })}
              {filtered.length === 0 ? <div className="empty-state-card"><Stethoscope size={30} /><h3>{t("empty")}</h3><p>{t("changeFilters")}</p></div> : null}
            </div>}
          </div>

          <aside className="card platform-health-detail" aria-live="polite">
            {filters.health === "HEALTHY" ? <><CheckCircle2 size={28} /><h2>{t("healthyDetail")}</h2><p>{t("healthyDescription")}</p></> : selected ? <FindingDetail finding={selected} t={t} /> : <><Stethoscope size={28} /><h2>{t("selectFinding")}</h2><p>{t("selectFindingDescription")}</p></>}
          </aside>
        </section>
      </> : null}
    </main>
  );
}

function FindingDetail({ finding, t }: { finding: PlatformHealthFinding; t: (key: string) => string }) {
  const Icon = severityIcons[finding.severity];
  const current = valueText(finding.current, t("yes"), t("no"), t("notAvailable"));
  const expected = valueText(finding.expected, t("yes"), t("no"), t("notAvailable"));
  return <>
    <header className="platform-health-detail-heading"><Icon size={25} /><div><span className={`health-severity severity-${finding.severity.toLowerCase()}`}>{finding.severity} · {t(`severity.${finding.severity}`)}</span><h2>{t(`finding.${finding.type}`)}</h2></div></header>
    <dl className="platform-health-detail-list">
      <div><dt>{t("findingType")}</dt><dd>{finding.type}</dd></div>
      <div><dt>{t("category")}</dt><dd>{t(`category.${finding.category}`)}</dd></div>
      <div><dt>{t("cause")}</dt><dd>{t(`cause.${finding.type}`)}</dd></div>
      {finding.target.restaurant_name ? <div><dt>{t("restaurant")}</dt><dd>{finding.target.restaurant_name}</dd></div> : null}
      {finding.target.location_id ? <div><dt>{t("location")}</dt><dd>{finding.target.location_id.slice(0, 8)}</dd></div> : null}
      {finding.target.country ? <div><dt>{t("country")}</dt><dd>{finding.target.country}</dd></div> : null}
      {finding.target.plan ? <div><dt>{t("plan")}</dt><dd>{finding.target.plan}</dd></div> : null}
      <div><dt>{t("current")}</dt><dd>{current}</dd></div>
      <div><dt>{t("expected")}</dt><dd>{expected}</dd></div>
      <div><dt>{t("firstSeen")}</dt><dd>{t("notAvailable")}</dd></div>
      <div><dt>{t("lastChecked")}</dt><dd><time dateTime={finding.last_checked_at}>{new Date(finding.last_checked_at).toLocaleString()}</time></dd></div>
      <div><dt>{t("audit")}</dt><dd>{finding.audit.status === "unavailable" ? t("notAvailable") : finding.audit.event_key ?? finding.audit.status ?? t("notAvailable")}</dd></div>
    </dl>
    <section className="platform-health-recommendation"><h3>{t("recommendedAction")}</h3><p>{t(`recommendation.${finding.recommendation}`)}</p></section>
    <Link className="button primary platform-health-target-link" to={finding.target.route}><ExternalLink size={18} />{t("openTarget")}</Link>
  </>;
}
